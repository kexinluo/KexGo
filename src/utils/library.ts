import type { LibrarySortMode, Track } from '../types'

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true })

export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

/**
 * Sorts a *view* of the library. The library's canonical insertion order is
 * kept separately in settings; this function never mutates the input array.
 */
export function sortLibraryTracks(
  tracks: Track[],
  mode: LibrarySortMode,
  customOrder: string[]
): Track[] {
  if (mode === 'custom') {
    const order = new Map(customOrder.map((id, index) => [id, index]))
    return tracks
      .slice()
      .sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || compareText(a.title, b.title)
      )
  }

  return tracks.slice().sort((a, b) => {
    if (mode === 'playCount') {
      return (b.playCount ?? 0) - (a.playCount ?? 0) || compareText(a.title, b.title)
    }
    if (mode === 'artist') {
      return compareText(a.artist, b.artist) || compareText(a.title, b.title)
    }
    return compareText(a.title, b.title) || compareText(a.artist, b.artist)
  })
}

/** Multi-tag filtering uses AND semantics, case-insensitively. */
export function filterTracksByTags(tracks: Track[], selectedTags: string[]): Track[] {
  if (selectedTags.length === 0) return tracks
  const wanted = selectedTags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean)
  if (wanted.length === 0) return tracks
  return tracks.filter((track) => {
    const available = new Set((track.tags ?? []).map((tag) => tag.toLocaleLowerCase()))
    return wanted.every((tag) => available.has(tag))
  })
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
