<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import type { Track } from '../types'
import { formatClock } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import TrackContextMenu from './TrackContextMenu.vue'

const {
  state,
  queueTracks,
  currentTrack,
  closeQueue,
  playQueueItem,
  removeFromQueue,
  moveQueueItem,
  shuffleQueue,
  clearQueue,
  setPlayMode,
  exportQueuePlaylist,
  importQueuePlaylist
} = useApp()

const dragIndex = ref<number | null>(null)
const contextMenu = ref<{ track: Track; x: number; y: number } | null>(null)
let lastDragAt = 0

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeQueue()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function onDragStart(index: number, event: DragEvent): void {
  dragIndex.value = index
  lastDragAt = Date.now()
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDrop(index: number): void {
  if (dragIndex.value === null) return
  moveQueueItem(dragIndex.value, index)
  dragIndex.value = null
  lastDragAt = Date.now()
}

function onDragEnd(): void {
  dragIndex.value = null
  lastDragAt = Date.now()
}

function onRemove(trackId: string): void {
  void removeFromQueue(trackId)
}

function openContextMenu(track: Track, event: MouseEvent): void {
  contextMenu.value = { track, x: event.clientX, y: event.clientY }
}

function onPlay(trackId: string): void {
  if (Date.now() - lastDragAt < 220) return
  void playQueueItem(trackId)
}

function onClear(): void {
  if (state.queue.length === 0) return
  if (window.confirm('清空播放队列？当前歌曲会停止，但不会从曲库删除。')) {
    void clearQueue()
  }
}

function onRowKeydown(event: KeyboardEvent, trackId: string): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onPlay(trackId)
  }
}
</script>

<template>
  <div class="queue-layer">
    <div class="queue-backdrop" @click="closeQueue"></div>
    <aside class="queue-drawer" role="dialog" aria-modal="true" aria-label="播放队列">
      <header class="queue-heading">
        <div>
          <span class="eyebrow">PLAY QUEUE</span>
          <h2>播放队列 <span>{{ state.queue.length.toString().padStart(2, '0') }}</span></h2>
        </div>
        <div class="heading-actions">
          <button
            class="text-button"
            :disabled="state.queue.length < 2"
            title="打乱队列顺序"
            @click="shuffleQueue"
          >
            <AppIcon name="shuffle" :size="12" />
            打乱
          </button>
          <button class="text-button danger" :disabled="!state.queue.length" @click="onClear">清空</button>
          <button class="icon-button small" aria-label="关闭播放队列" @click="closeQueue">
            <AppIcon name="close" :size="15" />
          </button>
        </div>
      </header>

      <div class="mode-row" role="group" aria-label="播放模式">
        <button :class="{ active: state.playMode === 'sequential' }" @click="setPlayMode('sequential')">
          <AppIcon name="repeat" :size="14" />
          顺序循环
        </button>
        <button :class="{ active: state.playMode === 'repeat-one' }" @click="setPlayMode('repeat-one')">
          <AppIcon name="repeat-one" :size="14" />
          单曲循环
        </button>
        <button :class="{ active: state.playMode === 'shuffle' }" @click="setPlayMode('shuffle')">
          <AppIcon name="shuffle" :size="14" />
          随机
        </button>
      </div>

      <div v-if="queueTracks.length" class="queue-scroll">
        <div
          v-for="(track, index) in queueTracks"
          :key="track.id"
          class="queue-row"
          :class="{ active: currentTrack?.id === track.id }"
          draggable="true"
          role="button"
          tabindex="0"
          :aria-label="`播放 ${track.title}`"
          @click="onPlay(track.id)"
          @contextmenu.prevent="openContextMenu(track, $event)"
          @keydown="onRowKeydown($event, track.id)"
          @dragstart="onDragStart(index, $event)"
          @dragover.prevent
          @drop.prevent="onDrop(index)"
          @dragend="onDragEnd"
        >
          <span class="drag-handle" title="拖拽排序" aria-hidden="true">
            <AppIcon name="grip" :size="13" />
          </span>
          <span class="queue-index">
            <AppIcon v-if="currentTrack?.id === track.id" name="play" :size="10" filled />
            <template v-else>{{ (index + 1).toString().padStart(2, '0') }}</template>
          </span>
          <CoverArt
            :src="state.coverUrls[track.id]"
            :title="track.title"
            :artist="track.artist"
            size="xs"
            :alt="`${track.title} 封面`"
          />
          <span class="queue-copy">
            <strong>{{ track.title }}</strong>
            <span>{{ track.artist }}</span>
          </span>
          <span class="queue-duration">{{ formatClock(track.duration) }}</span>
          <button class="row-remove" :aria-label="`从队列移除 ${track.title}`" @click.stop="onRemove(track.id)">
            <AppIcon name="close" :size="12" />
          </button>
        </div>
      </div>

      <div v-else class="queue-empty">
        <span class="empty-icon"><AppIcon name="queue" :size="24" /></span>
        <p>播放队列还是空的</p>
        <span>从曲库点击歌曲会自动入队，也可以在筛选结果中批量加入。</span>
      </div>

      <footer class="queue-footer">
        <button class="text-button" :disabled="state.queueBusy" @click="importQueuePlaylist">
          <AppIcon name="upload" :size="13" />
          导入歌单
        </button>
        <button
          class="text-button accent"
          :disabled="state.queueBusy || !state.queue.length"
          @click="exportQueuePlaylist"
        >
          <AppIcon name="download" :size="13" />
          导出歌单
        </button>
      </footer>
    </aside>

    <TrackContextMenu
      v-if="contextMenu"
      :track="contextMenu.track"
      source="queue"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="contextMenu = null"
    />
  </div>
</template>

<style scoped>
.queue-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
}

.queue-backdrop {
  position: absolute;
  inset: 0;
  background: var(--drawer-scrim);
  backdrop-filter: blur(2px);
}

.queue-drawer {
  position: relative;
  z-index: 1;
  width: min(410px, calc(100vw - 40px));
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line-strong);
  background: var(--drawer-bg);
  box-shadow: -28px 0 80px rgb(0 0 0 / 35%);
  animation: queue-in 180ms ease-out;
}

@keyframes queue-in {
  from { transform: translateX(18px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.queue-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 25px 22px 16px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  display: block;
  color: var(--faint);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.19em;
  margin-bottom: 7px;
}

.queue-heading h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 460;
  letter-spacing: -0.03em;
}

.queue-heading h2 span {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 400;
  margin-left: 5px;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.text-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 9px;
  transition: color 160ms ease;
}

.text-button:hover:not(:disabled) { color: var(--text); }
.text-button:disabled { opacity: 0.35; cursor: default; }
.text-button.danger:hover { color: #e7a19a; }
.text-button.accent { color: var(--accent-text); }

.mode-row {
  display: flex;
  gap: 5px;
  padding: 12px 22px;
  border-bottom: 1px solid var(--line);
}

.mode-row button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 27px;
  color: var(--faint);
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 8.5px;
  transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
}

.mode-row button:hover { color: var(--muted); }
.mode-row button.active {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 20%);
  background: rgb(200 245 106 / 5%);
}

.queue-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 7px 9px;
}

.queue-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 51px;
  padding: 5px 7px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  outline: none;
}

.queue-row:hover,
.queue-row:focus-visible {
  background: rgb(255 255 255 / 2.5%);
}

.queue-row.active {
  background: rgb(200 245 106 / 4%);
  border-color: rgb(200 245 106 / 9%);
}

.drag-handle {
  display: grid;
  place-items: center;
  width: 12px;
  color: var(--faint);
  opacity: 0.45;
  cursor: grab;
  flex: 0 0 auto;
}

.queue-row:hover .drag-handle { opacity: 0.8; }

.queue-index {
  width: 15px;
  flex: 0 0 auto;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
  text-align: center;
}

.queue-row.active .queue-index { color: var(--accent-text); }

.queue-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.queue-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 10px;
  font-weight: 520;
}

.queue-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--faint);
  font-size: 8px;
}

.queue-duration {
  flex: 0 0 auto;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
}

.row-remove {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  color: var(--faint);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 160ms ease, color 160ms ease;
}

.queue-row:hover .row-remove,
.queue-row:focus-within .row-remove { opacity: 1; }
.row-remove:hover { color: #e7a19a; }

.queue-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 42px;
  text-align: center;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--faint);
  margin-bottom: 6px;
}

.queue-empty p { margin: 0; color: var(--muted); font-size: 12px; }
.queue-empty > span:last-child { color: var(--faint); font-size: 9px; line-height: 1.65; }

.queue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px;
  border-top: 1px solid var(--line);
  background: var(--drawer-footer-bg);
}
</style>
