export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** mm:ss */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** mm:ss.cc — lyric timestamps always show centiseconds. */
export function formatLyricTime(ms: number | null, placeholder = '--:--.--'): string {
  if (ms === null || !Number.isFinite(ms)) return placeholder
  const safe = Math.max(0, Math.round(ms))
  const centis = Math.floor((safe % 1000) / 10)
  const totalSeconds = Math.floor(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}

/** Compact timestamp used by LRC files. */
export function toLrcTimestamp(ms: number): string {
  return `[${formatLyricTime(ms)}]`
}

export function parseTimeInput(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Math.round(Number(value) * 1000)
  }
  const match = value.match(/^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const fraction = match[3] ?? '0'
  const fractionMs =
    fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction)
  return minutes * 60_000 + seconds * 1000 + fractionMs
}

export function sortableTime(ms: number | null): number {
  return ms === null ? Number.MAX_SAFE_INTEGER : ms
}

export function relativeTime(ms: number): string {
  if (ms < 60_000) return '刚刚'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}
