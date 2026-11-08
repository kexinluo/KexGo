import { describe, expect, it } from 'vitest'
import type { PlaylistFile, Track } from '../types'
import { filterTracksByTags, sortLibraryTracks } from './library'
import { buildPlaylistFile, matchPlaylist, parsePlaylistFile, serializePlaylist } from './playlist'
import { moveQueueItem, randomNextIndex, sequentialNextIndex } from './queue'
import { collectTagHistory, mergeTags, normalizeTagList } from './tags'

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    filePath: `D:/Music/${id}.mp3`,
    title: id,
    artist: 'Artist',
    album: 'Album',
    duration: 100,
    coverPath: null,
    lrcPath: null,
    lyricsText: '',
    lyricsOrigin: 'unknown',
    tags: [],
    playCount: 0,
    pauseFade: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('library sorting and filtering', () => {
  const tracks = [
    track('b', { title: 'Bravo', artist: 'Zed', tags: ['夜晚', '独立'], playCount: 2 }),
    track('a', { title: 'Alpha', artist: 'Amy', tags: ['夜晚'], playCount: 9 }),
    track('c', { title: 'Charlie', artist: 'Mike', tags: [], playCount: 1 })
  ]

  it('sorts by title, artist, play count and custom order', () => {
    expect(sortLibraryTracks(tracks, 'title', []).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(sortLibraryTracks(tracks, 'artist', []).map((item) => item.id)).toEqual(['a', 'c', 'b'])
    expect(sortLibraryTracks(tracks, 'playCount', []).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(sortLibraryTracks(tracks, 'custom', ['c', 'b', 'a']).map((item) => item.id)).toEqual([
      'c',
      'b',
      'a'
    ])
  })

  it('filters with AND semantics and case-insensitive tags', () => {
    expect(filterTracksByTags(tracks, ['夜晚']).map((item) => item.id)).toEqual(['b', 'a'])
    expect(filterTracksByTags(tracks, ['夜晚', '独立']).map((item) => item.id)).toEqual(['b'])
    expect(filterTracksByTags(tracks, ['不存在'])).toEqual([])
  })
})

describe('tag helpers', () => {
  it('normalizes and deduplicates tags', () => {
    expect(normalizeTagList([' 夜晚 ', '夜晚', '独立'])).toEqual(['夜晚', '独立'])
    expect(mergeTags(['夜晚'], ['独立', '夜晚'])).toEqual(['夜晚', '独立'])
  })

  it('builds sorted unique tag history', () => {
    const history = collectTagHistory([
      track('a', { tags: ['夜晚', '独立'] }),
      track('b', { tags: ['夜晚', '城市'] })
    ])
    expect(history).toHaveLength(3)
    expect(history).toContain('夜晚')
    expect(history).toContain('独立')
    expect(history).toContain('城市')
  })
})

describe('queue helpers', () => {
  it('wraps sequential indexes in both directions', () => {
    expect(sequentialNextIndex(3, 2, 1)).toBe(0)
    expect(sequentialNextIndex(3, 0, -1)).toBe(2)
    expect(sequentialNextIndex(0, 0, 1)).toBe(-1)
  })

  it('never repeats the current item in random mode when possible', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(randomNextIndex(4, 1, () => i / 20)).not.toBe(1)
    }
    expect(randomNextIndex(1, 0)).toBe(0)
  })

  it('reorders items without mutating the source', () => {
    const source = ['a', 'b', 'c']
    expect(moveQueueItem(source, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(source).toEqual(['a', 'b', 'c'])
  })
})

describe('playlist JSON', () => {
  const library = [
    track('a', { title: '夜车', artist: '林间', duration: 96, tags: ['夜晚'], filePath: 'D:/Music/night.mp3' }),
    track('b', { title: '夏日', artist: '海边', duration: 120, tags: [] })
  ]

  it('round-trips metadata, tags and queue order without audio paths', () => {
    const file = buildPlaylistFile(library, 'shuffle')
    const raw = serializePlaylist(file)
    expect(raw).not.toContain('D:/Music')
    const parsed = parsePlaylistFile(raw)
    expect(parsed.playMode).toBe('shuffle')
    expect(parsed.tracks.map((item) => item.title)).toEqual(['夜车', '夏日'])
    expect(parsed.tracks[0].tags).toEqual(['夜晚'])
    expect(parsed.tracks[0].fileName).toBe('night.mp3')
  })

  it('matches by id or metadata and reports missing songs', () => {
    const file: PlaylistFile = {
      kind: 'kexgo-playlist',
      schemaVersion: 1,
      exportedAt: new Date(0).toISOString(),
      playMode: 'sequential',
      tracks: [
        { trackId: 'b', title: '夏日', artist: '海边', album: '', duration: 120, fileName: '', tags: ['夏天'] },
        { trackId: 'missing', title: '不存在', artist: '某人', album: '', duration: 10, fileName: '', tags: [] }
      ]
    }
    const result = matchPlaylist(file, library)
    expect(result.matched.map(({ track }) => track.id)).toEqual(['b'])
    expect(result.queue).toEqual(['b'])
    expect(result.unmatched).toHaveLength(1)
    expect(result.tagUpdates[0]).toEqual({ trackId: 'b', tags: ['夏天'] })
  })

  it('rejects unknown files', () => {
    expect(() => parsePlaylistFile('{"kind":"other"}')).toThrow('不是 KexGo 歌单文件')
    expect(() => parsePlaylistFile('not json')).toThrow('不是有效的 JSON 文件')
  })
})
