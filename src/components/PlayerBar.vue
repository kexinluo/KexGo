<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { clamp, formatClock } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'

const {
  state,
  currentTrack,
  currentCover,
  progress,
  displayDuration,
  togglePlay,
  step,
  seekTo,
  setVolume,
  openAlignment,
  currentLyrics
} = useApp()

const scrubbing = ref(false)
const scrubValue = ref(0)
const volumeLocal = ref(state.volume)
let volumeCommitTimer: number | null = null

watch(
  () => state.position,
  (position) => {
    if (!scrubbing.value) scrubValue.value = position
  },
  { immediate: true }
)

watch(
  () => state.volume,
  (volume) => {
    volumeLocal.value = volume
  }
)

const displayedPosition = computed(() => (scrubbing.value ? scrubValue.value : state.position))
const rangePercent = computed(() => {
  if (!displayDuration.value) return 0
  return clamp((displayedPosition.value / displayDuration.value) * 100, 0, 100)
})
const volumePercent = computed(() => volumeLocal.value * 100)
const volumeIcon = computed(() => {
  if (volumeLocal.value <= 0.001) return 'volume-mute'
  if (volumeLocal.value < 0.4) return 'volume-low'
  return 'volume'
})

function beginScrub(): void {
  scrubbing.value = true
  scrubValue.value = state.position
}

function onScrubInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  scrubbing.value = true
  scrubValue.value = value
}

function commitScrub(): void {
  if (!scrubbing.value) return
  const target = scrubValue.value
  scrubbing.value = false
  void seekTo(target)
}

function onVolumeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  volumeLocal.value = value
  if (volumeCommitTimer !== null) window.clearTimeout(volumeCommitTimer)
  volumeCommitTimer = window.setTimeout(() => {
    void setVolume(value)
  }, 80)
}

function toggleMute(): void {
  if (volumeLocal.value > 0) {
    volumeLocal.value = 0
    void setVolume(0)
  } else {
    volumeLocal.value = 0.7
    void setVolume(0.7)
  }
}

function openAlign(): void {
  openAlignment(
    currentLyrics.value.hasTimestamps ? undefined : currentTrack.value?.lyricsText || undefined
  )
}

onBeforeUnmount(() => {
  if (volumeCommitTimer !== null) window.clearTimeout(volumeCommitTimer)
})
</script>

<template>
  <footer class="player-bar">
    <div class="player-track">
      <CoverArt
        :src="currentCover"
        :title="currentTrack?.title || ''"
        :artist="currentTrack?.artist || ''"
        size="sm"
        alt="当前歌曲封面"
      />
      <div class="player-track-copy">
        <strong>{{ currentTrack?.title || '暂未选择歌曲' }}</strong>
        <span>{{ currentTrack?.artist || '从左侧曲库选择一首歌' }}</span>
      </div>
      <span v-if="currentTrack?.lyricsText" class="mini-lyric-state" :class="{ synced: currentLyrics.hasTimestamps }">
        {{ currentLyrics.hasTimestamps ? 'LRC' : '待对轴' }}
      </span>
    </div>

    <div class="transport">
      <div class="transport-buttons">
        <button
          class="transport-button"
          aria-label="上一首"
          :disabled="!state.tracks.length"
          @click="step(-1)"
        >
          <AppIcon name="previous" :size="17" />
        </button>
        <button
          class="play-button"
          :class="{ loading: state.audioLoading }"
          :aria-label="state.playing ? '暂停' : '播放'"
          :disabled="!currentTrack"
          @click="togglePlay"
        >
          <span v-if="state.audioLoading" class="play-spinner"></span>
          <AppIcon v-else :name="state.playing ? 'pause' : 'play'" :size="19" />
        </button>
        <button
          class="transport-button"
          aria-label="下一首"
          :disabled="!state.tracks.length"
          @click="step(1)"
        >
          <AppIcon name="next" :size="17" />
        </button>
      </div>

      <div class="timeline">
        <span class="time">{{ formatClock(displayedPosition) }}</span>
        <input
          class="range timeline-range"
          type="range"
          min="0"
          :max="displayDuration || 1"
          step="0.1"
          :value="displayedPosition"
          :disabled="!currentTrack"
          aria-label="播放进度"
          :style="{ '--range-progress': `${rangePercent}%` }"
          @pointerdown="beginScrub"
          @input="onScrubInput"
          @change="commitScrub"
          @pointerup="commitScrub"
          @keydown.left.prevent="seekTo(state.position - 5)"
          @keydown.right.prevent="seekTo(state.position + 5)"
        />
        <span class="time">{{ formatClock(displayDuration) }}</span>
      </div>
    </div>

    <div class="player-tools">
      <button
        class="align-tool"
        :disabled="!currentTrack"
        title="快速对轴"
        @click="openAlign"
      >
        <AppIcon name="align" :size="15" />
        <span>对轴</span>
      </button>
      <div class="volume-control">
        <button class="volume-icon" :aria-label="volumeLocal > 0 ? '静音' : '恢复音量'" @click="toggleMute">
          <AppIcon :name="volumeIcon" :size="16" />
        </button>
        <input
          class="range volume-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volumeLocal"
          aria-label="音量"
          :style="{ '--range-progress': `${volumePercent}%` }"
          @input="onVolumeInput"
        />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.player-bar {
  position: relative;
  z-index: 20;
  flex: 0 0 90px;
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(360px, 1.4fr) minmax(190px, 0.8fr);
  align-items: center;
  gap: 24px;
  padding: 0 28px;
  border-top: 1px solid var(--line);
  background: rgb(17 19 16 / 88%);
  backdrop-filter: blur(22px);
}

.player-track {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.player-track-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-track-copy strong {
  font-size: 11.5px;
  font-weight: 550;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-track-copy span {
  color: var(--faint);
  font-size: 9.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-lyric-state {
  margin-left: 4px;
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.03em;
  color: var(--sand);
  padding: 3px 5px;
  border: 1px solid rgb(238 200 130 / 17%);
  border-radius: 4px;
}

.mini-lyric-state.synced {
  color: rgb(200 245 106 / 72%);
  border-color: rgb(200 245 106 / 16%);
}

.transport {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 560px;
  justify-self: center;
}

.transport-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
}

.transport-button {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  color: var(--muted);
  border-radius: 50%;
  transition: color 160ms ease, transform 160ms ease;
}

.transport-button:hover:not(:disabled) {
  color: var(--text);
  transform: translateY(-1px);
}

.transport-button:disabled,
.play-button:disabled {
  opacity: 0.3;
  cursor: default;
}

.play-button {
  position: relative;
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  border-radius: 50%;
  color: #11140e;
  background: var(--accent);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 12%) inset, 0 6px 18px rgb(200 245 106 / 12%);
  transition: transform 160ms ease, background 160ms ease;
}

.play-button:hover:not(:disabled) {
  transform: scale(1.05);
  background: #d4ff77;
}

.play-button.loading {
  color: var(--accent);
  background: transparent;
  border: 1px solid rgb(200 245 106 / 26%);
}

.play-button .app-icon {
  margin-left: 1px;
}

.play-spinner {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid rgb(200 245 106 / 22%);
  border-top-color: var(--accent);
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.timeline {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.time {
  width: 34px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: -0.02em;
  text-align: center;
  flex: 0 0 auto;
}

.range {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 14px;
  background: transparent;
  cursor: pointer;
}

.range:disabled {
  cursor: default;
}

.range::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--accent) 0,
    var(--accent) var(--range-progress),
    rgb(255 255 255 / 9%) var(--range-progress),
    rgb(255 255 255 / 9%) 100%
  );
}

.range::-moz-range-track {
  height: 2px;
  border-radius: 2px;
  background: rgb(255 255 255 / 9%);
}

.range::-moz-range-progress {
  height: 2px;
  background: var(--accent);
}

.range::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 9px;
  height: 9px;
  margin-top: -3.5px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0;
  box-shadow: 0 0 0 4px rgb(200 245 106 / 10%);
  transition: opacity 160ms ease;
}

.range:hover::-webkit-slider-thumb,
.range:focus-visible::-webkit-slider-thumb {
  opacity: 1;
}

.range::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
}

.range:focus-visible {
  outline: none;
}

.range:focus-visible::-webkit-slider-runnable-track {
  box-shadow: 0 0 0 2px rgb(200 245 106 / 15%);
}

.player-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 17px;
  min-width: 0;
}

.align-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 9px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 10px;
  border: 1px solid var(--line);
  transition: all 160ms ease;
  flex: 0 0 auto;
}

.align-tool:hover:not(:disabled) {
  color: var(--accent);
  border-color: rgb(200 245 106 / 20%);
  background: rgb(200 245 106 / 4%);
}

.align-tool:disabled {
  opacity: 0.35;
  cursor: default;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 122px;
}

.volume-icon {
  color: var(--muted);
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  transition: color 160ms ease;
}

.volume-icon:hover {
  color: var(--text);
}

.volume-range {
  flex: 1;
}

.volume-range::-webkit-slider-runnable-track {
  height: 2px;
}

.volume-range::-webkit-slider-thumb {
  width: 7px;
  height: 7px;
  margin-top: -2.5px;
}

@media (max-width: 1180px) {
  .player-bar {
    grid-template-columns: minmax(170px, 0.65fr) minmax(300px, 1.45fr) minmax(155px, 0.65fr);
    gap: 14px;
    padding: 0 20px;
  }
  .player-tools {
    gap: 10px;
  }
  .volume-control {
    width: 95px;
  }
  .mini-lyric-state {
    display: none;
  }
}

@media (max-width: 900px) {
  .player-bar {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto;
    height: auto;
    min-height: 90px;
    padding: 12px 18px;
  }
  .player-track {
    display: none;
  }
  .transport {
    grid-column: 1;
    align-items: flex-start;
  }
  .transport-buttons {
    display: none;
  }
  .timeline {
    margin-top: 4px;
  }
  .player-tools {
    grid-column: 2;
    grid-row: 1;
  }
  .volume-control {
    display: none;
  }
}
</style>
