export type LyricsOrigin = 'sidecar' | 'embedded' | 'lrclib' | 'manual' | 'unknown'

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
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  lastTrackId: string | null
  lastPosition: number
  volume: number
  compensationMs: number
}

export interface LibrarySnapshot {
  tracks: Track[]
  settings: AppSettings
}

export interface ImportSummary {
  added: Track[]
  skipped: string[]
  failed: { path: string; reason: string }[]
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
