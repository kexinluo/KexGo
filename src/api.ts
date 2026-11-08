import { DEMO_TRACK_ID, createDemoTrack } from './demo'
import { createDefaultPreferences } from './utils/preferences'
import type {
  AlignmentDraft,
  AppSettings,
  DataLocation,
  ImportSummary,
  LibrarySnapshot,
  LyricsNotesFile,
  MigrationResult,
  LyricsQuery,
  OnlineLyricsResult,
  PlayerTick,
  SaveLyricsResult,
  Track,
  TrackCheck,
  TrackIssue
} from './types'

const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
export const platform: 'tauri' | 'browser' = isTauri ? 'tauri' : 'browser'

type UnlistenFn = () => void

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return import('@tauri-apps/api/core').then(({ invoke: tauriInvoke }) =>
    tauriInvoke<T>(command, args)
  )
}

/* ------------------------------------------------------------------ */
/* Browser preview backend                                             */
/* ------------------------------------------------------------------ */

const BROWSER_SETTINGS: AppSettings = {
  lastTrackId: null,
  lastPosition: 0,
  volume: 0.78,
  compensationMs: -150,
  queue: null,
  playMode: 'sequential',
  sortMode: 'custom',
  libraryOrder: [],
  theme: 'dark',
  closeToTray: true,
  lyricsFontSize: 15,
  visualizerEnabled: false,
  preferences: createDefaultPreferences()
}

let browserTracks: Track[] = []
let browserSettings: AppSettings = { ...BROWSER_SETTINGS }
let browserAudio: HTMLAudioElement | null = null
let browserTickTimer: number | null = null
let browserTickHandler: ((tick: PlayerTick) => void) | null = null
let browserEnded = false
const browserDrafts = new Map<string, AlignmentDraft>()
const browserTrackFiles = new Map<string, File>()
let browserCustomCss = ''
let browserCustomCssGood = ''
const browserNotes = new Map<string, LyricsNotesFile>()

function uid(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function browserSnapshot(): LibrarySnapshot {
  return {
    tracks: browserTracks.map((track) => ({ ...track })),
    settings: { ...browserSettings }
  }
}

function ensureBrowserAudio(trackId: string): HTMLAudioElement {
  if (browserAudio) return browserAudio
  const audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = browserSettings.volume
  audio.addEventListener('ended', () => {
    browserEnded = true
    emitBrowserTick(trackId)
  })
  browserAudio = audio
  return audio
}

function emitBrowserTick(trackId: string): void {
  if (!browserAudio) return
  browserTickHandler?.({
    trackId,
    position: browserAudio.currentTime,
    duration: Number.isFinite(browserAudio.duration) ? browserAudio.duration : 0,
    playing: !browserAudio.paused,
    volume: browserAudio.volume,
    ended: browserEnded
  })
}

function startBrowserTicker(trackId: string): void {
  if (browserTickTimer !== null) window.clearInterval(browserTickTimer)
  browserTickTimer = window.setInterval(() => emitBrowserTick(trackId), 200)
}

function stopBrowserTicker(): void {
  if (browserTickTimer !== null) window.clearInterval(browserTickTimer)
  browserTickTimer = null
}

function readFileText(file: File): Promise<string> {
  return file.text()
}

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function guessTitleArtist(file: File): { title: string; artist: string } {
  const stem = fileStem(file.name)
  const parts = stem.split(' - ')
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
  }
  return { title: stem, artist: '未知歌手' }
}

function browserDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    const finish = (value: number) => {
      audio.src = ''
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) ? audio.duration : 0)
    })
    audio.addEventListener('error', () => finish(0))
    window.setTimeout(() => finish(Number.isFinite(audio.duration) ? audio.duration : 0), 3500)
    audio.src = url
  })
}

async function importBrowserFiles(files: File[]): Promise<ImportSummary> {
  const audioFiles = files.filter(
    (file) =>
      file.type.startsWith('audio/') || /\.(mp3|flac|m4a|aac|wav|ogg|opus)$/i.test(file.name)
  )
  if (!audioFiles.length) {
    // A text/image file on its own is not a track.
    return {
      added: [],
      skipped: [],
      failed: files.map((file) => ({ path: file.name, reason: '没有找到音频文件' }))
    }
  }
  const lrcFiles = files.filter((file) => /\.lrc$/i.test(file.name))
  const imageFiles = files.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file.name))
  const added: Track[] = []
  const skipped: string[] = []

  for (const file of audioFiles) {
    const duplicate = browserTracks.find(
      (track) => track.title === file.name && track.filePath.startsWith('blob:')
    )
    if (duplicate) {
      skipped.push(file.name)
      continue
    }
    const url = URL.createObjectURL(file)
    browserTrackFiles.set(url, file)
    const { title, artist } = guessTitleArtist(file)
    const duration = await browserDuration(url)
    const stem = fileStem(file.name)
    const matchingLrc =
      lrcFiles.find((lrc) => fileStem(lrc.name).toLowerCase() === stem.toLowerCase()) ?? null
    const matchingCover =
      imageFiles.find((image) => fileStem(image.name).toLowerCase() === stem.toLowerCase()) ??
      imageFiles.find((image) => /^(cover|folder|front)$/i.test(fileStem(image.name))) ??
      null
    const lyricsText = matchingLrc ? await readFileText(matchingLrc) : ''
    const track: Track = {
      id: uid(),
      filePath: url,
      title,
      artist,
      album: '',
      duration,
      coverPath: matchingCover ? URL.createObjectURL(matchingCover) : null,
      lrcPath: matchingLrc ? 'browser-sidecar' : null,
      lyricsText,
      lyricsOrigin: matchingLrc ? 'sidecar' : 'unknown',
      tags: [],
      playCount: 0,
      pauseFade: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    browserTracks.push(track)
    added.push(track)
  }

  return { added, skipped, failed: [] }
}

/* ------------------------------------------------------------------ */
/* Browser lyrics convenience                                          */
/* ------------------------------------------------------------------ */

async function searchLrclibBrowser(query: LyricsQuery): Promise<OnlineLyricsResult[]> {
  const params = new URLSearchParams()
  params.set('track_name', query.trackName)
  if (query.artistName && query.artistName !== '未知歌手') params.set('artist_name', query.artistName)
  if (query.albumName) params.set('album_name', query.albumName)
  const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`LRCLIB 请求失败（${response.status}）`)
  const payload = (await response.json()) as OnlineLyricsResult[]
  return payload
    .filter((item) => Boolean(item.syncedLyrics || item.plainLyrics))
    .slice(0, 8)
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const api = {
  isTauri,

  async getSnapshot(): Promise<LibrarySnapshot> {
    if (isTauri) return invoke<LibrarySnapshot>('get_library_snapshot')
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '1' &&
      browserTracks.length === 0
    ) {
      const demo = createDemoTrack()
      browserTracks = [demo]
      browserSettings = {
        ...browserSettings,
        lastTrackId: DEMO_TRACK_ID,
        lastPosition: 44.5
      }
    }
    return browserSnapshot()
  },

  async validateLibraryPaths(): Promise<TrackIssue[]> {
    if (isTauri) return invoke<TrackIssue[]>('validate_library_paths')
    return []
  },

  async preflightTrack(trackId: string): Promise<TrackCheck> {
    if (isTauri) return invoke<TrackCheck>('preflight_track', { trackId })
    return { status: 'ok', message: '' }
  },

  async chooseAndImportAudio(): Promise<ImportSummary | null> {
    if (!isTauri) return null
    return invoke<ImportSummary | null>('pick_and_import_audio')
  },

  async importPaths(paths: string[]): Promise<ImportSummary> {
    if (isTauri) return invoke<ImportSummary>('import_audio_paths', { paths })
    return { added: [], skipped: [], failed: [] }
  },

  async importBrowserFiles(files: File[]): Promise<ImportSummary> {
    return importBrowserFiles(files)
  },

  async updateTrack(trackId: string, patch: { title: string; artist: string; album: string }): Promise<Track> {
    if (isTauri) return invoke<Track>('update_track', { trackId, ...patch })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    Object.assign(track, patch, { updatedAt: Date.now() })
    return { ...track }
  },

  async setTrackTags(trackId: string, tags: string[]): Promise<Track> {
    if (isTauri) return invoke<Track>('set_track_tags', { trackId, tags })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    track.tags = [...tags]
    track.updatedAt = Date.now()
    return { ...track }
  },

  async setTrackPauseFade(trackId: string, enabled: boolean): Promise<Track> {
    if (isTauri) return invoke<Track>('set_track_pause_fade', { trackId, enabled })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    track.pauseFade = enabled
    track.updatedAt = Date.now()
    return { ...track }
  },

  async getDataLocation(): Promise<DataLocation> {
    if (isTauri) return invoke<DataLocation>('get_data_location')
    return {
      current: '浏览器预览（不持久化）',
      default: '浏览器预览（不持久化）',
      customCssPath: 'custom.css'
    }
  },

  async pickDataDirectory(): Promise<string | null> {
    if (isTauri) return invoke<string | null>('pick_data_directory')
    return null
  },

  async migrateDataDirectory(target: string): Promise<MigrationResult> {
    if (isTauri) return invoke<MigrationResult>('migrate_data_directory', { target })
    throw new Error('浏览器预览不支持迁移数据目录')
  },

  async readCustomCss(): Promise<string> {
    if (isTauri) return invoke<string>('read_custom_css')
    return browserCustomCss
  },

  async saveCustomCss(content: string): Promise<void> {
    if (isTauri) {
      await invoke('save_custom_css', { content })
      return
    }
    browserCustomCss = content
    browserCustomCssGood = content
  },

  async readLastGoodCss(): Promise<string> {
    if (isTauri) return invoke<string>('read_last_good_css')
    return browserCustomCssGood
  },

  async restoreCustomCss(): Promise<void> {
    if (isTauri) {
      await invoke('restore_custom_css')
      return
    }
    browserCustomCss = browserCustomCssGood
  },

  async readLyricsNotes(trackId: string): Promise<LyricsNotesFile | null> {
    if (isTauri) {
      const raw = await invoke<string | null>('read_lyrics_notes', { trackId })
      if (!raw) return null
      return JSON.parse(raw) as LyricsNotesFile
    }
    return browserNotes.get(trackId) ?? null
  },

  async saveLyricsNotes(trackId: string, notes: LyricsNotesFile): Promise<void> {
    if (isTauri) {
      await invoke('save_lyrics_notes', { trackId, content: JSON.stringify(notes) })
      return
    }
    browserNotes.set(trackId, structuredClone(notes))
  },

  async setSpeed(speed: number): Promise<void> {
    if (isTauri) {
      await invoke('set_speed', { speed })
      return
    }
    if (browserAudio) browserAudio.playbackRate = speed
  },

  async incrementPlayCount(trackId: string): Promise<Track> {
    if (isTauri) return invoke<Track>('increment_play_count', { trackId })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    track.playCount = (track.playCount ?? 0) + 1
    track.updatedAt = Date.now()
    return { ...track }
  },

  async savePlaylistJson(content: string, suggestedName: string): Promise<string | null> {
    if (isTauri) {
      return invoke<string | null>('save_playlist_json', { content, suggestedName })
    }
    const name = /\.json$/i.test(suggestedName) ? suggestedName : `${suggestedName}.json`
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    return name
  },

  async pickPlaylistJson(): Promise<string | null> {
    if (isTauri) return invoke<string | null>('pick_playlist_json')
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      input.addEventListener('cancel', () => resolve(null), { once: true })
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        try {
          resolve(await file.text())
        } catch {
          resolve(null)
        }
      }
      input.click()
    })
  },

  async removeTrack(trackId: string): Promise<void> {
    if (isTauri) {
      await invoke('remove_track', { trackId })
      return
    }
    browserTracks = browserTracks.filter((track) => track.id !== trackId)
    if (browserSettings.lastTrackId === trackId) browserSettings.lastTrackId = null
  },

  async pickLrc(trackId: string): Promise<Track | null> {
    if (!isTauri) return null
    return invoke<Track | null>('pick_lrc_for_track', { trackId })
  },

  async setPlainLyrics(trackId: string, text: string, origin: string): Promise<Track> {
    if (isTauri) return invoke<Track>('set_plain_lyrics', { trackId, text, origin })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    track.lyricsText = text
    track.lrcPath = null
    track.lyricsOrigin = origin as Track['lyricsOrigin']
    track.updatedAt = Date.now()
    return { ...track }
  },

  async saveLyrics(
    trackId: string,
    content: string,
    origin: string,
    writeSidecar: boolean
  ): Promise<{ track: Track; result: SaveLyricsResult }> {
    if (isTauri) return invoke('save_lyrics', { trackId, content, origin, writeSidecar })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    track.lyricsText = content
    track.lrcPath = 'browser-managed'
    track.lyricsOrigin = origin as Track['lyricsOrigin']
    track.updatedAt = Date.now()
    browserDrafts.delete(trackId)
    return {
      track: { ...track },
      result: { lrcPath: 'browser-managed', sidecarPath: null, warning: null }
    }
  },

  async exportLrc(trackId: string, content: string, suggestedName: string): Promise<string | null> {
    if (isTauri) {
      return invoke<string | null>('export_lrc', { trackId, content, suggestedName })
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = /\.lrc$/i.test(suggestedName) ? suggestedName : `${suggestedName}.lrc`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    return anchor.download
  },

  async pickCover(trackId: string): Promise<Track | null> {
    if (!isTauri) return null
    return invoke<Track | null>('pick_cover_for_track', { trackId })
  },

  async getCoverUrl(track: Track): Promise<string | null> {
    if (!track.coverPath) return null
    if (!isTauri) return track.coverPath
    return invoke<string | null>('cover_data_url', { trackId: track.id })
  },

  async searchLyrics(query: LyricsQuery): Promise<OnlineLyricsResult[]> {
    if (isTauri) return invoke<OnlineLyricsResult[]>('search_online_lyrics', { query })
    return searchLrclibBrowser(query)
  },

  async saveDraft(draft: AlignmentDraft): Promise<void> {
    if (isTauri) {
      await invoke('save_alignment_draft', { trackId: draft.trackId, draft })
      return
    }
    browserDrafts.set(draft.trackId, draft)
    try {
      localStorage.setItem(`kexgo.draft.${draft.trackId}`, JSON.stringify(draft))
    } catch {
      /* preview only */
    }
  },

  async loadDraft(trackId: string): Promise<AlignmentDraft | null> {
    if (isTauri) return invoke<AlignmentDraft | null>('load_alignment_draft', { trackId })
    const cached = browserDrafts.get(trackId)
    if (cached) return cached
    try {
      const raw = localStorage.getItem(`kexgo.draft.${trackId}`)
      if (!raw) return null
      return JSON.parse(raw) as AlignmentDraft
    } catch {
      return null
    }
  },

  async clearDraft(trackId: string): Promise<void> {
    if (isTauri) {
      await invoke('clear_alignment_draft', { trackId })
      return
    }
    browserDrafts.delete(trackId)
    try {
      localStorage.removeItem(`kexgo.draft.${trackId}`)
    } catch {
      /* preview only */
    }
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    if (isTauri) {
      await invoke('save_settings', { settings })
      return
    }
    browserSettings = { ...settings }
  },

  async playTrack(trackId: string, startAt = 0): Promise<PlayerTick> {
    if (isTauri) return invoke<PlayerTick>('play_track', { trackId, startAt })
    const track = browserTracks.find((item) => item.id === trackId)
    if (!track) throw new Error('歌曲不存在')
    const audio = ensureBrowserAudio(trackId)
    if (audio.src !== track.filePath) {
      audio.src = track.filePath
      audio.load()
    }
    browserEnded = false
    audio.currentTime = Math.max(0, startAt)
    await audio.play()
    startBrowserTicker(trackId)
    emitBrowserTick(trackId)
    return {
      trackId,
      position: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : track.duration,
      playing: true,
      volume: audio.volume,
      ended: false
    }
  },

  async pause(fadeMs = 0): Promise<void> {
    if (isTauri) {
      await invoke('pause_audio', { fadeMs })
      return
    }
    browserAudio?.pause()
  },

  async resume(fadeMs = 0): Promise<void> {
    if (isTauri) {
      await invoke('resume_audio', { fadeMs })
      return
    }
    await browserAudio?.play()
  },

  async seek(seconds: number): Promise<void> {
    if (isTauri) {
      await invoke('seek_audio', { seconds })
      return
    }
    if (browserAudio) browserAudio.currentTime = Math.max(0, seconds)
  },

  async setVolume(volume: number, fadeMs = 0): Promise<void> {
    if (isTauri) {
      await invoke('set_volume', { volume, fadeMs })
      return
    }
    const target = Math.max(0, Math.min(1, volume))
    if (browserAudio) {
      browserAudio.volume = target
    }
    browserSettings.volume = target
  },

  async stop(): Promise<void> {
    if (isTauri) {
      await invoke('stop_audio')
      return
    }
    browserAudio?.pause()
    stopBrowserTicker()
  },

  async onPlayerTick(handler: (tick: PlayerTick) => void): Promise<UnlistenFn> {
    if (isTauri) {
      const { listen } = await import('@tauri-apps/api/event')
      return listen<PlayerTick>('player:tick', (event) => handler(event.payload))
    }
    browserTickHandler = handler
    return () => {
      browserTickHandler = null
      stopBrowserTicker()
    }
  },

  async onFileDrop(handler: (paths: string[]) => void): Promise<UnlistenFn> {
    if (!isTauri) return () => undefined
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    return getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') handler(event.payload.paths)
    })
  },

  async onCloseRequested(shouldHide: () => boolean): Promise<UnlistenFn> {
    if (!isTauri) return () => undefined
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow().onCloseRequested(async (event) => {
      if (!shouldHide()) return
      event.preventDefault()
      await getCurrentWindow().hide()
    })
  },

  async onTrayAction(handler: (action: string) => void): Promise<UnlistenFn> {
    if (!isTauri) return () => undefined
    const { listen } = await import('@tauri-apps/api/event')
    return listen<string>('tray:action', (event) => handler(event.payload))
  },

  async onMinimized(shouldHide: () => boolean): Promise<UnlistenFn> {
    if (!isTauri) return () => undefined
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    let timer: number | null = null
    const unlisten = await win.onResized(() => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(async () => {
        timer = null
        if (!shouldHide()) return
        if (await win.isMinimized()) await win.hide()
      }, 140)
    })
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      unlisten()
    }
  }
}
