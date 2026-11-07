<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useApp } from '../stores/app'
import { formatClock } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'

const emit = defineEmits<{ (event: 'import'): void }>()
const { state, currentTrack, currentCover, selectTrack } = useApp()

const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const filteredTracks = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return state.tracks
  return state.tracks.filter((track) =>
    `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(needle)
  )
})

function coverFor(trackId: string): string | null {
  return state.coverUrls[trackId] ?? null
}

function onRowClick(track: (typeof state.tracks)[number]): void {
  void selectTrack(track)
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

    <div class="track-scroll">
      <TransitionGroup v-if="filteredTracks.length" name="track" tag="div" class="track-list">
        <button
          v-for="(track, index) in filteredTracks"
          :key="track.id"
          class="track-row"
          :class="{ active: currentTrack?.id === track.id }"
          @click="onRowClick(track)"
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
            <span v-if="track.lyricsText" class="lyric-dot" title="已有歌词"></span>
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
        <button class="text-button" @click="query = ''">清除搜索</button>
      </div>
    </div>

    <div class="sidebar-footer">
      <span class="hint-dot"></span>
      <p>拖入音频文件即可加入曲库<br /><span>MP3 · FLAC · M4A · WAV</span></p>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 310px;
  flex: 0 0 310px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  min-height: 0;
  background: rgb(15 17 15 / 62%);
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
  color: var(--accent);
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
  color: var(--accent);
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
