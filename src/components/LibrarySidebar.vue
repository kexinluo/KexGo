<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import type { LibrarySortMode } from '../types'
import { filterTracksByTags, sortLibraryTracks } from '../utils/library'
import type { Track } from '../types'
import { formatClock } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import TrackContextMenu from './TrackContextMenu.vue'

const emit = defineEmits<{ (event: 'import'): void }>()
const {
  state,
  currentTrack,
  currentCover,
  selectTrack,
  tagHistory,
  toggleTagFilter,
  clearTagFilters,
  addTracksToQueue,
  setSortMode,
  moveLibraryItem
} = useApp()

const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const tagFilterOpen = ref(false)
const contextMenu = ref<{ track: Track; x: number; y: number } | null>(null)
let dragTrackId: string | null = null
let lastDragAt = 0

const filteredTracks = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  const searched = needle
    ? state.tracks.filter((track) =>
        `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(needle)
      )
    : state.tracks
  return sortLibraryTracks(
    filterTracksByTags(searched, state.selectedTags),
    state.sortMode,
    state.libraryOrder
  )
})

function onSortChange(event: Event): void {
  setSortMode((event.target as HTMLSelectElement).value as LibrarySortMode)
}

function addFilteredToQueue(): void {
  addTracksToQueue(filteredTracks.value.map((track) => track.id), true)
}

function clearFilters(): void {
  query.value = ''
  clearTagFilters()
}

function coverFor(trackId: string): string | null {
  return state.coverUrls[trackId] ?? null
}

function onRowClick(track: (typeof state.tracks)[number]): void {
  if (Date.now() - lastDragAt < 220) return
  void selectTrack(track)
}

function onLibraryDragStart(track: (typeof state.tracks)[number], event: DragEvent): void {
  if (state.sortMode !== 'custom') {
    event.preventDefault()
    return
  }
  dragTrackId = track.id
  lastDragAt = Date.now()
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', track.id)
  }
}

function onLibraryDrop(track: (typeof state.tracks)[number]): void {
  if (!dragTrackId || dragTrackId === track.id) return
  moveLibraryItem(dragTrackId, track.id)
  dragTrackId = null
  lastDragAt = Date.now()
}

function onLibraryDragEnd(): void {
  dragTrackId = null
  lastDragAt = Date.now()
}

function openContextMenu(track: Track, event: MouseEvent): void {
  contextMenu.value = { track, x: event.clientX, y: event.clientY }
}

function focusSearch(): void {
  searchInput.value?.focus()
}

defineExpose({ focusSearch })
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-heading">
      <div>
        <span class="eyebrow">COLLECTION</span>
        <h2>音乐库 <span class="count">{{ state.tracks.length.toString().padStart(2, '0') }}</span></h2>
      </div>
      <button class="icon-button small" aria-label="导入歌曲" title="导入歌曲" @click="emit('import')">
        <AppIcon name="plus" :size="17" />
      </button>
    </div>

    <label class="search-field">
      <AppIcon name="search" :size="15" />
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        placeholder="搜索歌名或歌手"
        autocomplete="off"
        spellcheck="false"
      />
      <button v-if="query" class="search-clear" aria-label="清空搜索" @click="query = ''">
        <AppIcon name="close" :size="12" />
      </button>
      <kbd v-else>/</kbd>
    </label>

    <div class="collection-controls">
      <label class="sort-control">
        <span>排序</span>
        <select :value="state.sortMode" aria-label="曲库排序" @change="onSortChange">
          <option value="custom">自定义顺序</option>
          <option value="title">标题</option>
          <option value="artist">歌手</option>
          <option value="playCount">播放次数</option>
        </select>
        <AppIcon name="chevron" :size="11" />
      </label>
      <button
        class="filter-toggle"
        :class="{ active: state.selectedTags.length > 0 }"
        :aria-expanded="tagFilterOpen"
        @click="tagFilterOpen = !tagFilterOpen"
      >
        <AppIcon name="filter" :size="13" />
        标签
        <span v-if="state.selectedTags.length" class="filter-count">{{ state.selectedTags.length }}</span>
      </button>
    </div>

    <div v-if="tagFilterOpen" class="tag-panel">
      <div v-if="tagHistory.length" class="tag-options">
        <button
          v-for="tag in tagHistory"
          :key="tag"
          class="filter-chip"
          :class="{ active: state.selectedTags.includes(tag) }"
          @click="toggleTagFilter(tag)"
        >
          {{ tag }}
        </button>
      </div>
      <p v-else class="no-tags">还没有标签，可在歌曲下方添加。</p>
      <button v-if="state.selectedTags.length" class="clear-filters" @click="clearTagFilters">清除标签筛选</button>
    </div>

    <div class="collection-actions">
      <span>
        {{ filteredTracks.length }} 首
        <template v-if="state.sortMode === 'custom' && filteredTracks.length > 1"> · 拖动排序</template>
        <template v-if="state.selectedTags.length"> · {{ state.selectedTags.join(' + ') }}</template>
      </span>
      <button class="queue-add" :disabled="!filteredTracks.length" @click="addFilteredToQueue">
        <AppIcon name="queue" :size="12" />
        加入队列
      </button>
    </div>

    <div class="track-scroll">
      <TransitionGroup v-if="filteredTracks.length" name="track" tag="div" class="track-list">
        <button
          v-for="(track, index) in filteredTracks"
          :key="track.id"
          class="track-row"
          :class="{ active: currentTrack?.id === track.id }"
          :title="`${track.artist} · 播放 ${track.playCount ?? 0} 次`"
          :draggable="state.sortMode === 'custom'"
          @click="onRowClick(track)"
          @contextmenu.prevent="openContextMenu(track, $event)"
          @dragstart="onLibraryDragStart(track, $event)"
          @dragover.prevent
          @drop.prevent="onLibraryDrop(track)"
          @dragend="onLibraryDragEnd"
        >
          <span class="track-index">
            <span v-if="currentTrack?.id === track.id && state.playing" class="playing-bars" aria-label="正在播放">
              <i></i><i></i><i></i>
            </span>
            <span v-else>{{ (index + 1).toString().padStart(2, '0') }}</span>
          </span>
          <CoverArt
            :src="currentTrack?.id === track.id ? currentCover : coverFor(track.id)"
            :title="track.title"
            :artist="track.artist"
            size="xs"
            :alt="`${track.title} 封面`"
          />
          <span class="track-text">
            <strong>{{ track.title }}</strong>
            <span>{{ track.artist }}</span>
          </span>
          <span class="track-side">
            <span
              v-if="state.trackIssues[track.id]"
              class="issue-dot"
              :title="state.trackIssues[track.id].message"
              aria-label="文件不可用"
            >
              <AppIcon name="alert-triangle" :size="11" />
            </span>
            <span v-else-if="track.lyricsText" class="lyric-dot" title="已有歌词"></span>
            <span class="duration">{{ formatClock(track.duration) }}</span>
          </span>
        </button>
      </TransitionGroup>

      <div v-else-if="state.tracks.length === 0" class="sidebar-empty">
        <span class="empty-ornament"><AppIcon name="disc" :size="22" /></span>
        <p>还没有收藏任何声音</p>
        <button class="text-button" @click="emit('import')">导入第一首歌</button>
      </div>

      <div v-else class="sidebar-empty compact">
        <p>没有匹配的歌曲</p>
        <button class="text-button" @click="clearFilters">清除筛选</button>
      </div>
    </div>

    <div class="sidebar-footer">
      <span class="hint-dot"></span>
      <p>拖入音频文件即可加入曲库<br /><span>MP3 · FLAC · M4A · WAV</span></p>
    </div>

    <TrackContextMenu
      v-if="contextMenu"
      :track="contextMenu.track"
      source="library"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="contextMenu = null"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width, 310px);
  flex: 0 0 var(--sidebar-width, 310px);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  min-height: 0;
  background: var(--sidebar-bg);
}

.sidebar-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 25px 22px 18px;
}

.eyebrow {
  display: block;
  color: var(--faint);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.19em;
  margin-bottom: 8px;
}

.sidebar-heading h2 {
  font-family: var(--font-display);
  font-size: 20px;
  line-height: 1;
  letter-spacing: -0.035em;
  font-weight: 560;
}

.count {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
  vertical-align: 3px;
  margin-left: 4px;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 16px 14px;
  height: 37px;
  padding: 0 11px;
  color: var(--faint);
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgb(255 255 255 / 2%);
  transition: border-color 180ms ease, background 180ms ease;
}

.search-field:focus-within {
  border-color: var(--line-strong);
  background: rgb(255 255 255 / 3.5%);
  color: var(--muted);
}

.search-field input {
  appearance: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  width: 100%;
  min-width: 0;
}

.search-field input::-webkit-search-cancel-button {
  display: none;
}

.search-field input::placeholder {
  color: var(--faint);
}

.search-field kbd {
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1;
  padding: 3px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--faint);
}

.search-clear {
  color: var(--faint);
  display: grid;
  place-items: center;
  padding: 2px;
}

.search-clear:hover {
  color: var(--text);
}

.collection-controls {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 16px 8px;
}

.sort-control {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 29px;
  padding: 0 8px;
  color: var(--faint);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 8px;
}

.sort-control select {
  appearance: none;
  flex: 1;
  min-width: 0;
  color: var(--muted);
  background: transparent;
  border: 0;
  outline: 0;
  font-size: 9px;
  cursor: pointer;
}

.sort-control select option {
  color: var(--text);
  background: var(--panel-bg);
}

.sort-control .app-icon {
  pointer-events: none;
  transform: rotate(90deg);
}

.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 29px;
  padding: 0 8px;
  color: var(--faint);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 8.5px;
  transition: color 160ms ease, border-color 160ms ease;
}

.filter-toggle:hover,
.filter-toggle.active {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 20%);
}

.filter-count {
  display: grid;
  place-items: center;
  min-width: 13px;
  height: 13px;
  padding: 0 3px;
  color: var(--accent-text);
  background: rgb(200 245 106 / 8%);
  border-radius: 7px;
  font-family: var(--font-mono);
  font-size: 6.5px;
}

.tag-panel {
  margin: 0 16px 8px;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgb(255 255 255 / 1.6%);
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 110px;
  overflow-y: auto;
}

.filter-chip {
  height: 21px;
  padding: 0 7px;
  color: var(--faint);
  border: 1px solid var(--line);
  border-radius: 5px;
  font-size: 8px;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}

.filter-chip:hover { color: var(--muted); }

.filter-chip.active {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 25%);
  background: rgb(200 245 106 / 6%);
}

.no-tags {
  margin: 1px 0;
  color: var(--faint);
  font-size: 8px;
}

.clear-filters {
  margin-top: 7px;
  color: var(--faint);
  font-size: 8px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.clear-filters:hover { color: var(--muted); }

.collection-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px 9px;
  color: var(--faint);
  font-size: 8px;
}

.collection-actions > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  height: 23px;
  padding: 0 7px;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 5px;
  font-size: 8px;
  transition: color 150ms ease, border-color 150ms ease;
}

.queue-add:hover:not(:disabled) {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 20%);
}

.queue-add:disabled {
  opacity: 0.3;
  cursor: default;
}

.track-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0 10px 16px;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 9%) transparent;
}

.track-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.track-row[draggable='true'] {
  cursor: grab;
}

.track-row[draggable='true']:active {
  cursor: grabbing;
}

.track-row {
  position: relative;
  display: grid;
  grid-template-columns: 24px 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  color: var(--muted);
  text-align: left;
  border-radius: 9px;
  border: 1px solid transparent;
  transition: background 160ms ease, color 160ms ease;
}

.track-row:hover {
  background: rgb(255 255 255 / 3.5%);
  color: var(--text);
}

.track-row.active {
  background: rgb(200 245 106 / 5.5%);
  border-color: rgb(200 245 106 / 7%);
  color: var(--text);
}

.track-row.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 20px;
  border-radius: 2px;
  background: var(--accent);
  transform: translate(-2px, -50%);
  box-shadow: 0 0 12px rgb(200 245 106 / 52%);
}

.track-index {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.01em;
  text-align: center;
}

.track-row.active .track-index {
  color: var(--accent-text);
}

.playing-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  height: 11px;
}

.playing-bars i {
  display: block;
  width: 2px;
  background: var(--accent);
  border-radius: 2px;
  animation: sound-bar 950ms ease-in-out infinite alternate;
}

.playing-bars i:nth-child(1) {
  height: 45%;
}
.playing-bars i:nth-child(2) {
  height: 100%;
  animation-delay: -400ms;
}
.playing-bars i:nth-child(3) {
  height: 65%;
  animation-delay: -700ms;
}

@keyframes sound-bar {
  from {
    transform: scaleY(0.42);
  }
  to {
    transform: scaleY(1);
  }
}

.track-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-text strong {
  font-size: 11.5px;
  font-weight: 520;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-text span {
  color: var(--faint);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 160ms ease;
}

.track-row.active .track-text span {
  color: var(--muted);
}

.track-side {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 2px;
}

.lyric-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgb(200 245 106 / 48%);
}

.issue-dot {
  display: grid;
  place-items: center;
  color: var(--sand);
}

.duration {
  width: 32px;
  text-align: right;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 70px 22px;
  color: var(--faint);
}

.sidebar-empty.compact {
  padding-top: 50px;
}

.empty-ornament {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  margin-bottom: 17px;
  color: var(--muted);
}

.sidebar-empty p {
  font-size: 11.5px;
  line-height: 1.7;
}

.text-button {
  margin-top: 9px;
  font-size: 11px;
  color: var(--accent-text);
  border-bottom: 1px solid rgb(200 245 106 / 24%);
  padding-bottom: 2px;
}

.sidebar-footer {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 16px 22px 19px;
  border-top: 1px solid var(--line);
}

.hint-dot {
  width: 5px;
  height: 5px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--line-strong);
}

.sidebar-footer p {
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.65;
}

.sidebar-footer p span {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.03em;
}

.icon-button.small {
  width: 29px;
  height: 29px;
  border-radius: 8px;
}

.track-enter-active,
.track-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.track-enter-from,
.track-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
