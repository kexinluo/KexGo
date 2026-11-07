import type { AlignLine, NormalizeReport } from '../types'
import { sortableTime } from './time'

export interface ParsedLyrics {
  lines: AlignLine[]
  hasTimestamps: boolean
  metadata: Record<string, string>
  offsetMs: number
}

const TIMESTAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const META_RE = /^\[([a-zA-Z]+):(.*)\]$/
const ENHANCED_WORD_RE = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g
let lyricLineCounter = 0

function nextId(): string {
  lyricLineCounter += 1
  return `lyric-line-${lyricLineCounter}`
}

function fractionToMs(raw: string | undefined): number {
  if (!raw) return 0
  if (raw.length === 1) return Number(raw) * 100
  if (raw.length === 2) return Number(raw) * 10
  return Number(raw.slice(0, 3))
}

/**
 * Parses both timestamped LRC and plain text. Untimed lines are kept so they can
 * be used immediately as an alignment script.
 */
export function parseLyrics(raw: string): ParsedLyrics {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const metadata: Record<string, string> = {}
  let offsetMs = 0
  const lines: AlignLine[] = []
  let hasTimestamps = false

  for (const originalLine of text.split('\n')) {
    const line = originalLine.trim()
    if (!line) continue

    const metaMatch = line.match(META_RE)
    if (metaMatch && !/^\d+$/.test(metaMatch[1])) {
      const key = metaMatch[1].toLowerCase()
      metadata[key] = metaMatch[2].trim()
      if (key === 'offset') {
        const parsed = Number(metaMatch[2].trim())
        offsetMs = Number.isFinite(parsed) ? parsed : 0
      }
      continue
    }

    TIMESTAMP_RE.lastIndex = 0
    const timestamps: number[] = []
    let match: RegExpExecArray | null
    while ((match = TIMESTAMP_RE.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      if (seconds >= 60) continue
      const ms = minutes * 60_000 + seconds * 1000 + fractionToMs(match[3])
      timestamps.push(ms)
    }

    const lyricText = line
      .replace(TIMESTAMP_RE, '')
      .replace(ENHANCED_WORD_RE, '')
      .trim()

    if (timestamps.length > 0) {
      hasTimestamps = true
      for (const timeMs of timestamps) {
        lines.push({
          id: nextId(),
          text: lyricText || '♪',
          timeMs: Math.max(0, timeMs + offsetMs)
        })
      }
    } else if (line.length > 0) {
      lines.push({ id: nextId(), text: line, timeMs: null })
    }
  }

  if (hasTimestamps && lines.every((line) => line.timeMs !== null)) {
    // Keep file order for equal timestamps, but otherwise display chronologically.
    lines.sort((a, b) => sortableTime(a.timeMs) - sortableTime(b.timeMs))
  }

  return { lines, hasTimestamps, metadata, offsetMs }
}

export function hasTimestamps(lines: AlignLine[]): boolean {
  return lines.some((line) => line.timeMs !== null)
}

export function timedLineCount(lines: AlignLine[]): number {
  return lines.filter((line) => line.timeMs !== null).length
}

export function formatLrc(
  lines: AlignLine[],
  metadata?: { title?: string; artist?: string; album?: string; by?: string }
): string {
  const header: string[] = []
  if (metadata?.title) header.push(`[ti:${metadata.title}]`)
  if (metadata?.artist) header.push(`[ar:${metadata.artist}]`)
  if (metadata?.album) header.push(`[al:${metadata.album}]`)
  if (metadata?.by) header.push(`[by:${metadata.by}]`)
  if (header.length) header.push('')

  const body = lines
    .filter((line): line is AlignLine & { timeMs: number } => line.timeMs !== null)
    .slice()
    .sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))
    .map((line) => {
      const safe = Math.max(0, Math.round(line.timeMs))
      const centis = Math.floor((safe % 1000) / 10)
      const totalSeconds = Math.floor(safe / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      const stamp = `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
      return `[${stamp}]${line.text || ' '}`
    })

  return [...header, ...body].join('\n') + '\n'
}

export function linesFromText(text: string): AlignLine[] {
  return parseLyrics(text).lines
}

/**
 * Pasted text cleanup: removes empty lines and joins obvious one or two-character
 * fragments to the previous line. Very long lines are only reported — never
 * silently split, because a bad split is worse than a visible warning.
 */
export function normalizePastedLyrics(raw: string): NormalizeReport {
  const rawLines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  let removedBlank = 0
  const compact: string[] = []
  for (const source of rawLines) {
    const line = source.replace(/[ \t]+/g, ' ').trim()
    if (!line) {
      removedBlank += 1
      continue
    }
    compact.push(line)
  }

  let mergedShort = 0
  const merged: string[] = []
  for (const line of compact) {
    const prev = merged[merged.length - 1]
    const isFraction = line.length <= 2 && !/[。！？!?…；;：:]$/.test(line)
    if (prev && isFraction && prev.length + line.length <= 24 && !/[。！？!?…]$/.test(prev)) {
      const needsSpace = /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(line)
      merged[merged.length - 1] = `${prev}${needsSpace ? ' ' : ''}${line}`
      mergedShort += 1
    } else {
      merged.push(line)
    }
  }

  const longLines: number[] = []
  merged.forEach((line, index) => {
    if (line.length > 36) longLines.push(index + 1)
  })

  return {
    text: merged.join('\n'),
    removedBlank,
    mergedShort,
    longLines
  }
}

export function looksLikeLrc(text: string): boolean {
  return /\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(text)
}

export function activeLineIndex(lines: AlignLine[], positionMs: number): number {
  let active = -1
  for (let i = 0; i < lines.length; i += 1) {
    const time = lines[i].timeMs
    if (time !== null && time <= positionMs + 40) active = i
    else break
  }
  return active
}

export function applyOffset(lines: AlignLine[], deltaMs: number): AlignLine[] {
  return lines.map((line) => ({
    ...line,
    timeMs: line.timeMs === null ? null : Math.max(0, Math.round(line.timeMs + deltaMs))
  }))
}

export function withAdjustedLine(lines: AlignLine[], index: number, deltaMs: number): AlignLine[] {
  return lines.map((line, i) =>
    i === index && line.timeMs !== null
      ? { ...line, timeMs: Math.max(0, Math.round(line.timeMs + deltaMs)) }
      : line
  )
}

export function resyncLineOrder(lines: AlignLine[]): AlignLine[] {
  return lines.slice().sort((a, b) => sortableTime(a.timeMs) - sortableTime(b.timeMs))
}

export function makeAlignLines(text: string): AlignLine[] {
  return parseLyrics(text).lines
}
