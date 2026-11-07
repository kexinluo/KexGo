<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { OnlineLyricsResult } from '../types'
import { formatClock } from '../utils/time'
import { normalizePastedLyrics } from '../utils/lrc'
import AppIcon from './AppIcon.vue'

const {
  state,
  currentTrack,
  getLyrics,
  applyOnlineLyrics,
  openAlignment,
  pickLrc,
  toast
} = useApp()

const title = ref(currentTrack.value?.title ?? '')
const artist = ref(currentTrack.value?.artist ?? '')
const album = ref(currentTrack.value?.album ?? '')
const results = ref<OnlineLyricsResult[]>([])
const searching = ref(false)
const searched = ref(false)
const searchError = ref('')
const resultsEl = ref<HTMLElement | null>(null)
const titleInput = ref<HTMLInputElement | null>(null)
const pasteText = ref('')
const applying = ref<string | null>(null)
const showPaste = ref(false)

const normalized = computed(() => normalizePastedLyrics(pasteText.value))
const pasteLineCount = computed(() => normalized.value.text.split('\n').filter(Boolean).length)
const canStartAlign = computed(() => pasteLineCount.value >= 2)

async function search(): Promise<void> {
  if (!title.value.trim() || searching.value) return
  searching.value = true
  searched.value = true
  searchError.value = ''
  try {
    const found = await getLyrics({
      trackName: title.value.trim(),
      artistName: artist.value.trim(),
      albumName: album.value.trim() || undefined,
      duration: currentTrack.value?.duration
    })
    const seen = new Set<number>()
    results.value = found.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return Boolean(item.syncedLyrics?.trim() || item.plainLyrics?.trim())
    })
    await nextTick()
    resultsEl.value?.scrollTo({ top: 0 })
  } catch (error) {
    searchError.value =
      error instanceof Error ? error.message : typeof error === 'string' ? error : '网络请求失败'
    results.value = []
  } finally {
    searching.value = false
  }
}

async function useResult(result: OnlineLyricsResult, alignAfter = false): Promise<void> {
  const key = `${result.id}-${alignAfter ? 'align' : 'use'}`
  applying.value = key
  try {
    await applyOnlineLyrics(result, alignAfter)
  } finally {
    applying.value = null
  }
}

function startFromPaste(): void {
  if (!canStartAlign.value) {
    toast('warning', '歌词还不够', '至少需要两行有效的歌词')
    return
  }
  if (normalized.value.longLines.length > 0) {
    toast(
      'info',
      '有较长的歌词行',
      `第 ${normalized.value.longLines.slice(0, 4).join('、')} 行较长，可以在对轴时拆成两行`
    )
  }
  state.pendingAlignText = normalized.value.text
  openAlignment(normalized.value.text)
}

async function importLocalLrc(): Promise<void> {
  await pickLrc()
}

function close(): void {
  state.lyricsModalOpen = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function focusPaste(): void {
  showPaste.value = true
  void nextTick(() => {
    document.getElementById('lyrics-paste-area')?.focus()
  })
}

watch(
  () => currentTrack.value?.id,
  () => {
    title.value = currentTrack.value?.title ?? ''
    artist.value = currentTrack.value?.artist ?? ''
    album.value = currentTrack.value?.album ?? ''
  }
)

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.classList.add('modal-open')
  void nextTick(() => titleInput.value?.focus())
  if (currentTrack.value) void search()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('modal-open')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="modal-backdrop" @mousedown.self="close">
        <section class="lyrics-modal" role="dialog" aria-modal="true" aria-labelledby="lyrics-modal-title">
          <header class="modal-header">
            <div>
              <span class="eyebrow">LYRIC LOOKUP</span>
              <h2 id="lyrics-modal-title">找歌词</h2>
            </div>
            <button class="modal-close" aria-label="关闭" @click="close">
              <AppIcon name="close" :size="17" />
            </button>
          </header>

          <div class="modal-search">
            <label class="field grow">
              <span>歌名</span>
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                placeholder="输入歌曲名"
                autocomplete="off"
                @keydown.enter="search"
              />
            </label>
            <label class="field grow">
              <span>歌手</span>
              <input
                v-model="artist"
                type="text"
                placeholder="输入歌手名"
                autocomplete="off"
                @keydown.enter="search"
              />
            </label>
            <button class="primary-button search-submit" :disabled="searching || !title.trim()" @click="search">
              <span v-if="searching" class="small-spinner"></span>
              <AppIcon v-else name="search" :size="15" />
              {{ searching ? '查找中' : '查找' }}
            </button>
          </div>

          <div class="source-strip">
            <span class="source-badge"><i></i> LRCLIB 开放歌词库</span>
            <span>优先同步 LRC · 纯文本也可导入对轴</span>
          </div>

          <div ref="resultsEl" class="results-scroll">
            <div v-if="searching" class="results-loading">
              <div v-for="index in 3" :key="index" class="result-skeleton">
                <span class="skeleton-circle"></span>
                <div>
                  <span class="skeleton-line wide"></span>
                  <span class="skeleton-line"></span>
                </div>
              </div>
              <p>正在开放歌词库里寻找这一首…</p>
            </div>

            <div v-else-if="searchError" class="result-message">
              <span class="message-icon error"><AppIcon name="globe" :size="19" /></span>
              <h3>连接歌词库失败</h3>
              <p>{{ searchError }}</p>
              <button class="ghost-button" @click="search">再试一次</button>
            </div>

            <div v-else-if="searched && results.length === 0" class="result-message">
              <span class="message-icon"><AppIcon name="search" :size="19" /></span>
              <h3>这次没有找到</h3>
              <p>可以换个写法，或者用你手里的歌词开始手动对轴。</p>
              <button class="ghost-button" @click="focusPaste">粘贴纯文本歌词</button>
            </div>

            <div v-else-if="results.length" class="result-list">
              <article v-for="result in results" :key="result.id" class="result-row">
                <div class="result-mark">
                  <AppIcon :name="result.syncedLyrics ? 'align' : 'file-text'" :size="16" />
                </div>
                <div class="result-info">
                  <div class="result-title-line">
                    <h3>{{ result.trackName }}</h3>
                    <span v-if="result.syncedLyrics" class="format-pill synced">同步 LRC</span>
                    <span v-else class="format-pill">纯文本</span>
                    <span v-if="result.instrumental" class="format-pill">纯音乐</span>
                  </div>
                  <p>
                    {{ result.artistName || '未知歌手' }}
                    <span v-if="result.albumName"> · {{ result.albumName }}</span>
                    <span v-if="result.duration"> · {{ formatClock(result.duration) }}</span>
                  </p>
                </div>
                <div class="result-actions">
                  <button
                    class="row-action ghost"
                    :disabled="applying !== null"
                    @click="useResult(result, false)"
                  >
                    使用歌词
                  </button>
                  <button
                    class="row-action accent"
                    :disabled="applying !== null"
                    @click="useResult(result, true)"
                  >
                    <span v-if="applying === `${result.id}-align`" class="small-spinner"></span>
                    <span v-else>对轴微调</span>
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="result-message quiet">
              <span class="message-icon"><AppIcon name="sparkles" :size="19" /></span>
              <p>输入歌名和歌手，先去找找有没有现成的同步歌词。</p>
            </div>

            <section class="paste-section" :class="{ open: showPaste }">
              <button class="paste-toggle" @click="showPaste = !showPaste">
                <span class="paste-icon"><AppIcon name="file-text" :size="15" /></span>
                <span>
                  <strong>或者，粘贴你手里的歌词</strong>
                  <small>自动去掉空行、合并短句，然后进入快速对轴</small>
                </span>
                <AppIcon name="chevron" :size="14" class="chevron" />
              </button>

              <div v-if="showPaste" class="paste-body">
                <textarea
                  id="lyrics-paste-area"
                  v-model="pasteText"
                  rows="7"
                  placeholder="把纯文本歌词粘贴到这里，一行一句…"
                  spellcheck="false"
                ></textarea>
                <div class="paste-footer">
                  <div class="paste-review">
                    <template v-if="pasteText.trim()">
                      <span>{{ pasteLineCount }} 行</span>
                      <span v-if="normalized.removedBlank">· 去除 {{ normalized.removedBlank }} 个空行</span>
                      <span v-if="normalized.mergedShort">· 合并 {{ normalized.mergedShort }} 个短句</span>
                    </template>
                    <span v-else>支持中文、英文与混合歌词</span>
                  </div>
                  <div class="paste-actions">
                    <button class="ghost-button small" @click="importLocalLrc">
                      <AppIcon name="folder" :size="13" /> 导入 LRC 文件
                    </button>
                    <button class="primary-button small" :disabled="!canStartAlign" @click="startFromPaste">
                      <AppIcon name="align" :size="13" /> 开始快速对轴
                    </button>
                  </div>
                </div>
                <p v-if="normalized.longLines.length" class="long-line-hint">
                  第 {{ normalized.longLines.slice(0, 6).join('、') }} 行较长，建议在对轴时拆成两行。
                </p>
              </div>
            </section>
          </div>

          <footer class="modal-footer">
            <span><AppIcon name="keyboard" :size="12" /> Esc 关闭</span>
            <span class="legal-note">仅使用开放歌词库，不抓取音乐平台内容</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(4 5 4 / 72%);
  backdrop-filter: blur(13px);
}

.lyrics-modal {
  width: min(780px, calc(100vw - 36px));
  max-height: min(760px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: #141713;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  box-shadow: 0 40px 120px rgb(0 0 0 / 60%);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 26px 18px;
}

.eyebrow {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.modal-header h2 {
  margin-top: 7px;
  color: var(--text-bright);
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 540;
  letter-spacing: -0.045em;
}

.modal-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: var(--muted);
  border: 1px solid var(--line);
  transition: all 160ms ease;
}

.modal-close:hover {
  color: var(--text);
  border-color: var(--line-strong);
  background: rgb(255 255 255 / 3%);
}

.modal-search {
  display: flex;
  align-items: flex-end;
  gap: 9px;
  padding: 0 26px 17px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  color: var(--faint);
  font-size: 9px;
  letter-spacing: 0.03em;
}

.field input {
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgb(255 255 255 / 2.4%);
  color: var(--text);
  font-size: 11.5px;
  outline: 0;
  transition: border-color 160ms ease, background 160ms ease;
}

.field input:focus {
  border-color: rgb(200 245 106 / 26%);
  background: rgb(255 255 255 / 3.5%);
}

.field input::placeholder {
  color: var(--faint);
}

.grow {
  flex: 1;
  min-width: 0;
}

.search-submit {
  height: 36px;
  min-width: 80px;
  border-radius: 8px;
  font-size: 11px;
}

.source-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 26px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: rgb(255 255 255 / 1.4%);
  color: var(--faint);
  font-size: 8.5px;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.02em;
}

.source-badge i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.results-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 10%) transparent;
  padding: 8px 10px 14px;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 13px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background 160ms ease, border-color 160ms ease;
}

.result-row:hover {
  background: rgb(255 255 255 / 2.6%);
  border-color: var(--line);
}

.result-mark {
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  flex: 0 0 auto;
  color: var(--accent);
  border-radius: 9px;
  border: 1px solid rgb(200 245 106 / 13%);
  background: rgb(200 245 106 / 4%);
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-title-line {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.result-title-line h3 {
  color: var(--text);
  font-size: 12px;
  font-weight: 560;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.result-info p {
  margin-top: 4px;
  color: var(--faint);
  font-size: 9.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.format-pill {
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.02em;
  color: var(--faint);
  border: 1px solid var(--line);
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
}

.format-pill.synced {
  color: rgb(200 245 106 / 70%);
  border-color: rgb(200 245 106 / 15%);
  background: rgb(200 245 106 / 4%);
}

.result-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0.72;
  transition: opacity 160ms ease;
  flex: 0 0 auto;
}

.result-row:hover .result-actions,
.result-row:focus-within .result-actions {
  opacity: 1;
}

.row-action {
  height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 9.5px;
  white-space: nowrap;
  transition: all 160ms ease;
}

.row-action.ghost {
  color: var(--muted);
  border: 1px solid var(--line);
}

.row-action.ghost:hover {
  color: var(--text);
}

.row-action.accent {
  color: #14180f;
  background: var(--accent);
}

.row-action.accent:hover {
  background: #d6ff7e;
}

.row-action:disabled {
  opacity: 0.55;
}

.results-loading {
  padding: 3px 13px 4px;
}

.result-skeleton {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px;
}

.result-skeleton > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-circle {
  width: 35px;
  height: 35px;
  border-radius: 9px;
  background: rgb(255 255 255 / 4%);
  animation: shimmer 1.6s ease-in-out infinite;
}

.skeleton-line {
  height: 7px;
  width: 33%;
  border-radius: 4px;
  background: rgb(255 255 255 / 4%);
  animation: shimmer 1.6s ease-in-out infinite;
}

.skeleton-line.wide {
  width: 60%;
}

@keyframes shimmer {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

.results-loading p {
  color: var(--faint);
  text-align: center;
  font-size: 9px;
  margin: 15px 0;
}

.result-message {
  display: flex;
  align-items: center;
  flex-direction: column;
  text-align: center;
  padding: 44px 20px;
}

.result-message.quiet {
  padding: 28px 20px 18px;
}

.message-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: var(--muted);
  border: 1px solid var(--line);
  margin-bottom: 13px;
}

.message-icon.error {
  color: #ff9378;
  border-color: rgb(255 147 120 / 20%);
}

.result-message h3 {
  color: var(--text);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 520;
  letter-spacing: -0.02em;
}

.result-message p {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.7;
  margin-top: 7px;
  max-width: 380px;
}

.result-message .ghost-button {
  margin-top: 16px;
}

.paste-section {
  margin: 7px 16px 0;
  border-top: 1px solid var(--line);
}

.paste-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 15px 2px;
  color: var(--muted);
}

.paste-icon {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 7px;
  border: 1px solid var(--line);
  color: var(--faint);
  flex: 0 0 auto;
}

.paste-toggle > span:nth-child(2) {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.paste-toggle strong {
  color: var(--text);
  font-size: 10.5px;
  font-weight: 540;
}

.paste-toggle small {
  color: var(--faint);
  font-size: 9px;
}

.chevron {
  transform: rotate(90deg);
  transition: transform 200ms ease;
  color: var(--faint);
}

.paste-section.open .chevron {
  transform: rotate(-90deg);
}

.paste-body {
  padding: 0 0 11px;
}

.paste-body textarea {
  width: 100%;
  min-height: 130px;
  resize: vertical;
  padding: 12px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: rgb(0 0 0 / 15%);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 11px;
  line-height: 1.8;
  outline: 0;
}

.paste-body textarea:focus {
  border-color: rgb(200 245 106 / 20%);
}

.paste-body textarea::placeholder {
  color: var(--faint);
}

.paste-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 9px;
}

.paste-review {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.paste-actions {
  display: flex;
  gap: 7px;
}

.primary-button.small,
.ghost-button.small {
  height: 29px;
  font-size: 9.5px;
  padding: 0 10px;
}

.long-line-hint {
  margin-top: 8px;
  color: var(--sand);
  font-size: 8.5px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 26px;
  border-top: 1px solid var(--line);
  color: var(--faint);
  font-size: 8px;
}

.modal-footer > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legal-note {
  font-family: var(--font-mono);
  letter-spacing: 0.01em;
}

.small-spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid rgb(15 18 10 / 28%);
  border-top-color: currentColor;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 220ms ease;
}
.modal-enter-active .lyrics-modal,
.modal-leave-active .lyrics-modal {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .lyrics-modal,
.modal-leave-to .lyrics-modal {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@media (max-width: 700px) {
  .modal-backdrop {
    padding: 10px;
  }
  .lyrics-modal {
    width: 100%;
    max-height: calc(100vh - 20px);
  }
  .modal-search {
    flex-wrap: wrap;
  }
  .search-submit {
    width: 100%;
  }
  .source-strip {
    align-items: flex-start;
    flex-direction: column;
  }
  .result-actions {
    opacity: 1;
  }
  .result-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .result-actions {
    padding-left: 47px;
  }
  .modal-footer {
    padding: 10px 16px;
  }
}
</style>
