<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { detectScript } from '../utils/language'
import AppIcon from './AppIcon.vue'
import RubyText from './RubyText.vue'

const {
  state,
  currentTrack,
  currentLyrics,
  timedLines,
  activeLyricIndex,
  openLyricsModal,
  openLyricsNotes,
  openAlignment,
  pickLrc,
  seekTo
} = useApp()

const scrollEl = ref<HTMLElement | null>(null)
const lineEls = ref<HTMLElement[]>([])
const userScrolledAt = ref(0)

const hasLyrics = computed(() => currentLyrics.value.lines.length > 0)
const hasTimed = computed(() => currentLyrics.value.hasTimestamps)
const originLabel = computed(() => {
  switch (currentTrack.value?.lyricsOrigin) {
    case 'sidecar':
      return '本地 LRC'
    case 'lrclib':
      return 'LRCLIB'
    case 'manual':
      return '手动对轴'
    case 'embedded':
      return '文件内嵌'
    default:
      return '曲库'
  }
})

function setLineRef(el: unknown, index: number): void {
  if (el instanceof HTMLElement) lineEls.value[index] = el
}

function scrollToActive(behavior: ScrollBehavior = 'smooth'): void {
  const container = scrollEl.value
  const active = lineEls.value[activeLyricIndex.value]
  if (!container || !active) return
  if (Date.now() - userScrolledAt.value < 3200) return
  const top = active.offsetTop - container.clientHeight * 0.4 + active.clientHeight / 2
  container.scrollTo({ top: Math.max(0, top), behavior })
}

watch(
  () => activeLyricIndex.value,
  () => {
    void nextTick(() => scrollToActive('smooth'))
  }
)

watch(
  () => currentTrack.value?.id,
  () => {
    userScrolledAt.value = 0
    lineEls.value = []
    void nextTick(() => {
      if (activeLyricIndex.value >= 0) scrollToActive('auto')
      else scrollEl.value?.scrollTo({ top: 0, behavior: 'auto' })
    })
  }
)

watch(
  () => currentLyrics.value.lines.length,
  () => {
    void nextTick(() => {
      if (activeLyricIndex.value >= 0) scrollToActive('auto')
    })
  }
)

function markUserScroll(): void {
  userScrolledAt.value = Date.now()
}

function onLineClick(index: number, timeMs: number | null): void {
  if (!hasTimed.value) return
  if (timeMs !== null) {
    void seekTo(timeMs / 1000)
    return
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const time = currentLyrics.value.lines[i]?.timeMs
    if (time !== null && time !== undefined) {
      void seekTo(time / 1000 + 0.8)
      return
    }
  }
  void seekTo(0)
}

function startAligning(): void {
  openAlignment(hasLyrics.value && !hasTimed.value ? currentTrack.value?.lyricsText : undefined)
}

function noteFor(index: number) {
  return state.lyricsNotes?.lines.find((line) => line.index === index)
}

function rubyFor(index: number, text: string): string {
  if (state.preferences.annotationMode !== 'ruby') return ''
  if (detectScript(text) !== 'ja') return ''
  return noteFor(index)?.ruby ?? ''
}

function romajiFor(index: number, text: string): string {
  if (state.preferences.annotationMode !== 'romaji') return ''
  const script = detectScript(text)
  if (script !== 'ja' && script !== 'ko') return ''
  return noteFor(index)?.romaji ?? ''
}

function translationFor(index: number): string {
  return state.preferences.showTranslations ? noteFor(index)?.translation ?? '' : ''
}
</script>

<template>
  <section class="lyrics-pane">
    <header class="lyrics-header">
      <div class="lyrics-title">
        <span class="eyebrow">LYRICS</span>
        <h3>歌词</h3>
        <span v-if="hasLyrics" class="lyric-meta">
          {{ hasTimed ? `${timedLines} 行 · ${originLabel}` : '纯文本 · 尚未对轴' }}
        </span>
      </div>
      <div class="lyrics-actions">
        <button class="subtle-button" @click="openLyricsModal">
          <AppIcon name="sparkles" :size="14" />
          <span>找词</span>
        </button>
        <button v-if="currentTrack" class="subtle-button" title="编辑翻译与注音" @click="openLyricsNotes">
          <AppIcon name="globe" :size="14" />
          <span>翻译/注音</span>
        </button>
        <button v-if="currentTrack" class="subtle-button" title="选择本地 LRC" @click="pickLrc">
          <AppIcon name="file-text" :size="14" />
          <span>LRC</span>
        </button>
        <button v-if="hasLyrics" class="align-button" @click="startAligning">
          <AppIcon name="align" :size="14" />
          <span>{{ hasTimed ? '快速对轴' : '开始对轴' }}</span>
        </button>
      </div>
    </header>

    <div v-if="hasLyrics" class="lyrics-body">
      <div v-if="!hasTimed" class="unsynced-banner">
        <span class="unsynced-icon"><AppIcon name="clock" :size="14" /></span>
        <p>歌词还没有时间轴。播放一遍，用空格逐行打点。</p>
        <button @click="startAligning">开始</button>
      </div>

      <div
        ref="scrollEl"
        class="lyrics-scroll"
        :class="{ 'is-unsynced': !hasTimed }"
        @wheel.passive="markUserScroll"
        @touchmove.passive="markUserScroll"
      >
        <div class="lyrics-inner" :class="{ 'timed-layout': hasTimed }">
          <button
            v-for="(line, index) in currentLyrics.lines"
            :key="line.id"
            :ref="(el) => setLineRef(el, index)"
            class="lyric-line"
            :class="[
              `lang-${detectScript(line.text)}`,
              {
                active: hasTimed && index === activeLyricIndex,
                passed: hasTimed && activeLyricIndex >= 0 && index < activeLyricIndex,
                clickable: line.timeMs !== null
              }
            ]"
            @click="onLineClick(index, line.timeMs)"
          >
            <span v-if="hasTimed && index === activeLyricIndex" class="active-mark" aria-hidden="true"></span>
            <span class="lyric-main">
              <RubyText v-if="rubyFor(index, line.text)" :text="rubyFor(index, line.text)" />
              <template v-else>{{ line.text }}</template>
            </span>
            <span v-if="romajiFor(index, line.text)" class="lyric-annotation">
              {{ romajiFor(index, line.text) }}
            </span>
            <span v-if="translationFor(index)" class="lyric-translation">
              {{ translationFor(index) }}
            </span>
          </button>
          <div class="lyrics-tail" aria-hidden="true">
            <span>KexGo</span>
            <i></i>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="lyrics-empty">
      <div class="empty-quote" aria-hidden="true">“</div>
      <template v-if="state.lyricsLookup === 'searching'">
        <h4>正在 LRCLIB 找歌词</h4>
        <p class="searching-copy">
          <span></span><span></span><span></span>
        </p>
        <span class="lookup-note">开放歌词库 · 无需登录</span>
      </template>
      <template v-else-if="state.lyricsLookup === 'error'">
        <h4>在线歌词暂时不可用</h4>
        <p>{{ state.lookupError || '网络连接失败。你仍然可以粘贴歌词并手动对轴。' }}</p>
        <div class="empty-actions">
          <button class="primary-button" @click="openLyricsModal">
            <AppIcon name="refresh" :size="15" />
            重试找词
          </button>
          <button class="ghost-button" @click="startAligning">粘贴歌词并对轴</button>
        </div>
      </template>
      <template v-else-if="state.lyricsLookup === 'not-found'">
        <h4>没有找到匹配的歌词</h4>
        <p>可以换一个关键词再找，或者粘贴你手里的纯文本歌词，播放一遍完成对轴。</p>
        <div class="empty-actions">
          <button class="primary-button" @click="openLyricsModal">
            <AppIcon name="search" :size="15" />
            在线找词
          </button>
          <button class="ghost-button" @click="startAligning">粘贴歌词</button>
          <button class="ghost-button" @click="pickLrc">导入 LRC</button>
        </div>
      </template>
      <template v-else>
        <h4>让这首歌有词</h4>
        <p>KexGo 先去开放歌词库找同步歌词。找不到也没关系，粘贴歌词，跟着唱一遍就能完成对轴。</p>
        <div class="empty-actions">
          <button class="primary-button" @click="openLyricsModal">
            <AppIcon name="sparkles" :size="15" />
            在线找词
          </button>
          <button class="ghost-button" @click="startAligning">粘贴歌词</button>
          <button class="ghost-button" @click="pickLrc">导入 LRC</button>
        </div>
        <span class="lookup-note">歌词来自 LRCLIB 开放库 · 不抓取音乐平台内容</span>
      </template>
    </div>
  </section>
</template>

<style scoped>
.lyrics-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.lyrics-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 17px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 2px;
}

.lyrics-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.lyrics-title .eyebrow {
  display: none;
}

.lyrics-title h3 {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 560;
  letter-spacing: -0.02em;
}

.lyric-meta {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8.5px;
  white-space: nowrap;
}

.lyrics-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.subtle-button,
.align-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 29px;
  padding: 0 9px;
  border-radius: 7px;
  font-size: 10.5px;
  color: var(--muted);
  border: 1px solid transparent;
  transition: all 160ms ease;
}

.subtle-button:hover {
  color: var(--text);
  background: rgb(255 255 255 / 4%);
}

.align-button {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 18%);
  background: rgb(200 245 106 / 5%);
}

.align-button:hover {
  background: rgb(200 245 106 / 9%);
  border-color: rgb(200 245 106 / 30%);
}

.lyrics-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.unsynced-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 14px;
  padding: 9px 12px;
  border: 1px solid rgb(200 245 106 / 10%);
  border-radius: 9px;
  background: rgb(200 245 106 / 4%);
  color: var(--muted);
  font-size: 10.5px;
}

.unsynced-icon {
  color: var(--accent-text);
}

.unsynced-banner p {
  flex: 1;
  line-height: 1.5;
}

.unsynced-banner button {
  color: var(--accent-text);
  font-size: 10.5px;
  white-space: nowrap;
}

.lyrics-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
  scrollbar-width: none;
  mask-image: linear-gradient(to bottom, transparent 0, black 10%, black 86%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 10%, black 86%, transparent 100%);
}

.lyrics-scroll::-webkit-scrollbar {
  display: none;
}

.lyrics-inner {
  padding: 38% 6px 170px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}

.lyrics-inner.timed-layout {
  gap: 4px;
}

.lyric-line {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--lyrics-dim);
  font-family: var(--font-lyrics), var(--font-lyrics-han), var(--font-lyrics-ja), var(--font-lyrics-ko), sans-serif;
  font-size: var(--lyrics-font-size);
  font-weight: 440;
  line-height: 1.7;
  letter-spacing: -0.015em;
  padding: 5px 18px;
  border-radius: 6px;
  max-width: 92%;
  transition: color 500ms ease, opacity 500ms ease, font-size 400ms ease, transform 400ms ease;
  cursor: default;
}

.lyric-main {
  display: block;
}

.lyric-annotation {
  display: block;
  margin-top: 2px;
  color: var(--faint);
  font-family: var(--font-lyrics), var(--font-lyrics-latin), sans-serif;
  font-size: 0.62em;
  letter-spacing: 0.02em;
}

.lyric-translation {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.62em;
  font-weight: 400;
  line-height: 1.55;
}

.lyric-line.active .lyric-annotation {
  color: var(--faint);
}

.lyric-line.active .lyric-translation {
  color: var(--muted);
}

.lyric-line.lang-han {
  font-family: var(--font-lyrics-han), var(--font-lyrics), sans-serif;
}

.lyric-line.lang-ja {
  font-family: var(--font-lyrics-ja), var(--font-lyrics), var(--font-lyrics-han), sans-serif;
}

.lyric-line.lang-ko {
  font-family: var(--font-lyrics-ko), var(--font-lyrics), sans-serif;
}

.lyric-line.lang-latin {
  font-family: var(--font-lyrics-latin), var(--font-lyrics), sans-serif;
}

.lyric-line.clickable {
  cursor: pointer;
}

.lyric-line.clickable:hover {
  color: var(--lyrics-hover);
  background: var(--surface-soft);
}

.lyric-line.passed {
  color: var(--lyrics-passed);
}

.lyric-line.active {
  color: var(--text-bright);
  font-size: var(--lyrics-active-font-size);
  font-weight: 540;
  letter-spacing: -0.02em;
  line-height: 1.55;
  transform: scale(1.015);
  text-shadow: 0 0 32px rgb(255 255 255 / 6%);
}

.active-mark {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--sand);
  box-shadow: 0 0 9px color-mix(in srgb, var(--sand) 65%, transparent);
}

.lyrics-inner.is-unsynced {
  padding-top: 22%;
}

.is-unsynced .lyric-line {
  color: var(--lyrics-unsynced);
}

.lyrics-tail {
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  color: var(--lyrics-tail);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.lyrics-tail i {
  width: 1px;
  height: 32px;
  background: linear-gradient(to bottom, rgb(255 255 255 / 12%), transparent);
}

.lyrics-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 28px 24px 50px;
  max-width: 440px;
  margin: 0 auto;
}

.empty-quote {
  color: var(--accent-text);
  font-family: var(--font-display);
  font-size: 54px;
  line-height: 0.8;
  opacity: 0.36;
  margin-bottom: 20px;
  height: 36px;
}

.lyrics-empty h4 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 520;
  letter-spacing: -0.035em;
  color: var(--text);
}

.lyrics-empty > p {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.8;
  max-width: 340px;
  margin-top: 10px;
}

.empty-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 22px;
}

.lookup-note {
  margin-top: 18px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.03em;
}

.searching-copy {
  display: flex;
  gap: 5px;
  margin-top: 15px !important;
}

.searching-copy span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: lookup-pulse 1.2s ease-in-out infinite;
}
.searching-copy span:nth-child(2) {
  animation-delay: 150ms;
}
.searching-copy span:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes lookup-pulse {
  0%,
  100% {
    opacity: 0.26;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (max-width: 980px) {
  .lyric-line.active {
    font-size: 18px;
  }
  .lyrics-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .lyrics-actions {
    justify-content: flex-start;
  }
}
</style>
