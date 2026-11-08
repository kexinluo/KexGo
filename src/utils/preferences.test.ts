import { describe, expect, it } from 'vitest'
import { detectScript } from './language'
import {
  DEFAULT_LYRICS_FONT_SIZE,
  accentTextColor,
  clampLyricsFontSize,
  createDefaultPreferences,
  normalizePreferences,
  normalizeTheme,
  onAccentColor,
  resolveTheme
} from './preferences'
import {
  DEFAULT_SHORTCUTS,
  shortcutConflicts,
  shortcutLabel,
  shortcutMatches
} from './shortcuts'

describe('theme preferences', () => {
  it('normalizes unknown theme values to dark', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('system')).toBe('system')
    expect(normalizeTheme('neon')).toBe('dark')
    expect(normalizeTheme(undefined)).toBe('dark')
  })

  it('resolves the system theme', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('lyrics size preferences', () => {
  it('clamps lyrics size into the supported range', () => {
    expect(clampLyricsFontSize(15)).toBe(15)
    expect(clampLyricsFontSize(4)).toBe(12)
    expect(clampLyricsFontSize(31)).toBe(20)
    expect(clampLyricsFontSize(15.6)).toBe(16)
  })

  it('falls back for missing or invalid values', () => {
    expect(clampLyricsFontSize(undefined)).toBe(DEFAULT_LYRICS_FONT_SIZE)
    expect(clampLyricsFontSize('nope')).toBe(DEFAULT_LYRICS_FONT_SIZE)
  })
})

describe('preference normalization', () => {
  it('merges partial preferences with safe defaults', () => {
    const defaults = createDefaultPreferences()
    const prefs = normalizePreferences({
      primaryColor: '#336699',
      secondaryColor: 'invalid',
      pauseFadeMs: 99999,
      languageFonts: { japanese: 'Yu Mincho' },
      layout: { showLyrics: false, sidebarWidth: 999 }
    })
    expect(prefs.primaryColor).toBe('#336699')
    expect(prefs.secondaryColor).toBe('')
    expect(prefs.pauseFadeMs).toBe(2000)
    expect(prefs.languageFonts.japanese).toBe('Yu Mincho')
    expect(prefs.languageFonts.korean).toBe(defaults.languageFonts.korean)
    expect(prefs.layout.showLyrics).toBe(false)
    expect(prefs.layout.sidebarWidth).toBe(380)
    expect(prefs.shortcuts).toEqual(DEFAULT_SHORTCUTS)
  })

  it('keeps custom colors contrast-safe', () => {
    expect(accentTextColor('#f7f7f7', 'light')).not.toBe('#f7f7f7')
    expect(onAccentColor('#111111')).toBe('#f5f7ef')
    expect(onAccentColor('#dddddd')).toBe('#11140e')
  })
})

describe('shortcut and language helpers', () => {
  it('labels and detects shortcut conflicts', () => {
    expect(shortcutLabel('Ctrl+ArrowLeft')).toBe('Ctrl + ←')
    const conflicts = shortcutConflicts({
      ...DEFAULT_SHORTCUTS,
      next: DEFAULT_SHORTCUTS.previous
    })
    expect(conflicts.length).toBeGreaterThan(0)
  })

  it('matches key codes with exact modifiers', () => {
    const event = { code: 'ArrowLeft', ctrlKey: true, altKey: false, shiftKey: false } as KeyboardEvent
    expect(shortcutMatches(event, 'Ctrl+ArrowLeft')).toBe(true)
    expect(shortcutMatches(event, 'ArrowLeft')).toBe(false)
  })

  it('classifies lyric scripts for font fallback', () => {
    expect(detectScript('夜に駆ける')).toBe('ja')
    expect(detectScript('밤을 걷다')).toBe('ko')
    expect(detectScript('夜晚')).toBe('han')
    expect(detectScript('Night drive')).toBe('latin')
  })
})
