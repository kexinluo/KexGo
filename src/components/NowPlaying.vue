<script setup lang="ts">
import { computed } from 'vue'
import { trackIssueTitle, useApp } from '../stores/app'
import { formatClock } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'
import PlaybackVisualizer from './PlaybackVisualizer.vue'
import TrackTags from './TrackTags.vue'

const {
  currentTrack,
  currentCover,
  currentLyrics,
  currentPlaybackIssue,
  state,
  openEditModal,
  pickCover,
  updateTrackTags,
  revalidateCurrentTrack,
  tagHistory
} = useApp()

const issueTitle = computed(() =>
  currentPlaybackIssue.value ? trackIssueTitle(currentPlaybackIssue.value.status) : ''
)

const fileType = computed(() => {
  const path = currentTrack.value?.filePath ?? ''
  const extension = path.split('.').pop()
  return extension && extension.length <= 5 ? extension.toUpperCase() : 'AUDIO'
})

const lyricState = computed(() => {
  if (state.lyricsLookup === 'searching') return { label: '正在找词', tone: 'searching' }
  if (!currentTrack.value?.lyricsText) return { label: '暂无歌词', tone: 'empty' }
  if (!currentLyrics.value.hasTimestamps) return { label: '待对轴', tone: 'pending' }
  return { label: '歌词已同步', tone: 'ready' }
})

function saveTags(tags: string[]): void {
  if (!currentTrack.value) return
  void updateTrackTags(currentTrack.value.id, tags)
}
</script>

<template>
  <section v-if="currentTrack" class="now-panel">
    <div class="panel-topline">
      <span class="eyebrow">NOW PLAYING</span>
      <span class="sync-state" :class="`sync-${lyricState.tone}`">
        <i></i>
        {{ lyricState.label }}
      </span>
    </div>

    <div v-if="state.preferences.layout.showCover" class="cover-stage">
      <div class="vinyl-shadow" aria-hidden="true"></div>
      <button class="cover-button" title="更换封面" aria-label="更换封面" @click="pickCover">
        <CoverArt
          :src="currentCover"
          :title="currentTrack.title"
          :artist="currentTrack.artist"
          :alt="`${currentTrack.title} 封面`"
          size="hero"
          glow
        />
        <span class="cover-hover">
          <span><AppIcon name="image" :size="16" /> 更换封面</span>
        </span>
      </button>
      <div class="format-badge">
        <span></span>
        {{ fileType }}
      </div>
    </div>

    <div class="track-details">
      <h1 class="track-title" :title="currentTrack.title">{{ currentTrack.title }}</h1>
      <p class="track-artist">{{ currentTrack.artist || '未知歌手' }}</p>
      <div class="track-subline">
        <span>{{ currentTrack.album || '本地音乐' }}</span>
        <i></i>
        <span>{{ formatClock(currentTrack.duration) }}</span>
        <i></i>
        <span class="local-label">LOCAL</span>
      </div>

      <div v-if="currentPlaybackIssue" class="track-issue">
        <span class="issue-icon">
          <AppIcon name="alert-triangle" :size="15" />
        </span>
        <span class="issue-copy">
          <strong>{{ issueTitle }}</strong>
          <span>{{ currentPlaybackIssue.message }}</span>
        </span>
        <button class="issue-retry" @click="revalidateCurrentTrack">重新检测</button>
      </div>

      <div v-if="state.preferences.layout.showTags" class="tags-block">
        <div class="tags-heading">
          <span class="tags-label">TAGS</span>
          <button class="edit-info-link" title="编辑歌曲信息" aria-label="编辑歌曲信息" @click="openEditModal">
            <AppIcon name="edit" :size="12" />
            编辑信息
          </button>
        </div>
        <TrackTags :tags="currentTrack.tags ?? []" :history="tagHistory" @update="saveTags" />
      </div>

      <PlaybackVisualizer v-if="state.visualizerEnabled" />
    </div>
  </section>
</template>

<style scoped>
.now-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding-top: 2px;
}

.panel-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  min-height: 18px;
}

.eyebrow {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.sync-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.025em;
  white-space: nowrap;
}

.sync-state i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--faint);
}

.sync-ready {
  color: var(--accent-text);
}
.sync-ready i {
  background: var(--accent);
  box-shadow: 0 0 7px rgb(200 245 106 / 55%);
}

.sync-pending {
  color: var(--sand);
}
.sync-pending i {
  background: var(--sand);
}

.sync-searching i {
  background: var(--accent);
  animation: sync-pulse 1.2s ease-in-out infinite;
}

@keyframes sync-pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}

.cover-stage {
  position: relative;
  width: 100%;
  max-width: calc(340px * var(--cover-scale, 1));
}

.vinyl-shadow {
  position: absolute;
  width: 88%;
  aspect-ratio: 1;
  border-radius: 50%;
  right: -20%;
  top: 8%;
  background:
    radial-gradient(circle at 50% 50%, rgb(255 255 255 / 3.5%) 0 16%, transparent 16.2%),
    repeating-radial-gradient(circle at center, #090a09 0 3px, #131512 4px 5px);
  border: 1px solid rgb(255 255 255 / 5%);
  box-shadow: 0 24px 55px rgb(0 0 0 / 45%);
  opacity: 0.82;
  z-index: 0;
}

.cover-button {
  position: relative;
  width: 100%;
  display: block;
  border: 0;
  padding: 0;
  border-radius: 20px;
  z-index: 1;
  cursor: pointer;
}

.cover-hover {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  opacity: 0;
  background: linear-gradient(to top, rgb(4 6 4 / 72%), transparent 45%);
  transition: opacity 200ms ease;
}

.cover-hover span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--text);
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 12%);
  background: rgb(16 19 15 / 65%);
  backdrop-filter: blur(10px);
}

.cover-button:hover .cover-hover,
.cover-button:focus-visible .cover-hover {
  opacity: 1;
}

.format-badge {
  position: absolute;
  left: 12px;
  top: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 21px;
  padding: 0 8px;
  color: rgb(255 255 255 / 67%);
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  background: rgb(10 12 9 / 52%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 999px;
  backdrop-filter: blur(8px);
}

.format-badge span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.track-details {
  width: 100%;
  max-width: 340px;
  padding-top: 25px;
}

.track-title {
  font-family: var(--font-display);
  font-size: clamp(27px, 2.4vw, 35px);
  line-height: 1.12;
  letter-spacing: -0.045em;
  font-weight: 540;
  color: var(--text-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-artist {
  color: var(--muted);
  font-size: 13px;
  letter-spacing: -0.005em;
  margin-top: 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-subline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
}

.track-subline span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-subline i {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--faint);
  flex: 0 0 auto;
}

.track-subline .local-label {
  color: rgb(200 245 106 / 50%);
  letter-spacing: 0.1em;
}

.track-issue {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  max-width: 340px;
  margin-top: 15px;
  padding: 9px 10px;
  border: 1px solid rgb(233 201 134 / 20%);
  border-radius: 8px;
  background: rgb(233 201 134 / 4.5%);
}

.issue-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  color: var(--sand);
}

.issue-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.issue-copy strong {
  color: var(--sand);
  font-size: 9.5px;
  font-weight: 560;
}

.issue-copy > span {
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.55;
}

.issue-retry {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--sand);
  font-size: 8.5px;
  white-space: nowrap;
  border-bottom: 1px solid rgb(233 201 134 / 28%);
  padding-bottom: 1px;
}

.issue-retry:hover {
  color: var(--text);
}

.tags-block {
  width: 100%;
  max-width: 340px;
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.tags-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.tags-label {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.edit-info-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--faint);
  font-size: 9px;
  transition: color 160ms ease;
}

.edit-info-link:hover {
  color: var(--muted);
}

@media (max-width: 1160px) {
  .format-badge {
    font-size: 7px;
  }
}

@media (max-width: 980px) {
  .now-panel {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    column-gap: 18px;
    align-items: start;
  }
  .panel-topline {
    grid-column: 1 / -1;
  }
  .cover-stage {
    max-width: none;
  }
  .track-details {
    padding-top: 2px;
    max-width: none;
  }
  .track-title {
    font-size: 25px;
  }
  .vinyl-shadow {
    display: none;
  }
  .format-badge {
    display: none;
  }
  .track-subline {
    margin-top: 9px;
  }
  .tags-block {
    margin-top: 15px;
  }
}
</style>
