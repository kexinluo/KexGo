export type LyricsOrigin = 'sidecar' | 'embedded' | 'lrclib' | 'manual' | 'unknown'
export type PlayMode = 'sequential' | 'repeat-one' | 'shuffle'
export type LibrarySortMode = 'custom' | 'title' | 'artist' | 'playCount'
export type ThemeMode = 'dark' | 'light' | 'system'
export type PauseMode = 'instant' | 'fade'
export type AnnotationMode = 'none' | 'ruby' | 'romaji'

export type ShortcutAction =
  | 'playPause'
  | 'previous'
  | 'next'
  | 'volumeUp'
  | 'volumeDown'
  | 'seekBack5'
  | 'seekForward5'
  | 'seekBack10'
  | 'seekForward10'
  | 'speedHold'
  | 'speedToggle'
  | 'speedUp'
  | 'speedDown'
  | 'alignPause'
  | 'alignMark'
  | 'alignBack'
  | 'alignForward'
  | 'alignUndo'
  | 'alignRewind'
  | 'alignSave'

export type ContextMenuAction = 'play' | 'queue' | 'edit' | 'remove'

export interface AppPreferences {
  primaryColor: string
  secondaryColor: string
  uiFont: string
  lyricsFont: string
  languageFonts: {
    han: string
    latin: string
    japanese: string
    korean: string
  }
  shortcuts: Record<ShortcutAction, string>
  contextMenu: { id: ContextMenuAction; visible: boolean }[]
  pauseMode: PauseMode
  pauseFadeMs: number
  customCssEnabled: boolean
  showTranslations: boolean
  annotationMode: AnnotationMode
  layout: {
    showSidebar: boolean
    showCover: boolean
    showTags: boolean
    showLyrics: boolean
    sidebarWidth: number
    coverScale: number
  }
}

export interface LyricsNoteLine {
  index: number
  translation: string
  ruby: string
  romaji: string
}

export interface LyricsNotesFile {
  version: 1
  trackId: string
  updatedAt: number
  lines: LyricsNoteLine[]
}

export interface DataLocation {
  current: string
  default: string
  customCssPath: string
}

export interface MigrationResult {
  oldPath: string
  newPath: string
  restartRequired: boolean
}

export interface Track {
  id: string
  filePath: string
  title: string
  artist: string
  album: string
  duration: number
  coverPath: string | null
  lrcPath: string | null
  lyricsText: string
  lyricsOrigin: LyricsOrigin
  tags: string[]
  playCount: number
  pauseFade: boolean
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  lastTrackId: string | null
  lastPosition: number
  volume: number
  compensationMs: number
  queue: string[] | null
  playMode: PlayMode
  sortMode: LibrarySortMode
  libraryOrder: string[]
  theme: ThemeMode
  closeToTray: boolean
  lyricsFontSize: number
  visualizerEnabled: boolean
  preferences: AppPreferences
}

export interface PlaylistTrackSnapshot {
  trackId: string
  title: string
  artist: string
  album: string
  duration: number
  fileName: string
  tags: string[]
}

export interface PlaylistFile {
  kind: 'kexgo-playlist'
  schemaVersion: 1
  exportedAt: string
  playMode: PlayMode
  tracks: PlaylistTrackSnapshot[]
}

export interface PlaylistMatch {
  matched: { entry: PlaylistTrackSnapshot; track: Track }[]
  unmatched: PlaylistTrackSnapshot[]
  queue: string[]
  tagUpdates: { trackId: string; tags: string[] }[]
}

export interface LibrarySnapshot {
  tracks: Track[]
  settings: AppSettings
}

export interface ImportIssue {
  path: string
  reason: string
}

export type TrackIssueStatus = 'missing' | 'unreadable' | 'undecodable' | 'duration-unknown' | 'unsupported'

export interface TrackIssue {
  trackId: string
  status: TrackIssueStatus
  message: string
}

export interface TrackCheck {
  status: 'ok' | TrackIssueStatus
  message: string
}

export interface ImportSummary {
  added: Track[]
  skipped: string[]
  failed: ImportIssue[]
}

export interface LyricsQuery {
  trackName: string
  artistName: string
  albumName?: string
  duration?: number
}

export interface OnlineLyricsResult {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number | null
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export interface SaveLyricsResult {
  lrcPath: string
  sidecarPath: string | null
  warning: string | null
}

export interface PlayerTick {
  trackId: string | null
  position: number
  duration: number
  playing: boolean
  volume: number
  ended: boolean
}

export interface AlignmentDraft {
  version: 1
  trackId: string
  lines: AlignLine[]
  cursor: number
  compensationMs: number
  savedAt: number
}

export interface AlignLine {
  id: string
  text: string
  timeMs: number | null
}

export interface NormalizeReport {
  text: string
  removedBlank: number
  mergedShort: number
  longLines: number[]
}

export type ThemeToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  id: number
  kind: ThemeToastKind
  title: string
  detail?: string
}
