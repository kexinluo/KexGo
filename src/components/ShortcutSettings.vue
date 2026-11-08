<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import type { ShortcutAction } from '../types'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  shortcutFromEvent,
  shortcutLabel
} from '../utils/shortcuts'

const { state, savePreferences, toast } = useApp()
const listening = ref<ShortcutAction | null>(null)
const error = ref('')

const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]

function startListening(action: ShortcutAction): void {
  listening.value = action
  error.value = ''
}

function cancel(): void {
  listening.value = null
  error.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (!listening.value) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') {
    cancel()
    return
  }
  const binding = shortcutFromEvent(event)
  if (!binding) {
    error.value = '请再按一个普通按键或组合键'
    return
  }
  const action = listening.value
  const duplicate = (Object.keys(state.preferences.shortcuts) as ShortcutAction[]).find(
    (candidate) => candidate !== action && state.preferences.shortcuts[candidate] === binding
  )
  if (duplicate) {
    error.value = `与“${SHORTCUT_LABELS[duplicate]}”冲突`
    return
  }
  state.preferences.shortcuts[action] = binding
  savePreferences()
  listening.value = null
  error.value = ''
}

function resetAll(): void {
  state.preferences.shortcuts = { ...DEFAULT_SHORTCUTS }
  savePreferences()
  toast('success', '快捷键已恢复默认')
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="shortcut-settings">
    <div class="shortcut-intro">
      <span>点击快捷键后按新的组合键；Esc 取消。</span>
      <button @click="resetAll">恢复默认</button>
    </div>
    <p v-if="error" class="shortcut-error">{{ error }}</p>
    <div class="shortcut-list">
      <div v-for="action in actions" :key="action" class="shortcut-row">
        <span>{{ SHORTCUT_LABELS[action] }}</span>
        <button
          class="shortcut-key"
          :class="{ listening: listening === action }"
          @click="startListening(action)"
        >
          {{ listening === action ? '按下快捷键…' : shortcutLabel(state.preferences.shortcuts[action]) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcut-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--faint);
  font-size: 8.5px;
}

.shortcut-intro button {
  color: var(--accent-text);
  font-size: 8.5px;
}

.shortcut-error {
  margin: 0;
  color: #d87864;
  font-size: 8.5px;
}

.shortcut-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 16px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 29px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 8.5px;
}

.shortcut-key {
  min-width: 72px;
  max-width: 150px;
  padding: 3px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 7.5px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shortcut-key:hover,
.shortcut-key.listening {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 28%);
  background: var(--accent-soft);
}
</style>
