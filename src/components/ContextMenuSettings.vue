<script setup lang="ts">
import { useApp } from '../stores/app'
import type { ContextMenuAction } from '../types'

const { state, savePreferences } = useApp()

const LABELS: Record<ContextMenuAction, string> = {
  play: '播放',
  queue: '加入播放队列',
  edit: '编辑歌曲信息',
  remove: '从曲库移除'
}

function toggle(id: ContextMenuAction): void {
  const item = state.preferences.contextMenu.find((entry) => entry.id === id)
  if (!item) return
  item.visible = !item.visible
  savePreferences()
}

function move(index: number, direction: -1 | 1): void {
  const target = index + direction
  if (target < 0 || target >= state.preferences.contextMenu.length) return
  const items = state.preferences.contextMenu
  ;[items[index], items[target]] = [items[target], items[index]]
  savePreferences()
}
</script>

<template>
  <div class="context-settings">
    <div class="context-intro">
      <span>右键歌曲时显示的项目与顺序</span>
      <span class="drag-hint">↑↓ 调整</span>
    </div>
    <div class="context-list">
      <div v-for="(item, index) in state.preferences.contextMenu" :key="item.id" class="context-row">
        <span class="context-label">{{ LABELS[item.id] }}</span>
        <div class="context-actions">
          <button :disabled="index === 0" aria-label="上移" @click="move(index, -1)">↑</button>
          <button
            :disabled="index === state.preferences.contextMenu.length - 1"
            aria-label="下移"
            @click="move(index, 1)"
          >
            ↓
          </button>
          <button
            class="switch tiny"
            :class="{ on: item.visible }"
            role="switch"
            :aria-checked="item.visible"
            :aria-label="`显示 ${LABELS[item.id]}`"
            @click="toggle(item.id)"
          >
            <span></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--faint);
  font-size: 8.5px;
}

.drag-hint {
  font-family: var(--font-mono);
  font-size: 7px;
}

.context-list {
  display: flex;
  flex-direction: column;
}

.context-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  border-bottom: 1px solid var(--line);
}

.context-label {
  color: var(--muted);
  font-size: 9px;
}

.context-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.context-actions > button:not(.switch) {
  width: 20px;
  height: 20px;
  color: var(--faint);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 10px;
}

.context-actions > button:not(.switch):hover:not(:disabled) {
  color: var(--text);
}

.context-actions > button:disabled {
  opacity: 0.25;
}

.switch {
  position: relative;
  width: 29px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: var(--line-strong);
  transition: background 160ms ease;
}

.switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 160ms ease, background 160ms ease;
}

.switch.on {
  background: var(--accent);
}

.switch.on span {
  background: var(--on-accent);
  transform: translateX(13px);
}
</style>
