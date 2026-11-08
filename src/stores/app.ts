import { computed, reactive, watch } from 'vue'
import { api } from '../api'
import type {
  AppPreferences,
  AppSettings,
  DataLocation,
  ImportIssue,
  ImportSummary,
  LibrarySnapshot,
  LibrarySortMode,
  LyricsNotesFile,
  LyricsQuery,
  OnlineLyricsResult,
  PlayMode,
  SaveLyricsResult,
  ThemeMode,
  ThemeToastKind,
  ToastMessage,
  Track,
  TrackIssue,
  TrackIssueStatus
} from '../types'
import { activeLineIndex, parseLyrics, timedLineCount } from '../utils/lrc'
import {
  buildPlaylistFile,
  matchPlaylist,
  parsePlaylistFile,
  serializePlaylist
} from '../utils/playlist'
import {
  moveQueueItem as reorderQueue,
  normalizeQueue,
  randomNextIndex,
  sequentialNextIndex
} from '../utils/queue'
import {
  accentSoftColor,
  accentTextColor,
  clampLyricsFontSize,
  createDefaultPreferences,
  mixHex,
  normalizePreferences,
  normalizeTheme,
  onAccentColor,
  resolveTheme
} from '../utils/preferences'
import { collectTagHistory } from '../utils/tags'
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
  queue: string[]
  playMode: PlayMode
  sortMode: LibrarySortMode
  libraryOrder: string[]
  selectedTags: string[]
  queueOpen: boolean
  queueBusy: boolean
  settingsOpen: boolean
  theme: ThemeMode
  systemTheme: 'dark' | 'light'
  closeToTray: boolean
  lyricsFontSize: number
  visualizerEnabled: boolean
  preferences: AppPreferences
  playbackRate: number
  dataLocation: DataLocation | null
  dataMigrationBusy: boolean
  customCssDraft: string
  customCssError: string
  customCssBusy: boolean
  lyricsNotes: LyricsNotesFile | null
  lyricsNotesOpen: boolean
  lyricsModalOpen: boolean
  editModalOpen: boolean
  searchFocusNonce: number
  lyricsLookup: LyricsLookupState
  lookupError: string
  pendingAlignText: string
  coverUrls: Record<string, string>
  toasts: ToastMessage[]
  trackIssues: Record<string, TrackIssue>
  importBusy: boolean
  importIssues: ImportIssue[]
  importIssuesOpen: boolean
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
  },
  currentTrackId: null,
  position: 0,
  duration: 0,
  volume: 0.78,
  playing: false,
  audioLoading: false,
  activeView: 'player',
  queue: [],
  playMode: 'sequential',
  sortMode: 'custom',
  libraryOrder: [],
  selectedTags: [],
  queueOpen: false,
  queueBusy: false,
  settingsOpen: false,
  theme: 'dark',
  systemTheme: 'dark',
  closeToTray: true,
  lyricsFontSize: 15,
  visualizerEnabled: false,
  preferences: createDefaultPreferences(),
  playbackRate: 1,
  dataLocation: null,
  dataMigrationBusy: false,
  customCssDraft: '',
  customCssError: '',
  customCssBusy: false,
  lyricsNotes: null,
  lyricsNotesOpen: false,
  lyricsModalOpen: false,
  editModalOpen: false,
  searchFocusNonce: 0,
  lyricsLookup: 'idle',
  lookupError: '',
  pendingAlignText: '',
  coverUrls: {},
  toasts: [],
  trackIssues: {},
  importBusy: false,
  importIssues: [],
  importIssuesOpen: false,
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

const currentPlaybackIssue = computed(() =>
  state.currentTrackId ? state.trackIssues[state.currentTrackId] ?? null : null
)

const queueTracks = computed(() => {
  const byId = new Map(state.tracks.map((track) => [track.id, track]))
  return state.queue.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track))
})

const currentQueueIndex = computed(() => {
  if (!state.currentTrackId) return -1
  return state.queue.indexOf(state.currentTrackId)
})

const tagHistory = computed(() => collectTagHistory(state.tracks))

function normalizePlayMode(value: unknown): PlayMode {
  return value === 'repeat-one' || value === 'shuffle' ? value : 'sequential'
}

function normalizeSortMode(value: unknown): LibrarySortMode {
  return value === 'title' || value === 'artist' || value === 'playCount'
    ? value
    : 'custom'
}

const resolvedTheme = computed<'dark' | 'light'>(() =>
  resolveTheme(state.theme, state.systemTheme === 'dark')
)

function applyResolvedTheme(theme: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function applyLyricsSize(size: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--lyrics-font-size', `${size}px`)
  document.documentElement.style.setProperty('--lyrics-active-font-size', `${size + 6}px`)
}

if (typeof window !== 'undefined') {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  state.systemTheme = media.matches ? 'dark' : 'light'
  const syncSystemTheme = (): void => {
    state.systemTheme = media.matches ? 'dark' : 'light'
  }
  media.addEventListener('change', syncSystemTheme)
  watch(resolvedTheme, applyResolvedTheme, { immediate: true })
  watch(() => state.lyricsFontSize, applyLyricsSize, { immediate: true })
}

function applyVisualPreferences(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const prefs = state.preferences
  const theme = resolvedTheme.value
  const langs = prefs.languageFonts

  const uiStack = `${prefs.uiFont ? `${prefs.uiFont}, ` : ''}${langs.latin}, ${langs.han}, ${langs.japanese}, ${langs.korean}, sans-serif`
  root.style.setProperty('--font-sans', uiStack)
  root.style.setProperty('--font-display', uiStack)
  root.style.setProperty('--font-lyrics', prefs.lyricsFont || 'var(--font-display)')
  root.style.setProperty('--font-lyrics-han', langs.han)
  root.style.setProperty('--font-lyrics-latin', langs.latin)
  root.style.setProperty('--font-lyrics-ja', langs.japanese)
  root.style.setProperty('--font-lyrics-ko', langs.korean)
  root.style.setProperty('--sidebar-width', `${prefs.layout.sidebarWidth}px`)
  root.style.setProperty('--cover-scale', String(prefs.layout.coverScale))

  if (prefs.primaryColor) {
    root.style.setProperty('--accent', prefs.primaryColor)
    root.style.setProperty('--accent-strong', mixHex(prefs.primaryColor, '#ffffff', 0.18))
    root.style.setProperty('--accent-text', accentTextColor(prefs.primaryColor, theme))
    root.style.setProperty('--accent-soft', accentSoftColor(prefs.primaryColor, 0.1))
    root.style.setProperty('--on-accent', onAccentColor(prefs.primaryColor))
  } else {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-strong')
    root.style.removeProperty('--accent-text')
    root.style.removeProperty('--accent-soft')
    root.style.removeProperty('--on-accent')
  }

  if (prefs.secondaryColor) root.style.setProperty('--sand', prefs.secondaryColor)
  else root.style.removeProperty('--sand')
}

if (typeof window !== 'undefined') {
  watch([resolvedTheme, () => state.preferences], applyVisualPreferences, {
    deep: true,
    immediate: true
  })
}

const effectivePauseFadeMs = computed(() => {
  if (!currentTrack.value) return 0
  return currentTrack.value.pauseFade || state.preferences.pauseMode === 'fade'
    ? state.preferences.pauseFadeMs
    : 0
})

let customCssStyle: HTMLStyleElement | null = null
let customCssSeen = ''
let customCssTimer: number | null = null

function applyCustomCss(content: string): boolean {
  if (typeof document === 'undefined') return false
  if (!content.trim()) {
    customCssStyle?.remove()
    customCssStyle = null
    return true
  }
  try {
    if ('replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(content)
    }
  } catch {
    return false
  }
  if (!customCssStyle) {
    customCssStyle = document.createElement('style')
    customCssStyle.id = 'kexgo-custom-css'
    document.head.appendChild(customCssStyle)
  }
  customCssStyle.textContent = content
  return true
}

async function loadCustomCss(force = false): Promise<void> {
  try {
    const content = await api.readCustomCss()
    if (!force && content === customCssSeen) return
    customCssSeen = content
    state.customCssDraft = content
    if (!state.preferences.customCssEnabled) {
      applyCustomCss('')
      return
    }
    if (applyCustomCss(content)) {
      state.customCssError = ''
      return
    }
    state.customCssError = '自定义 CSS 有语法错误，已回滚到上一个可用版本'
    const fallback = await api.readLastGoodCss()
    if (fallback) {
      applyCustomCss(fallback)
      state.customCssDraft = fallback
      await api.restoreCustomCss().catch(() => undefined)
    } else {
      applyCustomCss('')
    }
  } catch (error) {
    state.customCssError = getErrorMessage(error)
  }
}

function startCustomCssPolling(): void {
  if (customCssTimer !== null) return
  customCssTimer = window.setInterval(() => {
    if (state.preferences.customCssEnabled) void loadCustomCss()
  }, 2000)
}

async function saveCustomCss(content: string): Promise<void> {
  state.customCssBusy = true
  try {
    if (!applyCustomCss(content)) {
      state.customCssError = 'CSS 语法错误，未保存'
      return
    }
    await api.saveCustomCss(content)
    customCssSeen = content
    state.customCssDraft = content
    state.customCssError = ''
    state.preferences.customCssEnabled = true
    scheduleSettingsSave()
    toast('success', '自定义 CSS 已保存', '外部修改文件后会自动热重载。')
  } catch (error) {
    state.customCssError = getErrorMessage(error)
  } finally {
    state.customCssBusy = false
  }
}

function setCustomCssEnabled(enabled: boolean): void {
  state.preferences.customCssEnabled = enabled
  if (enabled) void loadCustomCss(true)
  else applyCustomCss('')
  scheduleSettingsSave()
}

async function refreshDataLocation(): Promise<void> {
  try {
    state.dataLocation = await api.getDataLocation()
  } catch {
    state.dataLocation = null
  }
}

async function migrateDataLocation(): Promise<void> {
  if (!api.isTauri || state.dataMigrationBusy) {
    toast('info', '浏览器预览不支持迁移', '迁移数据目录只在桌面版可用。')
    return
  }
  state.dataMigrationBusy = true
  try {
    const target = await api.pickDataDirectory()
    if (!target) return
    if (
      !window.confirm(
        `将把当前曲库、封面、歌词、草稿和设置复制到：\n${target}\n\n旧目录不会被删除。迁移后需要重启 KexGo，是否继续？`
      )
    ) {
      return
    }
    const result = await api.migrateDataDirectory(target)
    await refreshDataLocation()
    toast(
      'success',
      '数据已迁移，请重启 KexGo',
      `新位置：${result.newPath}。旧目录仍保留在原处。`
    )
  } catch (error) {
    toast('error', '迁移数据失败', getErrorMessage(error))
  } finally {
    state.dataMigrationBusy = false
  }
}

function openLyricsNotes(): void {
  if (currentTrack.value) state.lyricsNotesOpen = true
}

function closeLyricsNotes(): void {
  state.lyricsNotesOpen = false
}

async function loadLyricsNotes(trackId: string): Promise<void> {
  try {
    state.lyricsNotes = await api.readLyricsNotes(trackId)
  } catch {
    state.lyricsNotes = null
  }
}

async function saveLyricsNotes(notes: LyricsNotesFile): Promise<void> {
  notes.updatedAt = Date.now()
  await api.saveLyricsNotes(notes.trackId, notes)
  state.lyricsNotes = structuredClone(notes)
}

function setPlaybackRate(rate: number): void {
  const next = clamp(Math.round(rate * 100) / 100, 0.5, 2)
  state.playbackRate = next
  void api.setSpeed(next).catch(() => undefined)
}

async function setTrackPauseFade(trackId: string, enabled: boolean): Promise<void> {
  try {
    const updated = await api.setTrackPauseFade(trackId, enabled)
    replaceTrack(updated)
    toast('success', enabled ? '此曲将使用暂停淡出' : '此曲已恢复全局暂停策略')
  } catch (error) {
    toast('error', '设置失败', getErrorMessage(error))
  }
}

let speedHoldBase: number | null = null

function adjustVolume(delta: number): void {
  void setVolume(clamp(state.volume + delta, 0, 1), 80)
}

function seekBy(delta: number): void {
  void seekTo(state.position + delta)
}

function toggleSpeed(): void {
  setPlaybackRate(state.playbackRate === 1 ? 1.5 : 1)
}

function beginSpeedHold(): void {
  if (speedHoldBase !== null) return
  speedHoldBase = state.playbackRate
  setPlaybackRate(Math.min(2, Math.max(1.5, speedHoldBase)))
}

function endSpeedHold(): void {
  if (speedHoldBase === null) return
  setPlaybackRate(speedHoldBase)
  speedHoldBase = null
}

function nudgeSpeed(delta: number): void {
  setPlaybackRate(state.playbackRate + delta)
}

if (typeof window !== 'undefined') {
  watch(
    () => state.currentTrackId,
    (trackId) => {
      state.lyricsNotes = null
      if (trackId) void loadLyricsNotes(trackId)
    },
    { immediate: true }
  )
  startCustomCssPolling()
}

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

export function trackIssueTitle(status: TrackIssueStatus): string {
  switch (status) {
    case 'missing':
      return '文件不存在'
    case 'unreadable':
      return '无法读取文件'
    case 'duration-unknown':
      return '无法读取时长'
    case 'unsupported':
      return '此文件暂不支持'
    default:
      return '无法解码'
  }
}

function setTrackIssue(trackId: string, status: TrackIssueStatus, message: string): void {
  state.trackIssues[trackId] = { trackId, status, message }
}

function clearTrackIssue(trackId: string): void {
  delete state.trackIssues[trackId]
}

function showUnsupportedForTrack(trackId: string, reason: string): void {
  const track = state.tracks.find((item) => item.id === trackId)
  state.importIssues = [{ path: track?.filePath ?? trackId, reason }]
  state.importIssuesOpen = true
}

function reportPlaybackIssue(trackId: string, status: TrackIssueStatus, message: string): void {
  setTrackIssue(trackId, status, message)
  if (status === 'unsupported') {
    showUnsupportedForTrack(trackId, message)
  } else {
    toast('warning', trackIssueTitle(status), message)
  }
}

async function refreshLibraryIssues(): Promise<void> {
  try {
    const issues = await api.validateLibraryPaths()
    if (issues.length === 0) return
    for (const issue of issues) state.trackIssues[issue.trackId] = issue
    toast(
      'warning',
      `${issues.length} 个曲目暂时无法播放`,
      '播放按钮已禁用，请查看歌曲旁的警告或在当前歌曲区域重新检测。'
    )
  } catch {
    // Startup validation must not block the player.
  }
}

async function revalidateCurrentTrack(): Promise<void> {
  const track = currentTrack.value
  if (!track) return
  try {
    const check = await api.preflightTrack(track.id)
    if (check.status === 'ok') {
      clearTrackIssue(track.id)
      toast('success', '文件检测通过', '现在可以继续播放。')
    } else {
      reportPlaybackIssue(track.id, check.status, check.message)
    }
  } catch (error) {
    reportPlaybackIssue(track.id, 'unreadable', getErrorMessage(error))
  }
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
    compensationMs: state.settings.compensationMs,
    queue: state.queue.slice(),
    playMode: state.playMode,
    sortMode: state.sortMode,
    libraryOrder: state.libraryOrder.slice(),
    theme: state.theme,
    closeToTray: state.closeToTray,
    lyricsFontSize: state.lyricsFontSize,
    visualizerEnabled: state.visualizerEnabled,
    preferences: state.preferences
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
  if (!currentTrack.value) return
  state.position = displayDuration.value
  state.playing = false
  audioTrackId = null
  // While the aligner is open, never jump to another song mid-session.
  if (state.activeView === 'align') {
    await saveSettingsNow()
    return
  }
  if (state.playMode === 'repeat-one') {
    await playQueueTrack(currentTrack.value.id, true)
    return
  }
  await step(1, { auto: true })
}

function reconcileLibraryOrder(stored: string[] | undefined, tracks: Track[]): string[] {
  const validIds = new Set(tracks.map((track) => track.id))
  const order: string[] = []
  const seen = new Set<string>()
  for (const id of stored ?? []) {
    if (!validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  for (const track of tracks) {
    if (seen.has(track.id)) continue
    seen.add(track.id)
    order.push(track.id)
  }
  return order
}

async function init(): Promise<void> {
  if (state.booted) return
  try {
    const snapshot: LibrarySnapshot = await api.getSnapshot()
    state.tracks = snapshot.tracks
    state.settings = snapshot.settings
    state.volume = snapshot.settings.volume
    state.settings.compensationMs = snapshot.settings.compensationMs ?? -150
    state.libraryOrder = reconcileLibraryOrder(snapshot.settings.libraryOrder, snapshot.tracks)
    state.queue = normalizeQueue(
      snapshot.settings.queue,
      state.libraryOrder,
      new Set(snapshot.tracks.map((track) => track.id))
    )
    state.playMode = normalizePlayMode(snapshot.settings.playMode)
    state.sortMode = normalizeSortMode(snapshot.settings.sortMode)
    state.theme = normalizeTheme(snapshot.settings.theme)
    state.closeToTray = snapshot.settings.closeToTray !== false
    state.lyricsFontSize = clampLyricsFontSize(snapshot.settings.lyricsFontSize)
    state.visualizerEnabled = snapshot.settings.visualizerEnabled !== false
    state.preferences = normalizePreferences(snapshot.settings.preferences)
    void api.setVolume(state.volume)
    const remembered = snapshot.tracks.find((track) => track.id === snapshot.settings.lastTrackId)
    if (remembered) {
      state.currentTrackId = remembered.id
      state.position = Math.min(snapshot.settings.lastPosition, remembered.duration || 0)
      state.duration = remembered.duration
    } else if (state.queue.length > 0) {
      const first = snapshot.tracks.find((track) => track.id === state.queue[0])
      if (first) {
        state.currentTrackId = first.id
        state.duration = first.duration
      }
    } else if (snapshot.tracks.length > 0) {
      state.currentTrackId = snapshot.tracks[0].id
      state.duration = snapshot.tracks[0].duration
    }
    await preloadCovers()
    tickUnlisten = await api.onPlayerTick(handleTick)
    window.addEventListener('beforeunload', () => {
      void saveSettingsNow()
    })
    void refreshDataLocation()
    void loadCustomCss(true)
    void refreshLibraryIssues()
    if (currentTrack.value && !currentTrack.value.lyricsText) {
      void maybeFindLyricsAutomatically(currentTrack.value)
    }
  } catch (error) {
    toast('error', '音乐库加载失败', getErrorMessage(error))
  } finally {
    state.booting = false
    state.booted = true
    scheduleSettingsSave()
  }
}

function ensureTrackInQueue(trackId: string): void {
  if (state.queue.includes(trackId)) return
  if (!state.tracks.some((track) => track.id === trackId)) return
  state.queue.push(trackId)
  scheduleSettingsSave()
}

async function activateTrack(
  track: Track,
  autoplay: boolean,
  options: { ensureQueue?: boolean; restart?: boolean } = {}
): Promise<void> {
  const ensureQueue = options.ensureQueue ?? true
  if (ensureQueue) ensureTrackInQueue(track.id)
  const changed = track.id !== state.currentTrackId || options.restart
  const sequence = ++loadSequence
  if (state.currentTrackId && changed) void saveSettingsNow()
  state.currentTrackId = track.id
  state.position = 0
  state.duration = track.duration
  state.activeView = 'player'
  endedForTrack = null
  state.audioLoading = false
  audioTrackId = null
  state.playing = false
  state.lyricsLookup = 'idle'
  state.lookupError = ''
  if (changed) void loadCover(track)
  if (autoplay) {
    await startPlayback(track.id, 0, sequence)
  } else {
    await api.stop().catch(() => undefined)
  }
  if (!track.lyricsText) void maybeFindLyricsAutomatically(track)
  scheduleSettingsSave()
}

async function playQueueTrack(trackId: string, autoplay: boolean): Promise<void> {
  const track = state.tracks.find((item) => item.id === trackId)
  if (!track) return
  await activateTrack(track, autoplay, { ensureQueue: false, restart: true })
}

async function selectTrack(
  track: Track,
  options: { autoplay?: boolean; rememberPosition?: boolean } = {}
): Promise<void> {
  const autoplay = options.autoplay ?? true
  const remember = options.rememberPosition ?? true
  if (track.id === state.currentTrackId) {
    ensureTrackInQueue(track.id)
    if (autoplay) await togglePlay()
    return
  }
  if (remember && state.currentTrackId) void saveSettingsNow()
  await activateTrack(track, autoplay)
}

async function startPlayback(trackId: string, startAt: number, sequence?: number): Promise<void> {
  state.audioLoading = true
  try {
    const check = await api.preflightTrack(trackId)
    if (sequence !== undefined && sequence !== loadSequence) return
    if (check.status !== 'ok') {
      state.playing = false
      audioTrackId = null
      await api.stop().catch(() => undefined)
      reportPlaybackIssue(trackId, check.status, check.message)
      return
    }
    clearTrackIssue(trackId)

    const tick = await api.playTrack(trackId, Math.max(0, startAt))
    if (sequence !== undefined && sequence !== loadSequence) return
    audioTrackId = trackId
    state.position = tick.position
    if (Number.isFinite(tick.duration) && tick.duration > 0) state.duration = tick.duration
    state.playing = true
    endedForTrack = null
    void api
      .incrementPlayCount(trackId)
      .then((updated) => replaceTrack(updated))
      .catch(() => undefined)
  } catch (error) {
    if (sequence !== undefined && sequence !== loadSequence) return
    state.playing = false
    audioTrackId = null
    await api.stop().catch(() => undefined)
    const message = getErrorMessage(error)
    if (message.includes('fragmented MP4') || message.includes('分片 MP4')) {
      setTrackIssue(trackId, 'unsupported', message)
      showUnsupportedForTrack(trackId, message)
    } else {
      setTrackIssue(trackId, 'undecodable', message)
      toast('error', '无法播放这首歌', message)
    }
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
  if (currentPlaybackIssue.value) {
    void revalidateCurrentTrack()
    return
  }
  ensureTrackInQueue(track.id)
  if (state.playing) {
    state.playing = false
    await api.pause(effectivePauseFadeMs.value).catch(() => undefined)
    scheduleSettingsSave()
    return
  }
  const atEnd = state.position >= displayDuration.value - 0.25
  if (audioTrackId !== track.id || atEnd) {
    await startPlayback(track.id, atEnd ? 0 : state.position)
    if (atEnd) state.position = 0
  } else {
    try {
      await api.resume(effectivePauseFadeMs.value)
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
  if (state.queue.length === 0) {
    if (!options.auto) toast('info', '播放队列为空', '从曲库添加歌曲，或用标签筛选后一键加入队列。')
    return
  }
  const currentIndex = state.queue.indexOf(state.currentTrackId ?? '')
  const nextIndex =
    state.playMode === 'shuffle'
      ? randomNextIndex(state.queue.length, currentIndex)
      : sequentialNextIndex(state.queue.length, currentIndex, direction)
  const nextId = state.queue[nextIndex]
  if (!nextId) return
  const autoplay = options.auto ? true : state.playing
  await playQueueTrack(nextId, autoplay)
}

function setPlayMode(mode: PlayMode): void {
  state.playMode = normalizePlayMode(mode)
  scheduleSettingsSave()
}

function cyclePlayMode(): void {
  const order: PlayMode[] = ['sequential', 'repeat-one', 'shuffle']
  const index = order.indexOf(state.playMode)
  setPlayMode(order[(index + 1) % order.length])
}

function setSortMode(mode: LibrarySortMode): void {
  state.sortMode = normalizeSortMode(mode)
  scheduleSettingsSave()
}

function moveLibraryItem(fromId: string, toId: string): void {
  if (fromId === toId) return
  const from = state.libraryOrder.indexOf(fromId)
  const to = state.libraryOrder.indexOf(toId)
  if (from < 0 || to < 0) return
  const next = state.libraryOrder.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  state.libraryOrder = next
  scheduleSettingsSave()
}

function toggleTagFilter(tag: string): void {
  const trimmed = tag.trim()
  if (!trimmed) return
  const existing = state.selectedTags.findIndex(
    (item) => item.toLocaleLowerCase() === trimmed.toLocaleLowerCase()
  )
  if (existing >= 0) state.selectedTags.splice(existing, 1)
  else state.selectedTags.push(trimmed)
}

function clearTagFilters(): void {
  state.selectedTags = []
}

function addTracksToQueue(trackIds: string[], notify = false): number {
  const valid = new Set(state.tracks.map((track) => track.id))
  const existing = new Set(state.queue)
  let added = 0
  for (const id of trackIds) {
    if (!valid.has(id) || existing.has(id)) continue
    existing.add(id)
    state.queue.push(id)
    added += 1
  }
  if (added > 0) scheduleSettingsSave()
  if (notify && added > 0) {
    toast('success', '已加入播放队列', `新增 ${added} 首歌曲。`)
  }
  return added
}

async function removeFromQueue(trackId: string): Promise<void> {
  const index = state.queue.indexOf(trackId)
  if (index < 0) return
  const wasCurrent = state.currentTrackId === trackId
  state.queue.splice(index, 1)
  if (wasCurrent) {
    state.playing = false
    audioTrackId = null
    await api.stop().catch(() => undefined)
    const nextId = state.queue[Math.min(index, state.queue.length - 1)]
    if (nextId) {
      const next = state.tracks.find((track) => track.id === nextId)
      if (next) {
        state.currentTrackId = next.id
        state.position = 0
        state.duration = next.duration
        void loadCover(next)
      }
    }
  }
  scheduleSettingsSave()
}

function moveQueueItem(from: number, to: number): void {
  state.queue = reorderQueue(state.queue, from, to)
  scheduleSettingsSave()
}

function shuffleQueue(): void {
  if (state.queue.length < 2) return
  const next = state.queue.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[target]] = [next[target], next[index]]
  }
  state.queue = next
  scheduleSettingsSave()
  toast('success', '队列顺序已打乱', '当前播放不受影响，下一首会按新顺序。')
}

async function clearQueue(): Promise<void> {
  if (state.queue.length === 0) return
  state.queue = []
  state.playing = false
  audioTrackId = null
  await api.stop().catch(() => undefined)
  scheduleSettingsSave()
}

async function playQueueItem(trackId: string): Promise<void> {
  if (!state.queue.includes(trackId)) return
  await playQueueTrack(trackId, true)
}

function openQueue(): void {
  state.queueOpen = true
  state.editModalOpen = false
}

function closeQueue(): void {
  state.queueOpen = false
}

async function exportQueuePlaylist(): Promise<void> {
  const tracks = queueTracks.value
  if (tracks.length === 0) {
    toast('info', '队列为空', '先向队列添加歌曲，再导出歌单。')
    return
  }
  state.queueBusy = true
  try {
    const content = serializePlaylist(buildPlaylistFile(tracks, state.playMode))
    const date = new Date().toISOString().slice(0, 10)
    const path = await api.savePlaylistJson(content, `KexGo-Playlist-${date}`)
    if (path) toast('success', '歌单已导出', '文件只包含歌曲元数据、标签和队列顺序，不包含音频。')
  } catch (error) {
    toast('error', '导出歌单失败', getErrorMessage(error))
  } finally {
    state.queueBusy = false
  }
}

async function importQueuePlaylist(): Promise<void> {
  if (state.queueBusy) return
  state.queueBusy = true
  try {
    const raw = await api.pickPlaylistJson()
    if (raw === null) return
    const file = parsePlaylistFile(raw)
    const result = matchPlaylist(file, state.tracks)
    if (result.matched.length === 0) {
      toast('error', '没有可导入的歌曲', '歌单中的歌曲都不在当前曲库中。')
      return
    }
    const unmatchedNote = result.unmatched.length
      ? `\n${result.unmatched.length} 首未在本地找到，将被跳过。`
      : ''
    if (
      !window.confirm(
        `将导入 ${result.matched.length} 首歌曲，并替换当前播放队列。${unmatchedNote}\n匹配歌曲的标签会合并，是否继续？`
      )
    ) {
      return
    }

    let tagFailures = 0
    for (const update of result.tagUpdates) {
      try {
        const updated = await api.setTrackTags(update.trackId, update.tags)
        replaceTrack(updated)
      } catch {
        tagFailures += 1
      }
    }

    state.queue = result.queue
    state.playMode = normalizePlayMode(file.playMode)
    if (!state.currentTrackId || !state.queue.includes(state.currentTrackId)) {
      state.playing = false
      audioTrackId = null
      await api.stop().catch(() => undefined)
      const first = state.tracks.find((track) => track.id === state.queue[0])
      if (first) {
        state.currentTrackId = first.id
        state.position = 0
        state.duration = first.duration
        void loadCover(first)
      }
    }
    await saveSettingsNow()
    const skipped = result.unmatched.length ? `，跳过 ${result.unmatched.length} 首` : ''
    toast(
      'success',
      '歌单已导入',
      `已载入 ${result.matched.length} 首${skipped}${tagFailures ? `；${tagFailures} 首标签写入失败` : ''}。`
    )
  } catch (error) {
    toast('error', '导入歌单失败', getErrorMessage(error))
  } finally {
    state.queueBusy = false
  }
}

function openSettings(): void {
  state.settingsOpen = true
  state.queueOpen = false
  state.editModalOpen = false
  void refreshDataLocation()
  void loadCustomCss(true)
}

function closeSettings(): void {
  state.settingsOpen = false
}

function setTheme(theme: ThemeMode): void {
  state.theme = normalizeTheme(theme)
  scheduleSettingsSave()
}

function setCloseToTray(value: boolean): void {
  state.closeToTray = value
  scheduleSettingsSave()
}

function setLyricsFontSize(value: number): void {
  state.lyricsFontSize = clampLyricsFontSize(value)
  scheduleSettingsSave()
}

function setVisualizerEnabled(value: boolean): void {
  state.visualizerEnabled = value
  scheduleSettingsSave()
}

function savePreferences(): void {
  scheduleSettingsSave()
}

async function setVolume(value: number, fadeMs = 0): Promise<void> {
  const volume = clamp(value, 0, 1)
  state.volume = volume
  await api.setVolume(volume, fadeMs).catch(() => undefined)
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

async function updateTrackTags(trackId: string, tags: string[]): Promise<void> {
  const previous = state.tracks.find((track) => track.id === trackId)?.tags ?? []
  const track = state.tracks.find((item) => item.id === trackId)
  if (track) track.tags = [...tags]
  try {
    const updated = await api.setTrackTags(trackId, tags)
    replaceTrack(updated)
  } catch (error) {
    if (track) track.tags = previous
    toast('error', '标签保存失败', getErrorMessage(error))
  }
}

async function removeTrack(trackId: string): Promise<void> {
  const track = state.tracks.find((item) => item.id === trackId)
  if (!track) return
  const isCurrent = trackId === state.currentTrackId
  try {
    if (isCurrent) await api.stop()
    await api.removeTrack(trackId)
    state.tracks = state.tracks.filter((item) => item.id !== trackId)
    state.libraryOrder = state.libraryOrder.filter((id) => id !== trackId)
    state.queue = state.queue.filter((id) => id !== trackId)
    delete state.trackIssues[trackId]
    if (isCurrent) {
      audioTrackId = null
      state.playing = false
      state.position = 0
      const next =
        state.tracks.find((item) => item.id === state.queue[0]) ?? state.tracks[0]
      state.currentTrackId = next?.id ?? null
      state.duration = next?.duration ?? 0
      if (next) {
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

function closeImportIssues(): void {
  state.importIssuesOpen = false
}

async function importResult(summary: ImportSummary | null): Promise<void> {
  if (!summary) return
  const failed = summary.failed ?? []
  if (summary.added.length === 0) {
    if (failed.length > 0) {
      state.importIssues = failed
      state.importIssuesOpen = true
    } else if (summary.skipped.length > 0) {
      toast('info', '这些歌曲已经在曲库里了')
    }
    return
  }
  state.tracks.push(...summary.added)
  for (const track of summary.added) {
    if (!state.libraryOrder.includes(track.id)) state.libraryOrder.push(track.id)
    if (!state.queue.includes(track.id)) state.queue.push(track.id)
  }
  void preloadCovers()
  toast(
    'success',
    `已导入 ${summary.added.length} 首歌曲`,
    failed.length > 0 ? `另有 ${failed.length} 个文件未能导入` : '同名 LRC 与封面已自动完成关联'
  )
  await selectTrack(summary.added[0], { autoplay: true })
  if (failed.length > 0) {
    state.importIssues = failed
    state.importIssuesOpen = true
  }
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
    currentPlaybackIssue,
    currentQueueIndex,
    queueTracks,
    tagHistory,
    revalidateCurrentTrack,
    timedLines,
    activeLyricIndex,
    progress,
    displayDuration,
    isBrowser,
    resolvedTheme,
    effectivePauseFadeMs,
    openSettings,
    closeSettings,
    setTheme,
    setCloseToTray,
    setLyricsFontSize,
    setVisualizerEnabled,
    savePreferences,
    saveCustomCss,
    setCustomCssEnabled,
    refreshDataLocation,
    migrateDataLocation,
    saveLyricsNotes,
    openLyricsNotes,
    closeLyricsNotes,
    setPlaybackRate,
    setTrackPauseFade,
    adjustVolume,
    seekBy,
    toggleSpeed,
    beginSpeedHold,
    endSpeedHold,
    nudgeSpeed,
    api,
    init,
    toast,
    dismissToast,
    selectTrack,
    togglePlay,
    seekTo,
    step,
    setPlayMode,
    cyclePlayMode,
    setSortMode,
    moveLibraryItem,
    toggleTagFilter,
    clearTagFilters,
    addTracksToQueue,
    removeFromQueue,
    moveQueueItem,
    shuffleQueue,
    clearQueue,
    playQueueItem,
    openQueue,
    closeQueue,
    exportQueuePlaylist,
    importQueuePlaylist,
    setVolume,
    setCompensation,
    updateMetadata,
    updateTrackTags,
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
    closeImportIssues,
    setDragActive,
    saveSettingsNow,
    loadCover,
    maybeFindLyricsAutomatically
  }
}
