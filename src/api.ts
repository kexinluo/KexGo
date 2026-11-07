import { DEMO_TRACK_ID, createDemoTrack } from './demo'
import type {
  AlignmentDraft,
  AppSettings,
  ImportSummary,
  LibrarySnapshot,
  LyricsQuery,
  OnlineLyricsResult,
  PlayerTick,
  SaveLyricsResult,
  Track
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
  compensationMs: -150
}

let browserTracks: Track[] = []
let browserSettings: AppSettings = { ...BROWSER_SETTINGS }
let browserAudio: HTMLAudioElement | null = null
let browserTickTimer: number | null = null
let browserTickHandler: ((tick: PlayerTick) => void) | null = null
let browserEnded = false
const browserDrafts = new Map<string, AlignmentDraft>()
const browserTrackFiles = new Map<string, File>()

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

  async pause(): Promise<void> {
    if (isTauri) {
      await invoke('pause_audio')
      return
    }
    browserAudio?.pause()
  },

  async resume(): Promise<void> {
    if (isTauri) {
      await invoke('resume_audio')
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

  async setVolume(volume: number): Promise<void> {
    if (isTauri) {
      await invoke('set_volume', { volume })
      return
    }
    if (browserAudio) browserAudio.volume = Math.max(0, Math.min(1, volume))
    browserSettings.volume = volume
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
  }
}
