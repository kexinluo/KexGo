import { computed, reactive } from 'vue'
import { api } from '../api'
import type {
  AppSettings,
  ImportSummary,
  LibrarySnapshot,
  LyricsQuery,
  OnlineLyricsResult,
  SaveLyricsResult,
  ThemeToastKind,
  ToastMessage,
  Track
} from '../types'
import { activeLineIndex, parseLyrics, timedLineCount } from '../utils/lrc'
import { clamp } from '../utils/time'

export type LyricsLookupState = 'idle' | 'searching' | 'not-found' | 'error'

interface AppState {
  booted: boolean
  booting: boolean
  tracks: Track[]
  settings: AppSettings
  currentTrackId: string | null
  position: number
  duration: number
  volume: number
  playing: boolean
  audioLoading: boolean
  activeView: 'player' | 'align'
  lyricsModalOpen: boolean
  editModalOpen: boolean
  searchFocusNonce: number
  lyricsLookup: LyricsLookupState
  lookupError: string
  pendingAlignText: string
  coverUrls: Record<string, string>
  toasts: ToastMessage[]
  importBusy: boolean
  dragActive: boolean
  settingsRevision: number
}

const state = reactive<AppState>({
  booted: false,
  booting: true,
  tracks: [],
  settings: {
    lastTrackId: null,
    lastPosition: 0,
    volume: 0.78,
    compensationMs: -150
  },
  currentTrackId: null,
  position: 0,
  duration: 0,
  volume: 0.78,
  playing: false,
  audioLoading: false,
  activeView: 'player',
  lyricsModalOpen: false,
  editModalOpen: false,
  searchFocusNonce: 0,
  lyricsLookup: 'idle',
  lookupError: '',
  pendingAlignText: '',
  coverUrls: {},
  toasts: [],
  importBusy: false,
  dragActive: false,
  settingsRevision: 0
})

let toastCounter = 0
let audioTrackId: string | null = null
let tickUnlisten: (() => void) | null = null
let loadSequence = 0
let saveSettingsTimer: number | null = null
let lastSettingsWrite = 0
let autoLookupAttempts = new Set<string>()
let endedForTrack: string | null = null

const currentTrack = computed(
  () => state.tracks.find((track) => track.id === state.currentTrackId) ?? null
)

const currentLyrics = computed(() => {
  const text = currentTrack.value?.lyricsText ?? ''
  return parseLyrics(text)
})

const timedLines = computed(() => timedLineCount(currentLyrics.value.lines))

const activeLyricIndex = computed(() => {
  if (!currentLyrics.value.hasTimestamps) return -1
  return activeLineIndex(currentLyrics.value.lines, state.position * 1000)
})

const progress = computed(() => {
  if (!state.duration) return 0
  return clamp(state.position / state.duration, 0, 1)
})

const displayDuration = computed(() => state.duration || currentTrack.value?.duration || 0)

const currentCover = computed(() =>
  state.currentTrackId ? state.coverUrls[state.currentTrackId] ?? null : null
)

const isBrowser = computed(() => !api.isTauri)

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return '发生未知错误'
}

export function toast(kind: ThemeToastKind, title: string, detail?: string): void {
  toastCounter += 1
  const message: ToastMessage = { id: toastCounter, kind, title, detail }
  state.toasts.push(message)
  window.setTimeout(() => {
    const index = state.toasts.findIndex((item) => item.id === message.id)
    if (index >= 0) state.toasts.splice(index, 1)
  }, kind === 'error' ? 6500 : 4200)
}

function dismissToast(id: number): void {
  const index = state.toasts.findIndex((item) => item.id === id)
  if (index >= 0) state.toasts.splice(index, 1)
}

function replaceTrack(updated: Track): void {
  const index = state.tracks.findIndex((track) => track.id === updated.id)
  if (index >= 0) state.tracks.splice(index, 1, updated)
  else state.tracks.push(updated)
  if (updated.id === state.currentTrackId) {
    state.duration = updated.duration || state.duration
  }
}

function maybeApplyDuration(): void {
  if (state.duration <= 0 && currentTrack.value) state.duration = currentTrack.value.duration
}

async function loadCover(track: Track, force = false): Promise<void> {
  if (state.coverUrls[track.id] && !force) return
  try {
    const url = await api.getCoverUrl(track)
    if (url) state.coverUrls[track.id] = url
    else if (force) delete state.coverUrls[track.id]
  } catch {
    // A missing cover is a visual fallback, not an app error.
  }
}

async function preloadCovers(): Promise<void> {
  for (const track of state.tracks) {
    void loadCover(track)
  }
}

function buildSettings(): AppSettings {
  return {
    lastTrackId: state.currentTrackId,
    lastPosition: Math.max(0, state.position),
    volume: state.volume,
    compensationMs: state.settings.compensationMs
  }
}

async function saveSettingsNow(): Promise<void> {
  if (!state.booted) return
  const snapshot = buildSettings()
  state.settings = snapshot
  try {
    await api.saveSettings(snapshot)
    lastSettingsWrite = Date.now()
  } catch {
    // Settings persistence must never interrupt playback.
  }
}

function scheduleSettingsSave(): void {
  if (saveSettingsTimer !== null) return
  saveSettingsTimer = window.setTimeout(() => {
    saveSettingsTimer = null
    void saveSettingsNow()
  }, 600)
}

function schedulePeriodicSettingsSave(): void {
  if (Date.now() - lastSettingsWrite > 5000) {
    void saveSettingsNow()
  }
}

async function handleTick(tick: { trackId: string | null; position: number; duration: number; playing: boolean; volume: number; ended: boolean }): Promise<void> {
  if (!tick.trackId) {
    state.playing = false
    return
  }
  if (tick.trackId !== state.currentTrackId) return
  audioTrackId = tick.trackId
  state.position = Math.max(0, tick.position)
  if (Number.isFinite(tick.duration) && tick.duration > 0) state.duration = tick.duration
  state.playing = tick.playing
  if (tick.ended && endedForTrack !== tick.trackId) {
    endedForTrack = tick.trackId
    state.playing = false
    await handleTrackEnded()
  }
  maybeApplyDuration()
  schedulePeriodicSettingsSave()
}

async function handleTrackEnded(): Promise<void> {
  const index = state.tracks.findIndex((track) => track.id === state.currentTrackId)
  if (index < 0) return
  state.position = displayDuration.value
  state.playing = false
  audioTrackId = null
  // While the aligner is open, never jump to another song mid-session.
  if (state.activeView === 'align') {
    await saveSettingsNow()
    return
  }
  if (index < state.tracks.length - 1) {
    await selectTrack(state.tracks[index + 1], { autoplay: true, rememberPosition: false })
  } else {
    await saveSettingsNow()
  }
}

async function init(): Promise<void> {
  if (state.booted) return
  try {
    const snapshot: LibrarySnapshot = await api.getSnapshot()
    state.tracks = snapshot.tracks
    state.settings = snapshot.settings
    state.volume = snapshot.settings.volume
    state.settings.compensationMs = snapshot.settings.compensationMs ?? -150
    void api.setVolume(state.volume)
    const remembered = snapshot.tracks.find((track) => track.id === snapshot.settings.lastTrackId)
    if (remembered) {
      state.currentTrackId = remembered.id
      state.position = Math.min(snapshot.settings.lastPosition, remembered.duration || 0)
      state.duration = remembered.duration
    } else if (snapshot.tracks.length > 0) {
      state.currentTrackId = snapshot.tracks[0].id
      state.duration = snapshot.tracks[0].duration
    }
    await preloadCovers()
    tickUnlisten = await api.onPlayerTick(handleTick)
    window.addEventListener('beforeunload', () => {
      void saveSettingsNow()
    })
    if (currentTrack.value && !currentTrack.value.lyricsText) {
      void maybeFindLyricsAutomatically(currentTrack.value)
    }
  } catch (error) {
    toast('error', '音乐库加载失败', getErrorMessage(error))
  } finally {
    state.booting = false
    state.booted = true
  }
}

async function selectTrack(
  track: Track,
  options: { autoplay?: boolean; rememberPosition?: boolean } = {}
): Promise<void> {
  const autoplay = options.autoplay ?? true
  const remember = options.rememberPosition ?? true
  if (track.id === state.currentTrackId) {
    if (autoplay) await togglePlay()
    return
  }
  if (remember && state.currentTrackId) void saveSettingsNow()
  const sequence = ++loadSequence
  state.currentTrackId = track.id
  state.position = 0
  state.duration = track.duration
  state.activeView = 'player'
  endedForTrack = null
  state.lyricsLookup = 'idle'
  state.lookupError = ''
  state.playing = false
  audioTrackId = null
  void loadCover(track)
  if (autoplay) {
    await startPlayback(track.id, 0, sequence)
  } else {
    await api.stop().catch(() => undefined)
  }
  if (!track.lyricsText) void maybeFindLyricsAutomatically(track)
  scheduleSettingsSave()
}

async function startPlayback(trackId: string, startAt: number, sequence?: number): Promise<void> {
  state.audioLoading = true
  try {
    const tick = await api.playTrack(trackId, Math.max(0, startAt))
    if (sequence !== undefined && sequence !== loadSequence) return
    audioTrackId = trackId
    state.position = tick.position
    if (Number.isFinite(tick.duration) && tick.duration > 0) state.duration = tick.duration
    state.playing = true
    endedForTrack = null
  } catch (error) {
    if (sequence !== undefined && sequence !== loadSequence) return
    state.playing = false
    toast('error', '无法播放这首歌', getErrorMessage(error))
  } finally {
    if (sequence === undefined || sequence === loadSequence) state.audioLoading = false
  }
}

async function togglePlay(): Promise<void> {
  const track = currentTrack.value
  if (!track) {
    if (state.tracks.length > 0) await selectTrack(state.tracks[0])
    return
  }
  if (state.audioLoading) return
  if (state.playing) {
    state.playing = false
    await api.pause().catch(() => undefined)
    scheduleSettingsSave()
    return
  }
  const atEnd = state.position >= displayDuration.value - 0.25
  if (audioTrackId !== track.id || atEnd) {
    await startPlayback(track.id, atEnd ? 0 : state.position)
    if (atEnd) state.position = 0
  } else {
    try {
      await api.resume()
      state.playing = true
    } catch (error) {
      toast('error', '恢复播放失败', getErrorMessage(error))
    }
  }
  scheduleSettingsSave()
}

async function seekTo(seconds: number): Promise<void> {
  const target = clamp(seconds, 0, displayDuration.value || seconds)
  state.position = target
  if (state.playing || audioTrackId === state.currentTrackId) {
    try {
      await api.seek(target)
    } catch {
      // Keep the local position; the next tick corrects us if needed.
    }
  }
  scheduleSettingsSave()
}

async function step(direction: 1 | -1, options: { auto?: boolean } = {}): Promise<void> {
  if (state.tracks.length === 0) return
  const currentIndex = state.tracks.findIndex((track) => track.id === state.currentTrackId)
  if (currentIndex < 0) {
    await selectTrack(state.tracks[0])
    return
  }
  let nextIndex = currentIndex + direction
  if (nextIndex < 0) nextIndex = options.auto ? 0 : state.tracks.length - 1
  if (nextIndex >= state.tracks.length) {
    nextIndex = options.auto ? state.tracks.length - 1 : 0
  }
  if (nextIndex === currentIndex) {
    await seekTo(0)
    if (!state.playing) await togglePlay()
    return
  }
  const autoplay = options.auto ? true : state.playing
  const next = state.tracks[nextIndex]
  const sequence = ++loadSequence
  state.currentTrackId = next.id
  state.position = 0
  state.duration = next.duration
  state.activeView = 'player'
  endedForTrack = null
  state.audioLoading = false
  audioTrackId = null
  state.lyricsLookup = 'idle'
  void loadCover(next)
  if (autoplay) await startPlayback(next.id, 0, sequence)
  else {
    state.playing = false
    await api.stop().catch(() => undefined)
  }
  if (!next.lyricsText) void maybeFindLyricsAutomatically(next)
  scheduleSettingsSave()
}

async function setVolume(value: number): Promise<void> {
  const volume = clamp(value, 0, 1)
  state.volume = volume
  await api.setVolume(volume).catch(() => undefined)
  scheduleSettingsSave()
}

function setCompensation(value: number): void {
  const next = clamp(Math.round(value), -2000, 2000)
  state.settings.compensationMs = next
  scheduleSettingsSave()
}

async function updateMetadata(trackId: string, patch: { title: string; artist: string; album: string }): Promise<void> {
  const updated = await api.updateTrack(trackId, patch)
  replaceTrack(updated)
  toast('success', '歌曲信息已更新')
  state.editModalOpen = false
}

async function removeTrack(trackId: string): Promise<void> {
  const track = state.tracks.find((item) => item.id === trackId)
  if (!track) return
  const isCurrent = trackId === state.currentTrackId
  try {
    await api.stop()
    await api.removeTrack(trackId)
    state.tracks = state.tracks.filter((item) => item.id !== trackId)
    if (isCurrent) {
      audioTrackId = null
      state.playing = false
      state.position = 0
      state.currentTrackId = state.tracks[0]?.id ?? null
      state.duration = state.tracks[0]?.duration ?? 0
      if (state.currentTrackId) {
        const next = state.tracks[0]
        void loadCover(next)
        if (!next.lyricsText) void maybeFindLyricsAutomatically(next)
      }
    }
    state.editModalOpen = false
    toast('success', '已从曲库移除', '原始音频文件不会被删除')
    await saveSettingsNow()
  } catch (error) {
    toast('error', '移除失败', getErrorMessage(error))
  }
}

async function importResult(summary: ImportSummary | null): Promise<void> {
  if (!summary) return
  if (summary.added.length === 0) {
    if (summary.skipped.length > 0) {
      toast('info', '这些歌曲已经在曲库里了')
    } else if (summary.failed.length > 0) {
      toast('error', '导入失败', summary.failed[0]?.reason ?? '无法读取音频文件')
    }
    return
  }
  state.tracks.push(...summary.added)
  void preloadCovers()
  const warnings = summary.failed.length
  toast(
    'success',
    `已导入 ${summary.added.length} 首歌曲`,
    warnings > 0 ? `另有 ${warnings} 个文件未能读取` : '同名 LRC 与封面已自动完成关联'
  )
  await selectTrack(summary.added[0], { autoplay: true })
}

async function chooseAudio(): Promise<void> {
  if (state.importBusy) return
  state.importBusy = true
  try {
    if (api.isTauri) {
      const summary = await api.chooseAndImportAudio()
      await importResult(summary)
    }
  } catch (error) {
    toast('error', '导入失败', getErrorMessage(error))
  } finally {
    state.importBusy = false
  }
}

async function importPaths(paths: string[]): Promise<void> {
  if (!paths.length || state.importBusy) return
  state.importBusy = true
  try {
    const summary = await api.importPaths(paths)
    await importResult(summary)
  } catch (error) {
    toast('error', '导入失败', getErrorMessage(error))
  } finally {
    state.importBusy = false
  }
}

async function importBrowserFiles(files: File[]): Promise<void> {
  if (!files.length || state.importBusy) return
  state.importBusy = true
  try {
    const summary = await api.importBrowserFiles(files)
    await importResult(summary)
  } catch (error) {
    toast('error', '导入失败', getErrorMessage(error))
  } finally {
    state.importBusy = false
  }
}

async function pickLrc(): Promise<void> {
  const track = currentTrack.value
  if (!track) return
  if (!api.isTauri) {
    toast('info', '浏览器预览模式', '桌面版可直接选择 LRC 文件。你也可以拖入 .lrc 与歌曲文件。')
    return
  }
  try {
    const updated = await api.pickLrc(track.id)
    if (!updated) return
    replaceTrack(updated)
    state.lyricsLookup = 'idle'
    toast('success', 'LRC 已导入并关联')
  } catch (error) {
    toast('error', 'LRC 导入失败', getErrorMessage(error))
  }
}

async function pickCover(): Promise<void> {
  const track = currentTrack.value
  if (!track) return
  if (!api.isTauri) {
    toast('info', '浏览器预览模式', '桌面版支持选择本地封面并复制到应用数据目录。')
    return
  }
  try {
    const updated = await api.pickCover(track.id)
    if (!updated) return
    replaceTrack(updated)
    await loadCover(updated, true)
    toast('success', '封面已更新', '已复制到 KexGo 的应用数据目录')
  } catch (error) {
    toast('error', '封面更新失败', getErrorMessage(error))
  }
}

async function getLyrics(query: LyricsQuery): Promise<OnlineLyricsResult[]> {
  return api.searchLyrics(query)
}

function pickBestSynced(results: OnlineLyricsResult[], targetDuration: number): OnlineLyricsResult | null {
  const synced = results
    .filter((result) => Boolean(result.syncedLyrics?.trim()))
    .sort((a, b) => {
      const aDiff = a.duration && targetDuration ? Math.abs(a.duration - targetDuration) : 999
      const bDiff = b.duration && targetDuration ? Math.abs(b.duration - targetDuration) : 999
      return aDiff - bDiff
    })
  if (synced.length === 0) return null
  const best = synced[0]
  if (targetDuration > 0 && best.duration && Math.abs(best.duration - targetDuration) > 6) {
    return null
  }
  return best
}

async function maybeFindLyricsAutomatically(track: Track): Promise<void> {
  if (!track.lyricsText || autoLookupAttempts.has(track.id)) return
  autoLookupAttempts.add(track.id)
  state.lyricsLookup = 'searching'
  state.lookupError = ''
  try {
    const results = await api.searchLyrics({
      trackName: track.title,
      artistName: track.artist,
      albumName: track.album || undefined,
      duration: track.duration || undefined
    })
    if (state.currentTrackId !== track.id) return
    const latest = state.tracks.find((item) => item.id === track.id)
    if (latest?.lyricsText) {
      state.lyricsLookup = 'idle'
      return
    }
    const match = pickBestSynced(results, track.duration)
    if (match?.syncedLyrics) {
      await applyOnlineLyrics(match, false, true)
      state.lyricsLookup = 'idle'
      toast('success', '已从 LRCLIB 找到同步歌词', '如果对时间不满意，可以直接快速对轴微调')
    } else {
      state.lyricsLookup = 'not-found'
    }
  } catch (error) {
    if (state.currentTrackId !== track.id) return
    state.lyricsLookup = 'error'
    state.lookupError = getErrorMessage(error)
  }
}

async function applyOnlineLyrics(
  result: OnlineLyricsResult,
  openAlign = false,
  quiet = false
): Promise<void> {
  const track = currentTrack.value
  if (!track) return
  const synced = result.syncedLyrics?.trim()
  const plain = result.plainLyrics?.trim()
  try {
    if (synced) {
      const saved = await api.saveLyrics(track.id, `${synced}\n`, 'lrclib', false)
      replaceTrack(saved.track)
      state.lyricsLookup = 'idle'
      state.lyricsModalOpen = false
      if (!quiet) toast('success', '已使用在线 LRC', '可以随时进入快速对轴微调')
      if (openAlign) openAlignment(`${synced}\n`)
    } else if (plain) {
      const updated = await api.setPlainLyrics(track.id, plain, 'lrclib')
      replaceTrack(updated)
      state.lyricsLookup = 'idle'
      state.lyricsModalOpen = false
      if (!quiet) toast('success', '已导入纯文本歌词', '播放一遍，按空格即可完成逐行对轴')
      if (openAlign) openAlignment(plain)
    } else {
      toast('warning', '这条结果没有可用歌词')
    }
  } catch (error) {
    toast('error', '歌词保存失败', getErrorMessage(error))
  }
}

function openAlignment(text?: string): void {
  const content = text ?? currentTrack.value?.lyricsText ?? ''
  if (!content.trim()) {
    state.lyricsModalOpen = true
    toast('info', '先准备一份歌词', '可以在线找词，或粘贴纯文本歌词后开始对轴。')
    return
  }
  state.pendingAlignText = text ?? ''
  state.activeView = 'align'
}

function closeAlignment(): void {
  state.activeView = 'player'
  state.pendingAlignText = ''
}

async function saveAlignedLyrics(
  trackId: string,
  content: string,
  writeSidecar: boolean
): Promise<{ track: Track; result: SaveLyricsResult }> {
  const response = await api.saveLyrics(trackId, content, 'manual', writeSidecar)
  replaceTrack(response.track)
  await saveSettingsNow()
  document.title = `KexGo — ${response.track.title}`
  return response
}

function openLyricsModal(): void {
  state.lyricsModalOpen = true
  state.searchFocusNonce += 1
}

function closeLyricsModal(): void {
  state.lyricsModalOpen = false
}

function openEditModal(): void {
  if (currentTrack.value) state.editModalOpen = true
}

function closeEditModal(): void {
  state.editModalOpen = false
}

function setDragActive(value: boolean): void {
  state.dragActive = value
}

export function useApp() {
  return {
    state,
    currentTrack,
    currentCover,
    currentLyrics,
    timedLines,
    activeLyricIndex,
    progress,
    displayDuration,
    isBrowser,
    api,
    init,
    toast,
    dismissToast,
    selectTrack,
    togglePlay,
    seekTo,
    step,
    setVolume,
    setCompensation,
    updateMetadata,
    removeTrack,
    chooseAudio,
    importPaths,
    importBrowserFiles,
    pickLrc,
    pickCover,
    getLyrics,
    applyOnlineLyrics,
    openAlignment,
    closeAlignment,
    saveAlignedLyrics,
    openLyricsModal,
    closeLyricsModal,
    openEditModal,
    closeEditModal,
    setDragActive,
    saveSettingsNow,
    loadCover,
    maybeFindLyricsAutomatically
  }
}
