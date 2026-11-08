import type { ShortcutAction } from '../types'

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  playPause: 'Space',
  previous: 'Ctrl+ArrowLeft',
  next: 'Ctrl+ArrowRight',
  volumeUp: 'Ctrl+ArrowUp',
  volumeDown: 'Ctrl+ArrowDown',
  seekBack5: 'ArrowLeft',
  seekForward5: 'ArrowRight',
  seekBack10: 'Shift+ArrowLeft',
  seekForward10: 'Shift+ArrowRight',
  speedHold: 'KeyF',
  speedToggle: 'KeyT',
  speedUp: 'Alt+ArrowUp',
  speedDown: 'Alt+ArrowDown',
  alignPause: 'KeyP',
  alignMark: 'Space',
  alignBack: 'ArrowLeft',
  alignForward: 'ArrowRight',
  alignUndo: 'KeyZ',
  alignRewind: 'KeyR',
  alignSave: 'KeyS'
}

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  playPause: '播放 / 暂停',
  previous: '上一首',
  next: '下一首',
  volumeUp: '音量 +',
  volumeDown: '音量 −',
  seekBack5: '后退 5 秒',
  seekForward5: '前进 5 秒',
  seekBack10: '后退 10 秒',
  seekForward10: '前进 10 秒',
  speedHold: '临时加速（按住）',
  speedToggle: '倍速切换',
  speedUp: '提高倍速',
  speedDown: '降低倍速',
  alignPause: '对轴：播放 / 暂停',
  alignMark: '对轴：给当前行打点',
  alignBack: '对轴：上一行 / 后退',
  alignForward: '对轴：下一行 / 前进',
  alignUndo: '对轴：撤销',
  alignRewind: '对轴：回退 3 秒',
  alignSave: '对轴：保存'
}

export const ALIGN_ACTIONS: ShortcutAction[] = [
  'alignPause',
  'alignMark',
  'alignBack',
  'alignForward',
  'alignUndo',
  'alignRewind',
  'alignSave'
]

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight'
])

export function shortcutFromEvent(event: KeyboardEvent): string {
  if (MODIFIER_CODES.has(event.code)) return ''
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(event.code)
  return parts.join('+')
}

/** Matches only the key code, allowing Shift/Ctrl for fine-step modifiers. */
export function shortcutCodeMatches(event: KeyboardEvent, binding: string): boolean {
  if (!binding) return false
  const code = binding.split('+').pop()
  return Boolean(code) && event.code === code
}

export function shortcutMatches(event: KeyboardEvent, binding: string): boolean {
  if (!binding) return false
  const parts = binding.split('+')
  const code = parts.pop()
  if (!code || event.code !== code) return false
  const ctrl = parts.includes('Ctrl')
  const alt = parts.includes('Alt')
  const shift = parts.includes('Shift')
  return (
    (event.ctrlKey || event.metaKey) === ctrl &&
    event.altKey === alt &&
    event.shiftKey === shift
  )
}

function keyLabel(code: string): string {
  if (code === 'Space') return 'Space'
  if (code === 'ArrowLeft') return '←'
  if (code === 'ArrowRight') return '→'
  if (code === 'ArrowUp') return '↑'
  if (code === 'ArrowDown') return '↓'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

export function shortcutLabel(binding: string): string {
  if (!binding) return '未设置'
  const parts = binding.split('+')
  const code = parts.pop() ?? ''
  return [...parts, keyLabel(code)].join(' + ')
}

export function normalizeShortcuts(
  value: Record<string, unknown> | undefined
): Record<ShortcutAction, string> {
  const normalized = { ...DEFAULT_SHORTCUTS }
  for (const action of Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]) {
    const candidate = value?.[action]
    if (typeof candidate === 'string') normalized[action] = candidate
  }
  return normalized
}

export function shortcutConflicts(
  shortcuts: Record<ShortcutAction, string>
): string[] {
  const seen = new Map<string, ShortcutAction>()
  const conflicts: string[] = []
  for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
    const binding = shortcuts[action]
    if (!binding) continue
    const previous = seen.get(binding)
    if (previous) {
      conflicts.push(`${SHORTCUT_LABELS[previous]} 与 ${SHORTCUT_LABELS[action]}`)
    } else {
      seen.set(binding, action)
    }
  }
  return conflicts
}
