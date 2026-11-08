import type {
  PlaylistFile,
  PlaylistMatch,
  PlaylistTrackSnapshot,
  PlayMode,
  Track
} from '../types'
import { basename } from './library'
import { mergeTags, normalizeTagList } from './tags'

const PLAY_MODES: PlayMode[] = ['sequential', 'repeat-one', 'shuffle']

function isPlayMode(value: unknown): value is PlayMode {
  return typeof value === 'string' && PLAY_MODES.includes(value as PlayMode)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

export function buildPlaylistFile(tracks: Track[], playMode: PlayMode): PlaylistFile {
  const entries: PlaylistTrackSnapshot[] = tracks.map((track) => ({
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    fileName: basename(track.filePath),
    tags: normalizeTagList(track.tags ?? [])
  }))
  return {
    kind: 'kexgo-playlist',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    playMode,
    tracks: entries
  }
}

export function serializePlaylist(file: PlaylistFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

export function parsePlaylistFile(raw: string): PlaylistFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('不是有效的 JSON 文件')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('歌单内容无效')
  }
  const data = parsed as Record<string, unknown>
  if (data.kind !== 'kexgo-playlist') {
    throw new Error('不是 KexGo 歌单文件')
  }
  if (data.schemaVersion !== 1) {
    throw new Error('歌单版本不受支持')
  }
  if (!Array.isArray(data.tracks)) {
    throw new Error('歌单缺少歌曲列表')
  }
  if (data.tracks.length > 5000) {
    throw new Error('歌单歌曲数量过多')
  }

  const tracks: PlaylistTrackSnapshot[] = data.tracks.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('歌单中的歌曲元数据无效')
    }
    const entry = item as Record<string, unknown>
    const tags = Array.isArray(entry.tags)
      ? normalizeTagList(entry.tags.filter((tag): tag is string => typeof tag === 'string'))
      : []
    const duration = typeof entry.duration === 'number' && Number.isFinite(entry.duration)
      ? Math.max(0, entry.duration)
      : 0
    return {
      trackId: text(entry.trackId),
      title: text(entry.title),
      artist: text(entry.artist),
      album: text(entry.album),
      duration,
      fileName: text(entry.fileName),
      tags
    }
  })

  return {
    kind: 'kexgo-playlist',
    schemaVersion: 1,
    exportedAt: text(data.exportedAt),
    playMode: isPlayMode(data.playMode) ? data.playMode : 'sequential',
    tracks
  }
}

function pickByMetadata(entry: PlaylistTrackSnapshot, candidates: Track[]): Track | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  if (entry.duration > 0) {
    return candidates.slice().sort(
      (a, b) => Math.abs(a.duration - entry.duration) - Math.abs(b.duration - entry.duration)
    )[0]
  }
  return candidates[0]
}

export function matchPlaylist(file: PlaylistFile, library: Track[]): PlaylistMatch {
  const used = new Set<string>()
  const matched: PlaylistMatch['matched'] = []
  const unmatched: PlaylistTrackSnapshot[] = []
  const tagUpdates: PlaylistMatch['tagUpdates'] = []

  for (const entry of file.tracks) {
    let track = library.find((candidate) => candidate.id === entry.trackId && !used.has(candidate.id))

    if (!track) {
      const title = normalized(entry.title)
      const artist = normalized(entry.artist)
      if (title && artist) {
        track = pickByMetadata(
          entry,
          library.filter(
            (candidate) =>
              !used.has(candidate.id) &&
              normalized(candidate.title) === title &&
              normalized(candidate.artist) === artist
          )
        ) ?? undefined
      }
    }

    if (!track && entry.fileName) {
      const fileName = normalized(entry.fileName)
      track =
        library.find(
          (candidate) =>
            !used.has(candidate.id) && normalized(basename(candidate.filePath)) === fileName
        ) ?? undefined
    }

    if (!track) {
      unmatched.push(entry)
      continue
    }

    used.add(track.id)
    matched.push({ entry, track })
    const mergedTags = mergeTags(track.tags ?? [], entry.tags)
    if (
      mergedTags.length !== (track.tags?.length ?? 0) ||
      mergedTags.some((tag, index) => tag !== track.tags?.[index])
    ) {
      tagUpdates.push({ trackId: track.id, tags: mergedTags })
    }
  }

  return {
    matched,
    unmatched,
    queue: [...new Set(matched.map(({ track }) => track.id))],
    tagUpdates
  }
}
