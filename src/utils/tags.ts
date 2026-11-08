import type { Track } from '../types'

export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 24

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true })

/** Normalizes a list of tags while preserving the first spelling/casing. */
export function normalizeTagList(tags: Iterable<string>, limit = MAX_TAGS): string[] {
  const normalized: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH)
    if (!tag) continue
    if (normalized.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      continue
    }
    normalized.push(tag)
    if (normalized.length >= limit) break
  }
  return normalized
}

/** All known tags, deduplicated and sorted for autocomplete/filter controls. */
export function collectTagHistory(tracks: Track[]): string[] {
  const tags = new Map<string, string>()
  for (const track of tracks) {
    for (const tag of track.tags ?? []) {
      const trimmed = tag.trim()
      if (!trimmed) continue
      const key = trimmed.toLocaleLowerCase()
      if (!tags.has(key)) tags.set(key, trimmed)
    }
  }
  return [...tags.values()].sort(collator.compare)
}

export function mergeTags(current: string[], incoming: string[]): string[] {
  return normalizeTagList([...(current ?? []), ...(incoming ?? [])])
}
