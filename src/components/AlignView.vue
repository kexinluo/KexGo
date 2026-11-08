<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useApp } from '../stores/app'
import type { AlignLine } from '../types'
import {
  activeLineIndex,
  applyOffset,
  formatLrc,
  parseLyrics,
  timedLineCount,
  withAdjustedLine
} from '../utils/lrc'
import { shortcutCodeMatches, shortcutMatches } from '../utils/shortcuts'
import { clamp, formatLyricTime } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'

interface HistoryEntry {
  lines: AlignLine[]
  cursor: number
}

const {
  state,
  currentTrack,
  currentCover,
  togglePlay,
  seekTo,
  setCompensation,
  saveAlignedLyrics,
  closeAlignment,
  toast,
  loadCover
} = useApp()

const lines = ref<AlignLine[]>([])
const cursor = ref(0)
const compensation = ref(state.settings.compensationMs ?? -150)
const history = ref<HistoryEntry[]>([])
const listEl = ref<HTMLElement | null>(null)
const rowEls = ref<HTMLElement[]>([])
const scrubberEl = ref<HTMLElement | null>(null)
let scrubbing = false
const writeSidecar = ref(false)
const offsetInput = ref<number>(0)
const saving = ref(false)
const exporting = ref(false)
const loadingSession = ref(true)
const ready = ref(false)
const dirty = ref(false)
const restoredDraft = ref(false)
const restoredAt = ref<number | null>(null)
const draftStatus = ref<'idle' | 'saving' | 'saved'>('idle')
const draftSavedAt = ref<number | null>(null)
const stampPulse = ref(0)
let draftTimer: number | null = null
let pulseTimer: number | null = null

const timedCount = computed(() => timedLineCount(lines.value))
const untimedCount = computed(() => lines.value.length - timedCount.value)
const progressPercent = computed(() => {
  if (!state.duration) return 0
  return clamp((state.position / state.duration) * 100, 0, 100)
})
const currentLine = computed(() => lines.value[cursor.value] ?? null)
const playbackIndex = computed(() => activeLineIndex(lines.value, state.position * 1000))
const stampProgress = computed(() => {
  if (!lines.value.length) return 0
  return (timedCount.value / lines.value.length) * 100
})
const trackTitle = computed(() => currentTrack.value?.title ?? '未选择歌曲')
const saveLabel = computed(() => {
  if (saving.value) return '保存中…'
  if (timedCount.value === 0) return '保存 LRC'
  return '保存 LRC'
})
const markers = computed(() => {
  if (!state.duration) return []
  return lines.value
    .filter((line): line is AlignLine & { timeMs: number } => line.timeMs !== null)
    .map((line) => clamp((line.timeMs / 1000 / state.duration) * 100, 0, 100))
})

function cloneLines(value: AlignLine[]): AlignLine[] {
  return value.map((line) => ({ ...line }))
}

function pushHistory(): void {
  history.value.push({ lines: cloneLines(lines.value), cursor: cursor.value })
  if (history.value.length > 120) history.value.shift()
}

function scrollCursorIntoView(): void {
  void nextTick(() => {
    const container = listEl.value
    const row = rowEls.value[cursor.value]
    if (!container || !row) return
    const top = row.offsetTop - container.clientHeight * 0.38
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  })
}

function setRowRef(el: unknown, index: number): void {
  if (el instanceof HTMLElement) rowEls.value[index] = el
}

function scheduleDraft(): void {
  if (!ready.value) return
  dirty.value = true
  draftStatus.value = 'saving'
  if (draftTimer !== null) window.clearTimeout(draftTimer)
  draftTimer = window.setTimeout(() => {
    draftTimer = null
    void persistDraft()
  }, 700)
}

async function persistDraft(): Promise<void> {
  if (!currentTrack.value || lines.value.length === 0) return
  try {
    await api.saveDraft({
      version: 1,
      trackId: currentTrack.value.id,
      lines: cloneLines(lines.value),
      cursor: cursor.value,
      compensationMs: compensation.value,
      savedAt: Date.now()
    })
    draftSavedAt.value = Date.now()
    draftStatus.value = 'saved'
  } catch {
    draftStatus.value = 'idle'
  }
}

function markChanged(): void {
  scheduleDraft()
}

function lightPulse(): void {
  stampPulse.value += 1
  if (pulseTimer !== null) window.clearTimeout(pulseTimer)
  pulseTimer = window.setTimeout(() => {
    stampPulse.value = 0
  }, 420)
}

function stampCurrentLine(): void {
  const line = currentLine.value
  if (!line) return
  pushHistory()
  const timeMs = Math.max(0, Math.round(state.position * 1000 + compensation.value))
  lines.value = lines.value.map((item, index) => (index === cursor.value ? { ...item, timeMs } : item))
  if (cursor.value < lines.value.length - 1) cursor.value += 1
  lightPulse()
  markChanged()
  scrollCursorIntoView()
  if (cursor.value === lines.value.length - 1 && currentLine.value?.timeMs !== null) {
    showHint('已经是最后一行，按 S 保存')
  }
}

function adjustCurrent(deltaMs: number): void {
  const line = currentLine.value
  if (!line) return
  if (line.timeMs === null) {
    showHint('这一行还没有打点，先按空格记录时间')
    return
  }
  pushHistory()
  lines.value = withAdjustedLine(lines.value, cursor.value, deltaMs)
  markChanged()
}

function undo(): void {
  const previous = history.value.pop()
  if (!previous) {
    showHint('没有可以撤销的操作')
    return
  }
  lines.value = cloneLines(previous.lines)
  cursor.value = previous.cursor
  markChanged()
  scrollCursorIntoView()
}

function applyGlobalOffset(): void {
  const delta = Math.round(Number(offsetInput.value))
  if (!Number.isFinite(delta) || delta === 0) {
    showHint('输入一个非零的毫秒数')
    return
  }
  if (timedCount.value === 0) {
    showHint('还没有已打点的歌词行')
    return
  }
  pushHistory()
  lines.value = applyOffset(lines.value, delta)
  offsetInput.value = 0
  markChanged()
  toast('success', `已整体偏移 ${delta > 0 ? '+' : ''}${delta}ms`)
}

function rewind(): void {
  void seekTo(Math.max(0, state.position - 3))
}

function selectRow(index: number, line: AlignLine): void {
  cursor.value = index
  if (line.timeMs !== null) {
    void seekTo(line.timeMs / 1000)
    return
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const time = lines.value[i]?.timeMs
    if (time !== null && time !== undefined) {
      void seekTo(time / 1000 + 0.6)
      return
    }
  }
  void seekTo(0)
}

function seekFromPointer(clientX: number): void {
  const element = scrubberEl.value
  if (!element || state.duration <= 0) return
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0) return
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
  void seekTo(ratio * state.duration)
}

function startScrubbing(event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()
  scrubbing = true
  const element = event.currentTarget as HTMLElement
  try {
    element.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best-effort; dragging still works without it.
  }
  seekFromPointer(event.clientX)
}

function moveScrubbing(event: PointerEvent): void {
  if (!scrubbing) return
  seekFromPointer(event.clientX)
}

function endScrubbing(event: PointerEvent): void {
  if (!scrubbing) return
  scrubbing = false
  const element = event.currentTarget as HTMLElement
  try {
    element.releasePointerCapture(event.pointerId)
  } catch {
    // Ignore a lost pointer capture.
  }
  seekFromPointer(event.clientX)
}

function nudgeSeek(deltaSeconds: number): void {
  if (state.duration <= 0) return
  void seekTo(clamp(state.position + deltaSeconds, 0, state.duration))
}

function showHint(message: string): void {
  toast('info', message)
}

function onCompensationCommit(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  compensation.value = Number.isFinite(value) ? clamp(Math.round(value), -2000, 2000) : -150
  setCompensation(compensation.value)
  scheduleDraft()
}

function nudgeCompensation(delta: number): void {
  compensation.value = clamp(compensation.value + delta, -2000, 2000)
  setCompensation(compensation.value)
  scheduleDraft()
}

function resetCompensation(): void {
  compensation.value = -150
  setCompensation(compensation.value)
  scheduleDraft()
}

function buildLrcContent(): string {
  if (!currentTrack.value) return ''
  return formatLrc(lines.value, {
    title: currentTrack.value.title,
    artist: currentTrack.value.artist,
    album: currentTrack.value.album,
    by: 'KexGo'
  })
}

function warnUntimed(): boolean {
  if (timedCount.value === 0) {
    toast('warning', '还没有时间轴', '至少给一行歌词打点后再保存')
    return true
  }
  if (untimedCount.value > 0) {
    toast(
      'info',
      `还有 ${untimedCount.value} 行未打点`,
      '保存时会保留已打点的歌词；未打点行会被跳过。'
    )
  }
  return false
}

async function saveLyrics(): Promise<void> {
  if (!currentTrack.value || saving.value) return
  if (warnUntimed()) return
  saving.value = true
  try {
    if (draftTimer !== null) {
      window.clearTimeout(draftTimer)
      draftTimer = null
    }
    const response = await saveAlignedLyrics(currentTrack.value.id, buildLrcContent(), writeSidecar.value)
    dirty.value = false
    draftStatus.value = 'saved'
    draftSavedAt.value = null
    restoredDraft.value = false
    await api.clearDraft(currentTrack.value.id)
    const result = response.result
    if (result.warning) {
      toast('warning', 'LRC 已保存到曲库', result.warning)
    } else if (result.sidecarPath) {
      toast('success', `已保存 ${timedCount.value} 行歌词`, '已同步写入歌曲同目录的 .lrc 文件')
    } else {
      toast('success', `已保存 ${timedCount.value} 行歌词`, '保存在 KexGo 应用数据目录')
    }
  } catch (error) {
    toast('error', '保存失败', error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}

async function exportLyrics(): Promise<void> {
  if (!currentTrack.value || exporting.value) return
  if (warnUntimed()) return
  exporting.value = true
  try {
    const safeTitle = currentTrack.value.title.replace(/[\\/:*?"<>|]/g, '_') || 'lyrics'
    const path = await api.exportLrc(
      currentTrack.value.id,
      buildLrcContent(),
      `${currentTrack.value.artist ? `${currentTrack.value.artist} - ` : ''}${safeTitle}.lrc`
    )
    if (path) toast('success', 'LRC 已导出', path)
  } catch (error) {
    toast('error', '导出失败', error instanceof Error ? error.message : String(error))
  } finally {
    exporting.value = false
  }
}

async function close(): Promise<void> {
  if (draftTimer !== null) {
    window.clearTimeout(draftTimer)
    draftTimer = null
  }
  if (dirty.value) await persistDraft().catch(() => undefined)
  document.body.classList.remove('align-open')
  closeAlignment()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  const target = event.target as HTMLElement | null
  const isEditable =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable

  if (event.key === 'Escape') {
    event.preventDefault()
    void close()
    return
  }
  if (isEditable) return

  const shortcuts = state.preferences.shortcuts
  const repeated = event.repeat

  if (shortcutMatches(event, shortcuts.alignMark)) {
    event.preventDefault()
    if (!repeated) stampCurrentLine()
    return
  }
  if (shortcutMatches(event, shortcuts.alignPause)) {
    event.preventDefault()
    if (!repeated) void togglePlay()
    return
  }
  if (shortcutMatches(event, shortcuts.alignRewind)) {
    event.preventDefault()
    if (!repeated) rewind()
    return
  }
  if (shortcutMatches(event, shortcuts.alignUndo)) {
    event.preventDefault()
    if (!repeated) undo()
    return
  }
  if (shortcutMatches(event, shortcuts.alignSave)) {
    event.preventDefault()
    if (!repeated) void saveLyrics()
    return
  }
  if (shortcutCodeMatches(event, shortcuts.alignBack) || shortcutCodeMatches(event, shortcuts.alignForward)) {
    event.preventDefault()
    const direction = shortcutCodeMatches(event, shortcuts.alignBack) ? -1 : 1
    const delta = event.ctrlKey || event.metaKey ? 500 : event.shiftKey ? 10 : 100
    adjustCurrent(direction * delta)
  }
}

async function initialize(): Promise<void> {
  const track = currentTrack.value
  if (!track) {
    loadingSession.value = false
    ready.value = true
    return
  }
  const freshText = state.pendingAlignText
  const sourceText = freshText || track.lyricsText
  const parsed = parseLyrics(sourceText)
  lines.value = parsed.lines
  const firstUntimed = lines.value.findIndex((line) => line.timeMs === null)
  const sounding = activeLineIndex(parsed.lines, state.position * 1000)
  cursor.value = firstUntimed >= 0 ? firstUntimed : Math.max(0, sounding)

  try {
    const draft = await api.loadDraft(track.id)
    if (draft && draft.lines.length > 0) {
      const sameScript =
        draft.lines.length === parsed.lines.length &&
        draft.lines.every((line, index) => line.text.trim() === parsed.lines[index]?.text.trim())
      if (sameScript) {
        lines.value = draft.lines
        cursor.value = clamp(draft.cursor, 0, Math.max(0, draft.lines.length - 1))
        compensation.value = clamp(draft.compensationMs ?? -150, -2000, 2000)
        restoredDraft.value = true
        restoredAt.value = draft.savedAt
      }
    }
  } catch {
    // A missing draft is normal.
  }

  if (isFinite(compensation.value)) setCompensation(compensation.value)
  loadingSession.value = false
  ready.value = true
  scrollCursorIntoView()
  if (restoredDraft.value) toast('info', '已恢复上次的对轴草稿', '继续按空格打点，或按 S 保存')
}

watch(cursor, () => {
  if (ready.value) {
    markChanged()
    scrollCursorIntoView()
  }
})

watch(
  () => lines.value,
  () => {
    if (ready.value) markChanged()
  },
  { deep: true }
)

watch(
  () => state.activeView,
  (view) => {
    if (view === 'align') void nextTick(scrollCursorIntoView)
  }
)

onMounted(() => {
  document.body.classList.add('align-open')
  window.addEventListener('keydown', onKeydown)
  void initialize()
  if (!currentCover.value && currentTrack.value) void loadCover(currentTrack.value)
})

onBeforeUnmount(() => {
  document.body.classList.remove('align-open')
  window.removeEventListener('keydown', onKeydown)
  if (draftTimer !== null) window.clearTimeout(draftTimer)
  if (pulseTimer !== null) window.clearTimeout(pulseTimer)
  if (dirty.value) void persistDraft().catch(() => undefined)
})
</script>

<template>
  <div class="align-screen">
    <header class="align-topbar">
      <div class="align-top-left">
        <button class="back-button" aria-label="返回播放器" title="返回播放器（草稿会自动保存）" @click="close">
          <AppIcon name="arrow-left" :size="18" />
        </button>
        <div class="align-title-block">
          <span class="eyebrow">QUICK SYNC</span>
          <div class="align-title-row">
            <h1>快速对轴</h1>
            <span class="title-divider"></span>
            <span class="now-title">{{ trackTitle }}</span>
          </div>
        </div>
      </div>

      <div class="draft-indicator">
        <span class="draft-dot" :class="draftStatus"></span>
        <span v-if="draftStatus === 'saving'">草稿保存中…</span>
        <span v-else-if="draftSavedAt">草稿已自动保存</span>
        <span v-else-if="restoredDraft">已恢复草稿</span>
        <span v-else>自动保存已开启</span>
      </div>

      <div class="align-top-actions">
        <button class="top-ghost" :disabled="history.length === 0" @click="undo">
          <AppIcon name="undo" :size="15" />
          撤销
          <kbd>Z</kbd>
        </button>
        <button class="top-save" :disabled="saving" @click="saveLyrics">
          <span v-if="saving" class="small-spinner"></span>
          <AppIcon v-else name="save" :size="15" />
          {{ saveLabel }}
          <kbd>S</kbd>
        </button>
      </div>
    </header>

    <div class="align-body">
      <section class="align-workspace">
        <div v-if="restoredDraft" class="restore-banner">
          <span class="restore-icon"><AppIcon name="clock" :size="13" /></span>
          <p>已恢复上次自动保存的草稿，可以继续打点。</p>
          <button @click="restoredDraft = false">知道了</button>
        </div>

        <div class="list-head">
          <span>#</span>
          <span>时间</span>
          <span>歌词</span>
          <span class="head-state">状态</span>
        </div>

        <div v-if="loadingSession" class="align-loading">
          <span class="loading-orbit"></span>
          <p>准备对轴画布…</p>
        </div>

        <div
          v-else-if="lines.length === 0"
          class="align-empty"
        >
          <AppIcon name="file-text" :size="25" />
          <h3>还没有可对轴的歌词</h3>
          <p>先在线找词，或粘贴一份纯文本歌词。</p>
          <button class="primary-button" @click="close">返回并找歌词</button>
        </div>

        <div v-else ref="listEl" class="align-list" :class="{ pulsing: stampPulse > 0 }">
          <button
            v-for="(line, index) in lines"
            :key="line.id"
            :ref="(el) => setRowRef(el, index)"
            class="align-row"
            :class="{
              current: index === cursor,
              stamped: line.timeMs !== null,
              sounding: index === playbackIndex && state.playing,
              justStamped: index === cursor - 1 && stampPulse > 0
            }"
            @click="selectRow(index, line)"
          >
            <span class="row-index">{{ (index + 1).toString().padStart(2, '0') }}</span>
            <span class="row-time" :class="{ empty: line.timeMs === null }">
              {{ formatLyricTime(line.timeMs) }}
            </span>
            <span class="row-text">{{ line.text }}</span>
            <span class="row-state">
              <span v-if="index === cursor" class="cursor-label">
                <i></i> 当前行
              </span>
              <span v-else-if="line.timeMs !== null" class="stamped-label">
                <AppIcon name="check" :size="11" /> 已打点
              </span>
              <span v-else class="untimed-label">未打点</span>
            </span>
            <span v-if="index === cursor" class="row-cursor"></span>
          </button>
        </div>

        <footer class="align-list-footer">
          <span><i class="bullet accent"></i> 空格给当前行打点并跳到下一行</span>
          <span><i class="bullet"></i> 点击任意行试听</span>
          <span class="footer-count">{{ timedCount }} / {{ lines.length }} 行已打点</span>
        </footer>
      </section>

      <aside class="align-console">
        <div class="console-track">
          <CoverArt
            :src="currentCover"
            :title="currentTrack?.title || ''"
            :artist="currentTrack?.artist || ''"
            size="sm"
            alt="当前歌曲封面"
          />
          <div>
            <strong>{{ currentTrack?.title }}</strong>
            <span>{{ currentTrack?.artist }}</span>
          </div>
          <span class="console-status"><i></i> 对轴中</span>
        </div>

        <section class="playback-card">
          <div class="big-time">
            <span>{{ formatLyricTime(state.position * 1000) }}</span>
            <small>/ {{ formatLyricTime(state.duration * 1000) }}</small>
          </div>
          <div class="progress-wrap">
            <div
              ref="scrubberEl"
              class="align-scrubber"
              role="slider"
              tabindex="0"
              aria-label="播放进度"
              aria-orientation="horizontal"
              :aria-valuemin="0"
              :aria-valuemax="Math.round(state.duration)"
              :aria-valuenow="Math.round(state.position)"
              @pointerdown="startScrubbing"
              @pointermove="moveScrubbing"
              @pointerup="endScrubbing"
              @pointercancel="endScrubbing"
              @keydown.left.prevent="nudgeSeek(-5)"
              @keydown.right.prevent="nudgeSeek(5)"
              @keydown.home.prevent="nudgeSeek(-state.duration)"
              @keydown.end.prevent="nudgeSeek(state.duration)"
            >
              <div class="scrubber-track">
                <span class="scrubber-fill" :style="{ width: `${progressPercent}%` }"></span>
                <span class="scrubber-thumb" :style="{ left: `${progressPercent}%` }"></span>
              </div>
              <div class="scrubber-markers" aria-hidden="true">
                <span v-for="(marker, index) in markers" :key="index" :style="{ left: `${marker}%` }"></span>
              </div>
            </div>
          </div>
          <div class="playback-controls">
            <button class="console-icon" aria-label="回退三秒" title="回退 3 秒（R）" @click="rewind">
              <AppIcon name="rewind" :size="16" />
            </button>
            <button class="console-play" :aria-label="state.playing ? '暂停' : '播放'" @click="togglePlay">
              <AppIcon :name="state.playing ? 'pause' : 'play'" :size="18" />
            </button>
            <button class="console-icon" aria-label="撤销" title="撤销（Z）" :disabled="history.length === 0" @click="undo">
              <AppIcon name="undo" :size="16" />
            </button>
            <span class="key-hint"><kbd>P</kbd> 播放 / 暂停</span>
          </div>

          <button class="stamp-button" @click="stampCurrentLine">
            <span class="stamp-key">SPACE</span>
            <span>
              <strong>给“{{ currentLine?.text?.slice(0, 14) || '当前行' }}”打点</strong>
              <small>{{ Math.round(state.position * 1000 + compensation) }}ms</small>
            </span>
            <AppIcon name="chevron" :size="14" />
          </button>
          <div class="stamp-meter">
            <span :style="{ width: `${stampProgress}%` }"></span>
          </div>
          <div class="stamp-meta">
            <span>第 {{ Math.min(cursor + 1, lines.length) }} 行 / 共 {{ lines.length }} 行</span>
            <span>{{ timedCount }} 行已打点</span>
          </div>
        </section>

        <section class="setting-card compensation-card">
          <div class="setting-heading">
            <div>
              <h3>反应延迟补偿</h3>
              <p>打点时间 = 播放时间 + 补偿</p>
            </div>
            <button class="reset-link" @click="resetCompensation">重置 -150</button>
          </div>
          <div class="stepper">
            <button aria-label="减少补偿" @click="nudgeCompensation(-50)">−</button>
            <label>
              <input
                :value="compensation"
                type="number"
                min="-2000"
                max="2000"
                step="10"
                @change="onCompensationCommit"
              />
              <span>ms</span>
            </label>
            <button aria-label="增加补偿" @click="nudgeCompensation(50)">+</button>
          </div>
          <div class="preset-row">
            <button v-for="preset in [-300, -200, -150, -100, 0]" :key="preset" :class="{ active: compensation === preset }" @click="nudgeCompensation(preset - compensation)">
              {{ preset }}
            </button>
          </div>
        </section>

        <section class="setting-card offset-card">
          <div class="setting-heading">
            <div>
              <h3>整体偏移</h3>
              <p>已有 LRC 时间整体移动，不逐行修改</p>
            </div>
          </div>
          <div class="offset-row">
            <label class="offset-input">
              <input v-model.number="offsetInput" type="number" step="10" placeholder="0" />
              <span>ms</span>
            </label>
            <button class="apply-offset" :disabled="timedCount === 0" @click="applyGlobalOffset">应用到全部</button>
          </div>
        </section>

        <section class="shortcut-card">
          <div class="shortcut-row"><kbd>P</kbd><span>播放 / 暂停</span><kbd>空格</kbd><span>打点并下一行</span></div>
          <div class="shortcut-row"><kbd>← →</kbd><span>±100ms</span><kbd>Shift + ← →</kbd><span>±10ms</span></div>
          <div class="shortcut-row"><kbd>Ctrl + ← →</kbd><span>±500ms</span><kbd>Z</kbd><span>撤销</span></div>
          <div class="shortcut-row"><kbd>R</kbd><span>回退 3 秒</span><kbd>S</kbd><span>保存</span></div>
        </section>

        <section class="save-card">
          <label class="sidecar-check">
            <input v-model="writeSidecar" type="checkbox" />
            <span class="checkbox-mark"><AppIcon name="check" :size="10" /></span>
            <span>
              <strong>同时写入歌曲同目录 .lrc</strong>
              <small>默认只保存到 KexGo 应用数据目录</small>
            </span>
          </label>
          <div v-if="untimedCount > 0" class="untimed-warning">
            <AppIcon name="clock" :size="12" />
            {{ untimedCount }} 行未打点，保存时将跳过
          </div>
          <div class="save-actions">
            <button class="export-button" :disabled="exporting" @click="exportLyrics">
              <AppIcon name="download" :size="14" />
              {{ exporting ? '导出中…' : '导出 LRC' }}
            </button>
            <button class="primary-button save-primary" :disabled="saving" @click="saveLyrics">
              <span v-if="saving" class="small-spinner"></span>
              <AppIcon v-else name="save" :size="14" />
              {{ saveLabel }}
            </button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.align-screen {
  /* Keep the quick aligner a dark focus workspace when the app is in light mode. */
  --bg: #0c0e0b;
  --bg-raised: #121410;
  --surface: #171a15;
  --surface-bright: #1c2019;
  --text-bright: #f3f5ec;
  --text: #e4e7dc;
  --muted: #989f90;
  --faint: #5f665b;
  --accent: #c8f56a;
  --accent-strong: #d8ff86;
  --accent-soft: rgb(200 245 106 / 8%);
  --accent-text: #c8f56a;
  --on-accent: #11140e;
  --sand: #e9c986;
  --line: rgb(255 255 255 / 7%);
  --line-strong: rgb(255 255 255 / 12%);
  --surface-soft: rgb(255 255 255 / 3%);
  --surface-hover: rgb(255 255 255 / 6%);
  color-scheme: dark;
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse at 20% 0%, rgb(200 245 106 / 4%), transparent 37%),
    #0c0e0b;
  color: var(--text);
  animation: align-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes align-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.align-topbar {
  flex: 0 0 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 26px;
  border-bottom: 1px solid var(--line);
  background: rgb(14 16 13 / 72%);
}

.align-top-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.back-button {
  display: grid;
  place-items: center;
  width: 33px;
  height: 33px;
  border-radius: 9px;
  color: var(--muted);
  border: 1px solid var(--line);
  transition: all 160ms ease;
}

.back-button:hover {
  color: var(--text);
  background: rgb(255 255 255 / 4%);
  border-color: var(--line-strong);
}

.eyebrow {
  color: var(--accent-text);
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.align-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 3px;
  min-width: 0;
}

.align-title-row h1 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 560;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.title-divider {
  width: 1px;
  height: 11px;
  background: var(--line-strong);
  flex: 0 0 auto;
}

.now-title {
  color: var(--faint);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draft-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  white-space: nowrap;
}

.draft-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--faint);
}

.draft-dot.saving {
  background: var(--sand);
  animation: pulse-dot 900ms ease-in-out infinite;
}
.draft-dot.saved {
  background: var(--accent);
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.align-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-ghost,
.top-save {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 33px;
  padding: 0 11px;
  border-radius: 8px;
  font-size: 10.5px;
  transition: all 160ms ease;
}

.top-ghost {
  color: var(--muted);
  border: 1px solid var(--line);
}

.top-ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-strong);
}

.top-ghost:disabled {
  opacity: 0.3;
}

.top-save {
  color: var(--on-accent);
  background: var(--accent);
  font-weight: 560;
}

.top-save:hover:not(:disabled) {
  background: #d7ff80;
}

.top-save:disabled {
  opacity: 0.55;
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-weight: 400;
  line-height: 1;
}

.top-save kbd {
  color: rgb(17 20 14 / 55%);
  border-color: rgb(17 20 14 / 18%);
}

.align-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 362px;
}

.align-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--line);
  padding: 0 26px;
}

.restore-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 14px;
  padding: 8px 11px;
  border-radius: 8px;
  border: 1px solid rgb(200 245 106 / 12%);
  background: rgb(200 245 106 / 4%);
  color: var(--muted);
  font-size: 9.5px;
}

.restore-icon {
  color: var(--accent-text);
}

.restore-banner p {
  flex: 1;
}

.restore-banner button {
  color: var(--accent-text);
  font-size: 9px;
}

.list-head {
  display: grid;
  grid-template-columns: 42px 102px minmax(0, 1fr) 90px;
  align-items: center;
  gap: 12px;
  height: 48px;
  flex: 0 0 auto;
  padding: 0 11px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--line);
}

.head-state {
  text-align: right;
}

.align-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 7px 0 26px;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 9%) transparent;
}

.align-row {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: 42px 102px minmax(0, 1fr) 90px;
  align-items: center;
  gap: 12px;
  min-height: 45px;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid transparent;
  text-align: left;
  color: var(--muted);
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}

.align-row + .align-row {
  margin-top: 1px;
}

.align-row:hover {
  background: rgb(255 255 255 / 2.9%);
}

.align-row.current {
  background: rgb(200 245 106 / 5.5%);
  border-color: rgb(200 245 106 / 11%);
}

.align-row.sounding:not(.current) {
  background: rgb(255 255 255 / 2%);
}

.row-cursor {
  position: absolute;
  left: -1px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
  box-shadow: 0 0 13px rgb(200 245 106 / 42%);
}

.row-index {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
}

.align-row.current .row-index {
  color: var(--accent-text);
}

.row-time {
  color: rgb(200 245 106 / 72%);
  font-family: var(--font-mono);
  font-size: 9.5px;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.row-time.empty {
  color: rgb(255 255 255 / 16%);
}

.row-text {
  color: rgb(235 239 228 / 64%);
  font-size: 12.5px;
  line-height: 1.45;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 140ms ease;
}

.align-row.stamped .row-text {
  color: rgb(235 239 228 / 82%);
}

.align-row.current .row-text {
  color: var(--text-bright);
  font-size: 13.5px;
  font-weight: 500;
}

.row-state {
  text-align: right;
  display: flex;
  justify-content: flex-end;
}

.cursor-label,
.stamped-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 7.5px;
  white-space: nowrap;
}

.cursor-label {
  color: var(--accent-text);
}

.cursor-label i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.stamped-label {
  color: rgb(200 245 106 / 37%);
}

.untimed-label {
  color: rgb(255 255 255 / 13%);
  font-family: var(--font-mono);
  font-size: 7.5px;
}

.align-row.justStamped .row-time {
  animation: stamp-flash 420ms ease;
}

@keyframes stamp-flash {
  0% {
    color: var(--accent-text);
    text-shadow: 0 0 14px rgb(200 245 106 / 60%);
  }
  100% {
  }
}

.align-list-footer {
  flex: 0 0 45px;
  display: flex;
  align-items: center;
  gap: 19px;
  border-top: 1px solid var(--line);
  color: var(--faint);
  font-size: 8.5px;
}

.align-list-footer span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.bullet {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--line-strong);
}

.bullet.accent {
  background: var(--accent);
}

.footer-count {
  margin-left: auto;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.align-loading,
.align-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 13px;
  color: var(--faint);
  text-align: center;
}

.loading-orbit {
  width: 25px;
  height: 25px;
  border-radius: 50%;
  border: 1px solid rgb(200 245 106 / 20%);
  border-top-color: var(--accent-text);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.align-loading p {
  font-size: 9.5px;
}

.align-empty h3 {
  color: var(--text);
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 520;
}

.align-empty p {
  font-size: 10px;
}

.align-empty .primary-button {
  margin-top: 7px;
}

/* Console */
.align-console {
  width: 100%;
  overflow-y: auto;
  padding: 18px 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 9%) transparent;
  background: rgb(15 17 14 / 50%);
}

.console-track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 2px;
}

.console-track > div {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.console-track strong {
  font-size: 10.5px;
  font-weight: 540;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.console-track span {
  color: var(--faint);
  font-size: 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.console-status {
  display: inline-flex !important;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 7px !important;
  color: rgb(200 245 106 / 50%) !important;
  white-space: nowrap;
}

.console-status i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.playback-card,
.setting-card,
.save-card {
  border: 1px solid var(--line);
  border-radius: 11px;
  background: rgb(255 255 255 / 1.7%);
  padding: 14px;
}

.big-time {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-bright);
  font-family: var(--font-mono);
  font-size: 25px;
  letter-spacing: -0.055em;
}

.big-time small {
  color: var(--faint);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
}

.progress-wrap {
  margin-top: 9px;
}

.align-scrubber {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  border-radius: 4px;
}

.align-scrubber:focus-visible {
  outline: none;
}

.align-scrubber:focus-visible .scrubber-track {
  box-shadow: 0 0 0 3px rgb(200 245 106 / 12%);
}

.scrubber-track {
  position: relative;
  width: 100%;
  height: 2px;
  border-radius: 2px;
  background: rgb(255 255 255 / 9%);
}

.scrubber-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.scrubber-thumb {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 4px rgb(200 245 106 / 10%);
  pointer-events: none;
  z-index: 3;
}

.align-scrubber:hover .scrubber-thumb {
  box-shadow: 0 0 0 5px rgb(200 245 106 / 15%);
}

.scrubber-markers {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
}

.scrubber-markers span {
  position: absolute;
  width: 1px;
  height: 2px;
  background: rgb(255 255 255 / 30%);
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
}

.console-icon {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  color: var(--muted);
  transition: color 160ms ease;
}

.console-icon:hover:not(:disabled) {
  color: var(--text);
}

.console-icon:disabled {
  opacity: 0.25;
}

.console-play {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--on-accent);
  background: var(--accent);
  box-shadow: 0 4px 14px rgb(200 245 106 / 10%);
}

.console-play .app-icon {
  margin-left: 1px;
}

.key-hint {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--faint);
  font-size: 7.5px;
  white-space: nowrap;
}

.stamp-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 13px;
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid rgb(200 245 106 / 17%);
  background: rgb(200 245 106 / 5.5%);
  text-align: left;
  transition: background 160ms ease;
}

.stamp-button:hover {
  background: rgb(200 245 106 / 9%);
}

.stamp-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 45px;
  height: 25px;
  padding: 0 6px;
  border-radius: 5px;
  background: rgb(200 245 106 / 12%);
  border: 1px solid rgb(200 245 106 / 18%);
  color: var(--accent-text);
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.stamp-button > span:nth-child(2) {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.stamp-button strong {
  color: var(--text);
  font-size: 9.5px;
  font-weight: 510;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stamp-button small {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
  white-space: nowrap;
}

.stamp-button > .app-icon {
  color: var(--faint);
}

.stamp-meter {
  height: 2px;
  margin-top: 9px;
  background: rgb(255 255 255 / 7%);
  border-radius: 2px;
  overflow: hidden;
}

.stamp-meter span {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0.55;
  transition: width 200ms ease;
}

.stamp-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
}

.setting-heading {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.setting-heading h3 {
  color: var(--text);
  font-size: 10px;
  font-weight: 540;
}

.setting-heading p {
  margin-top: 3px;
  color: var(--faint);
  font-size: 8px;
  line-height: 1.4;
}

.reset-link {
  color: var(--faint);
  font-size: 7.5px;
  white-space: nowrap;
  height: fit-content;
  transition: color 160ms ease;
}

.reset-link:hover {
  color: var(--muted);
}

.stepper {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.stepper > button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--muted);
  border: 1px solid var(--line);
  font-size: 14px;
  transition: all 160ms ease;
}

.stepper > button:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.stepper label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: rgb(0 0 0 / 13%);
}

.stepper input {
  width: 55px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: right;
}

.stepper input::-webkit-inner-spin-button {
  display: none;
}

.stepper label span {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
}

.preset-row {
  display: flex;
  gap: 4px;
  margin-top: 7px;
}

.preset-row button {
  flex: 1;
  height: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  transition: all 140ms ease;
}

.preset-row button:hover {
  color: var(--muted);
  background: rgb(255 255 255 / 3%);
}

.preset-row button.active {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 15%);
  background: rgb(200 245 106 / 5%);
}

.offset-row {
  display: flex;
  gap: 7px;
  margin-top: 10px;
}

.offset-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: rgb(0 0 0 / 13%);
}

.offset-input input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 10px;
}

.offset-input span {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
}

.apply-offset {
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--muted);
  font-size: 8.5px;
  transition: all 160ms ease;
}

.apply-offset:hover:not(:disabled) {
  color: var(--accent-text);
  border-color: rgb(200 245 106 / 20%);
}

.apply-offset:disabled {
  opacity: 0.35;
}

.shortcut-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 1px 2px;
}

.shortcut-row {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  align-items: center;
  gap: 7px;
  color: var(--faint);
  font-size: 7.5px;
}

.shortcut-row kbd {
  min-width: 20px;
  height: 17px;
  padding: 0 4px;
  font-size: 7px;
  color: var(--muted);
  background: rgb(255 255 255 / 2%);
}

.save-card {
  margin-top: auto;
  padding: 12px;
}

.sidecar-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}

.sidecar-check input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.checkbox-mark {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin-top: 1px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  color: transparent;
  transition: all 160ms ease;
}

.sidecar-check input:checked + .checkbox-mark {
  color: #13160e;
  background: var(--accent);
  border-color: var(--accent-text);
}

.sidecar-check > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sidecar-check strong {
  color: var(--muted);
  font-size: 8.5px;
  font-weight: 500;
}

.sidecar-check small {
  color: var(--faint);
  font-size: 7.5px;
}

.untimed-warning {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 9px;
  color: var(--sand);
  font-size: 8px;
}

.save-actions {
  display: flex;
  gap: 6px;
  margin-top: 11px;
}

.export-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 31px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 8.5px;
  transition: all 160ms ease;
  white-space: nowrap;
}

.export-button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--line-strong);
}

.export-button:disabled {
  opacity: 0.5;
}

.save-primary {
  flex: 1;
  height: 31px;
  border-radius: 6px;
  font-size: 9px;
  gap: 6px;
}

.small-spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid rgb(17 20 14 / 25%);
  border-top-color: currentColor;
  animation: spin 700ms linear infinite;
}

@media (max-width: 1200px) {
  .align-body {
    grid-template-columns: minmax(0, 1fr) 334px;
  }
  .align-console {
    padding: 15px 16px 18px;
  }
  .align-workspace {
    padding: 0 18px;
  }
  .list-head,
  .align-row {
    grid-template-columns: 34px 92px minmax(0, 1fr) 74px;
    gap: 9px;
  }
  .shortcut-card {
    display: none;
  }
  .stamp-button small {
    display: none;
  }
}

@media (max-width: 960px) {
  .align-body {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
  .draft-indicator {
    display: none;
  }
  .align-workspace {
    padding: 0 12px;
  }
  .align-console {
    padding: 12px;
  }
  .list-head,
  .align-row {
    grid-template-columns: 30px 82px minmax(0, 1fr);
  }
  .head-state,
  .row-state {
    display: none;
  }
  .align-list-footer span:nth-child(2) {
    display: none;
  }
  .top-ghost kbd {
    display: none;
  }
}
</style>
