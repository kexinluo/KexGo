import type {
  AnnotationMode,
  AppPreferences,
  ContextMenuAction,
  PauseMode,
  ThemeMode
} from '../types'
import { DEFAULT_SHORTCUTS, normalizeShortcuts } from './shortcuts'

export const MIN_LYRICS_FONT_SIZE = 12
export const MAX_LYRICS_FONT_SIZE = 20
export const DEFAULT_LYRICS_FONT_SIZE = 15

export const DEFAULT_FONT_STACKS = {
  han: "'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans CJK SC', sans-serif",
  latin: "'Segoe UI Variable Text', 'Segoe UI', 'SF Pro Text', sans-serif",
  japanese: "'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif",
  korean: "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
}

const CONTEXT_ACTIONS: ContextMenuAction[] = ['play', 'queue', 'edit', 'remove']

export function createDefaultPreferences(): AppPreferences {
  return {
    primaryColor: '',
    secondaryColor: '',
    uiFont: '',
    lyricsFont: '',
    languageFonts: { ...DEFAULT_FONT_STACKS },
    shortcuts: { ...DEFAULT_SHORTCUTS },
    contextMenu: CONTEXT_ACTIONS.map((id) => ({ id, visible: true })),
    pauseMode: 'instant',
    pauseFadeMs: 220,
    customCssEnabled: false,
    showTranslations: false,
    annotationMode: 'none',
    layout: {
      showSidebar: true,
      showCover: true,
      showTags: true,
      showLyrics: true,
      sidebarWidth: 310,
      coverScale: 1
    }
  }
}

function validHex(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : ''
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

export function normalizePreferences(value: unknown): AppPreferences {
  const defaults = createDefaultPreferences()
  if (!value || typeof value !== 'object') return defaults
  const raw = value as Record<string, unknown>
  const fonts = raw.languageFonts && typeof raw.languageFonts === 'object'
    ? raw.languageFonts as Record<string, unknown>
    : {}
  const layout = raw.layout && typeof raw.layout === 'object'
    ? raw.layout as Record<string, unknown>
    : {}
  const pauseMode: PauseMode = raw.pauseMode === 'fade' ? 'fade' : 'instant'
  const annotationMode: AnnotationMode =
    raw.annotationMode === 'ruby' || raw.annotationMode === 'romaji'
      ? raw.annotationMode
      : 'none'

  const menu = Array.isArray(raw.contextMenu)
    ? CONTEXT_ACTIONS.map((id) => {
        const found = (raw.contextMenu as unknown[]).find(
          (item) =>
            item &&
            typeof item === 'object' &&
            (item as Record<string, unknown>).id === id
        ) as Record<string, unknown> | undefined
        return {
          id,
          visible: found ? found.visible !== false : true
        }
      })
    : defaults.contextMenu

  return {
    primaryColor: validHex(raw.primaryColor),
    secondaryColor: validHex(raw.secondaryColor),
    uiFont: stringValue(raw.uiFont),
    lyricsFont: stringValue(raw.lyricsFont),
    languageFonts: {
      han: stringValue(fonts.han, defaults.languageFonts.han),
      latin: stringValue(fonts.latin, defaults.languageFonts.latin),
      japanese: stringValue(fonts.japanese, defaults.languageFonts.japanese),
      korean: stringValue(fonts.korean, defaults.languageFonts.korean)
    },
    shortcuts: normalizeShortcuts(
      raw.shortcuts && typeof raw.shortcuts === 'object'
        ? raw.shortcuts as Record<string, unknown>
        : undefined
    ),
    contextMenu: menu,
    pauseMode,
    pauseFadeMs: clampNumber(raw.pauseFadeMs, 0, 2000, defaults.pauseFadeMs),
    customCssEnabled: raw.customCssEnabled === true,
    showTranslations: raw.showTranslations === true,
    annotationMode,
    layout: {
      showSidebar: layout.showSidebar !== false,
      showCover: layout.showCover !== false,
      showTags: layout.showTags !== false,
      showLyrics: layout.showLyrics !== false,
      sidebarWidth: clampNumber(layout.sidebarWidth, 250, 380, 310),
      coverScale: clampNumber(layout.coverScale, 0.8, 1.1, 1)
    }
  }
}

export function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' || value === 'system' ? value : 'dark'
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): 'dark' | 'light' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  return mode
}

export function clampLyricsFontSize(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_LYRICS_FONT_SIZE
  return Math.min(MAX_LYRICS_FONT_SIZE, Math.max(MIN_LYRICS_FONT_SIZE, Math.round(numeric)))
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (!match) return null
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`
}

export function mixHex(value: string, target: string, amount: number): string {
  const sourceRgb = parseHex(value)
  const targetRgb = parseHex(target)
  if (!sourceRgb || !targetRgb) return value
  const ratio = Math.min(1, Math.max(0, amount))
  return toHex(
    sourceRgb[0] + (targetRgb[0] - sourceRgb[0]) * ratio,
    sourceRgb[1] + (targetRgb[1] - sourceRgb[1]) * ratio,
    sourceRgb[2] + (targetRgb[2] - sourceRgb[2]) * ratio
  )
}

export function accentTextColor(value: string, theme: 'dark' | 'light'): string {
  const rgb = parseHex(value)
  if (!rgb) return value
  const [red, green, blue] = rgb
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  if (theme === 'light') {
    return luminance > 0.42 ? mixHex(value, '#000000', 0.42) : value
  }
  return luminance < 0.42 ? mixHex(value, '#ffffff', 0.3) : value
}

export function onAccentColor(value: string): string {
  const rgb = parseHex(value)
  if (!rgb) return '#11140e'
  const [red, green, blue] = rgb
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance > 0.45 ? '#11140e' : '#f5f7ef'
}

export function accentSoftColor(value: string, amount = 0.12): string {
  const rgb = parseHex(value)
  if (!rgb) return 'transparent'
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${Math.round(amount * 100)}%)`
}
