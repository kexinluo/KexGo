import { describe, expect, it } from 'vitest'
import {
  activeLineIndex,
  applyOffset,
  formatLrc,
  looksLikeLrc,
  normalizePastedLyrics,
  parseLyrics,
  timedLineCount,
  withAdjustedLine
} from './lrc'
import { formatLyricTime, parseTimeInput } from './time'

describe('LRC parsing', () => {
  it('parses standard timestamps, metadata and enhanced tags', () => {
    const parsed = parseLyrics(
      '[ti:夜车]\n[ar:林间电台]\n[00:01.20]第一行\n[00:12.345]<00:12.345>第二<00:13.000>行\n'
    )
    expect(parsed.hasTimestamps).toBe(true)
    expect(parsed.metadata.ti).toBe('夜车')
    expect(parsed.lines[0].timeMs).toBe(1200)
    expect(parsed.lines[1].timeMs).toBe(12345)
    expect(parsed.lines[1].text).toBe('第二行')
  })

  it('expands multiple timestamps on one line', () => {
    const parsed = parseLyrics('[00:10.00][01:10.50]副歌\n')
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.lines.map((line) => line.timeMs)).toEqual([10000, 70500])
  })

  it('applies file offset metadata', () => {
    const parsed = parseLyrics('[offset:+500]\n[00:02.00]晚一点\n')
    expect(parsed.lines[0].timeMs).toBe(2500)
  })

  it('keeps plain text lines as an alignment script', () => {
    const parsed = parseLyrics('第一行\n\n第二行\n第三行')
    expect(parsed.hasTimestamps).toBe(false)
    expect(parsed.lines).toHaveLength(3)
    expect(parsed.lines[1].text).toBe('第二行')
  })

  it('preserves script order for partially timed lyrics', () => {
    const parsed = parseLyrics('[00:03.00]第三行\n还没打点的第一行\n[00:07.00]第四行')
    expect(parsed.lines.map((line) => line.text)).toEqual(['第三行', '还没打点的第一行', '第四行'])
  })

  it('does not misread a timestamp line as metadata', () => {
    const parsed = parseLyrics('[00:01.00]开始')
    expect(parsed.lines[0].text).toBe('开始')
    expect(parsed.metadata).toEqual({})
  })
})

describe('LRC export', () => {
  it('formats centisecond timestamps and sorted lines', () => {
    const lrc = formatLrc(
      [
        { id: 'b', text: '第二行', timeMs: 125_678 },
        { id: 'a', text: '第一行', timeMs: 1_200 },
        { id: 'c', text: '还没打点', timeMs: null }
      ],
      { title: '夜车', artist: '林间电台', by: 'KexGo' }
    )
    expect(lrc).toContain('[ti:夜车]')
    expect(lrc).toContain('[00:01.20]第一行')
    expect(lrc).toContain('[02:05.67]第二行')
    expect(lrc).not.toContain('还没打点')
  })

  it('formats and parses time helpers consistently', () => {
    expect(formatLyricTime(65_430)).toBe('01:05.43')
    expect(parseTimeInput('01:05.43')).toBe(65_430)
    expect(formatLyricTime(null)).toBe('--:--.--')
  })

  it('stays within valid centisecond precision when seeking a rounded value', () => {
    const lrc = formatLrc([{ id: 'a', text: 'x', timeMs: 59_999 }])
    expect(lrc).toBe('[00:59.99]x\n')
  })
})

describe('pasted lyrics cleanup', () => {
  it('removes blank lines and merges short fragments', () => {
    const report = normalizePastedLyrics(
      '  第一行  \n\n\n啊\n第二行\n   \n这是一行相当长的歌词，用来确认长行提示确实会触发并返回对应行号，请把它拆成两行\n'
    )
    expect(report.removedBlank).toBe(4)
    expect(report.mergedShort).toBe(1)
    expect(report.text.split('\n')[0]).toBe('第一行啊')
    expect(report.longLines).toEqual([3])
  })

  it('adds a space when joining short latin fragments', () => {
    const report = normalizePastedLyrics('I said\nOh')
    expect(report.text).toBe('I said Oh')
  })

  it('detects timestamped files', () => {
    expect(looksLikeLrc('[00:01.00]x')).toBe(true)
    expect(looksLikeLrc('普通歌词')).toBe(false)
  })
})

describe('alignment helpers', () => {
  const lines = parseLyrics('[00:05.00]一\n[00:10.00]二\n[00:15.00]三\n').lines

  it('finds the active line for a playhead position', () => {
    expect(activeLineIndex(lines, 1000)).toBe(-1)
    expect(activeLineIndex(lines, 5000)).toBe(0)
    expect(activeLineIndex(lines, 11_000)).toBe(1)
    expect(activeLineIndex(lines, 30_000)).toBe(2)
  })

  it('shifts all timed lines and clamps at zero', () => {
    const shifted = applyOffset(lines, -6000)
    expect(shifted.map((line) => line.timeMs)).toEqual([0, 4000, 9000])
    expect(timedLineCount(shifted)).toBe(3)
  })

  it('adjusts a single line', () => {
    const adjusted = withAdjustedLine(lines, 1, -100)
    expect(adjusted[1].timeMs).toBe(9900)
    expect(adjusted[0].timeMs).toBe(5000)
  })
})
