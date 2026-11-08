<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { LyricsNoteLine, LyricsNotesFile } from '../types'
import AppIcon from './AppIcon.vue'

const { state, currentTrack, currentLyrics, saveLyricsNotes, closeLyricsNotes, toast } = useApp()

const saving = ref(false)
const error = ref('')
const sourceLines = computed(() => currentLyrics.value.lines)

const noteMap = computed(() => {
  const map = new Map<number, LyricsNoteLine>()
  for (const line of state.lyricsNotes?.lines ?? []) map.set(line.index, line)
  return map
})

const rows = ref(
  sourceLines.value.map((line, index) => {
    const note = noteMap.value.get(index)
    return {
      index,
      text: line.text,
      translation: note?.translation ?? '',
      ruby: note?.ruby ?? '',
      romaji: note?.romaji ?? ''
    }
  })
)

watch(
  () => state.lyricsNotes,
  (notes) => {
    const map = new Map((notes?.lines ?? []).map((line) => [line.index, line]))
    rows.value = sourceLines.value.map((line, index) => {
      const note = map.get(index)
      return {
        index,
        text: line.text,
        translation: note?.translation ?? '',
        ruby: note?.ruby ?? '',
        romaji: note?.romaji ?? ''
      }
    })
  }
)

function close(): void {
  if (!saving.value) closeLyricsNotes()
}

async function save(): Promise<void> {
  if (!currentTrack.value) return
  saving.value = true
  error.value = ''
  try {
    const file: LyricsNotesFile = {
      version: 1,
      trackId: currentTrack.value.id,
      updatedAt: Date.now(),
      lines: rows.value
        .filter((line) => line.translation.trim() || line.ruby.trim() || line.romaji.trim())
        .map((line) => ({
          index: line.index,
          translation: line.translation.trim(),
          ruby: line.ruby.trim(),
          romaji: line.romaji.trim()
        }))
    }
    await saveLyricsNotes(file)
    closeLyricsNotes()
    toast('success', '翻译与注音已保存', '不会修改原始 LRC 文件。')
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '保存失败'
  } finally {
    saving.value = false
  }
}

function autoGenerate(): void {
  toast('info', '自动生成接口未配置', '已预留 provider 接口，可先手动填写翻译或注音。')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="notes-layer">
    <div class="notes-backdrop" @click="close"></div>
    <section class="notes-modal" role="dialog" aria-modal="true" aria-label="歌词翻译与注音">
      <header class="notes-heading">
        <div>
          <span class="eyebrow">TRANSLATION & RUBY</span>
          <h2>翻译与注音</h2>
          <p>{{ currentTrack?.title }} · 每行单独保存，不改原 LRC</p>
        </div>
        <button class="icon-button small" aria-label="关闭" @click="close">
          <AppIcon name="close" :size="15" />
        </button>
      </header>

      <div class="notes-hint">
        <span>日文假名格式：<code>漢字[かんじ]</code>，用于汉字上方注音；全罗马音填“罗马音”一列。</span>
        <button @click="autoGenerate">自动生成（占位）</button>
      </div>

      <div class="notes-list">
        <div v-for="row in rows" :key="row.index" class="note-row">
          <div class="note-source">
            <span class="note-index">{{ (row.index + 1).toString().padStart(2, '0') }}</span>
            <span>{{ row.text || '（空行）' }}</span>
          </div>
          <div class="note-fields">
            <label>
              <span>翻译</span>
              <input v-model="row.translation" placeholder="本行翻译，可留空" />
            </label>
            <label>
              <span>假名</span>
              <input v-model="row.ruby" placeholder="漢字[かんじ]" />
            </label>
            <label>
              <span>罗马音</span>
              <input v-model="row.romaji" placeholder="全罗马音 / 韩语罗马音" />
            </label>
          </div>
        </div>
      </div>

      <footer class="notes-footer">
        <span v-if="error" class="notes-error">{{ error }}</span>
        <span v-else class="notes-status">仅保存在本机歌词 notes 目录</span>
        <div class="notes-actions">
          <button class="secondary" @click="close">取消</button>
          <button class="primary-button" :disabled="saving" @click="save">
            <AppIcon name="save" :size="13" />
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.notes-layer {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 24px;
}

.notes-backdrop {
  position: absolute;
  inset: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(12px);
}

.notes-modal {
  position: relative;
  z-index: 1;
  width: min(760px, 100%);
  max-height: min(820px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: var(--panel-bg);
  box-shadow: 0 30px 100px rgb(0 0 0 / 40%);
  overflow: hidden;
}

.notes-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 21px 24px 15px;
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

.notes-heading h2 {
  margin: 0 0 5px;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 520;
  letter-spacing: -0.04em;
}

.notes-heading p {
  margin: 0;
  color: var(--faint);
  font-size: 8.5px;
}

.notes-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 9px 24px;
  color: var(--faint);
  border-bottom: 1px solid var(--line);
  font-size: 8px;
}

.notes-hint code {
  color: var(--accent-text);
  font-family: var(--font-mono);
}

.notes-hint button {
  flex: 0 0 auto;
  color: var(--accent-text);
  font-size: 8px;
}

.notes-list {
  overflow-y: auto;
  padding: 5px 24px;
}

.note-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.note-row:last-child { border-bottom: 0; }

.note-source {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 7px;
  color: var(--text);
  font-size: 11px;
}

.note-index {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
}

.note-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.note-fields label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--faint);
  font-size: 7.5px;
}

.note-fields input {
  width: 100%;
  height: 29px;
  padding: 0 8px;
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface-soft);
  font-size: 8.5px;
  outline: none;
}

.note-fields input:focus { border-color: var(--line-strong); }

.notes-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 12px 24px;
  border-top: 1px solid var(--line);
}

.notes-status, .notes-error { color: var(--faint); font-size: 8px; }
.notes-error { color: #d87864; }
.notes-actions { display: flex; align-items: center; gap: 8px; }
.notes-actions .secondary { color: var(--faint); font-size: 9px; }
.notes-actions .primary-button { height: 31px; font-size: 9px; }

@media (max-width: 680px) {
  .note-fields { grid-template-columns: 1fr; }
  .notes-hint { align-items: flex-start; flex-direction: column; }
}
</style>
