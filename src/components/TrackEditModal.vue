<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { formatClock } from '../utils/time'
import AppIcon from './AppIcon.vue'
import CoverArt from './CoverArt.vue'

const emit = defineEmits<{ (event: 'close'): void }>()
const { state, currentTrack, currentCover, updateMetadata, removeTrack, pickCover } = useApp()

const title = ref(currentTrack.value?.title ?? '')
const artist = ref(currentTrack.value?.artist ?? '')
const album = ref(currentTrack.value?.album ?? '')
const saving = ref(false)
const removing = ref(false)
const confirmingRemove = ref(false)
const errorMessage = ref('')

const fileName = computed(() => {
  const path = currentTrack.value?.filePath ?? ''
  return path.split(/[\\/]/).pop() || path
})

const hasLyrics = computed(() => Boolean(currentTrack.value?.lyricsText))

async function save(): Promise<void> {
  if (!title.value.trim() || !currentTrack.value) {
    errorMessage.value = '歌名不能为空'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    await updateMetadata(currentTrack.value.id, {
      title: title.value.trim(),
      artist: artist.value.trim() || '未知歌手',
      album: album.value.trim()
    })
    emit('close')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function confirmRemove(): Promise<void> {
  if (!currentTrack.value) return
  if (!confirmingRemove.value) {
    confirmingRemove.value = true
    return
  }
  removing.value = true
  await removeTrack(currentTrack.value.id)
  removing.value = false
  emit('close')
}

function close(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="currentTrack" class="modal-backdrop" @mousedown.self="close">
        <section class="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
          <header class="edit-header">
            <div>
              <span class="eyebrow">TRACK DETAILS</span>
              <h2 id="edit-modal-title">歌曲信息</h2>
            </div>
            <button class="modal-close" aria-label="关闭" @click="close">
              <AppIcon name="close" :size="17" />
            </button>
          </header>

          <div class="edit-body">
            <div class="cover-column">
              <CoverArt
                :src="currentCover"
                :title="currentTrack.title"
                :artist="currentTrack.artist"
                size="hero"
                glow
              />
              <button class="cover-action" @click="pickCover">
                <AppIcon name="image" :size="13" />
                更换封面
              </button>
              <span class="cover-note">封面会复制到应用数据目录</span>
            </div>

            <div class="form-column">
              <label class="formal-field">
                <span>歌名</span>
                <input v-model="title" type="text" maxlength="120" autocomplete="off" />
              </label>
              <label class="formal-field">
                <span>歌手</span>
                <input v-model="artist" type="text" maxlength="120" autocomplete="off" placeholder="未知歌手" />
              </label>
              <label class="formal-field">
                <span>专辑 <small>可选</small></span>
                <input v-model="album" type="text" maxlength="120" autocomplete="off" placeholder="未填写" />
              </label>

              <div class="track-facts">
                <div>
                  <span>文件</span>
                  <strong :title="currentTrack.filePath">{{ fileName }}</strong>
                </div>
                <div>
                  <span>时长</span>
                  <strong>{{ formatClock(currentTrack.duration) }}</strong>
                </div>
                <div>
                  <span>歌词</span>
                  <strong :class="{ accent: hasLyrics }">
                    {{ hasLyrics ? (currentTrack.lyricsOrigin === 'lrclib' ? 'LRCLIB' : '已关联') : '暂无' }}
                  </strong>
                </div>
              </div>

              <p class="edit-note">
                原始音频文件不会被修改。此处只更新 KexGo 曲库里的显示信息。
              </p>

              <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
            </div>
          </div>

          <footer class="edit-footer">
            <div class="danger-zone">
              <button class="remove-button" :class="{ confirming: confirmingRemove }" :disabled="removing" @click="confirmRemove">
                <AppIcon name="trash" :size="13" />
                {{ removing ? '正在移除…' : confirmingRemove ? '再点一次确认移除' : '从曲库移除' }}
              </button>
              <span>不会删除本地音频</span>
            </div>
            <div class="footer-actions">
              <button class="ghost-button" @click="close">取消</button>
              <button class="primary-button" :disabled="saving" @click="save">
                {{ saving ? '保存中…' : '保存修改' }}
              </button>
            </div>
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
  z-index: 110;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(4 5 4 / 72%);
  backdrop-filter: blur(13px);
}

.edit-modal {
  width: min(680px, calc(100vw - 36px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: #141713;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  box-shadow: 0 40px 120px rgb(0 0 0 / 60%);
}

.edit-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 26px 17px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.edit-header h2 {
  margin-top: 7px;
  color: var(--text-bright);
  font-family: var(--font-display);
  font-size: 25px;
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
}

.modal-close:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.edit-body {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 26px;
  padding: 24px 26px;
}

.cover-column {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cover-column :deep(.cover-art) {
  width: 100%;
}

.cover-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 13px;
  color: var(--muted);
  font-size: 10px;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  transition: all 160ms ease;
}

.cover-action:hover {
  color: var(--text);
  border-color: var(--line-strong);
}

.cover-note {
  margin-top: 9px;
  color: var(--faint);
  font-size: 8px;
  text-align: center;
}

.form-column {
  display: flex;
  flex-direction: column;
  gap: 13px;
  min-width: 0;
}

.formal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.formal-field > span {
  color: var(--faint);
  font-size: 9.5px;
  letter-spacing: 0.02em;
}

.formal-field small {
  color: var(--faint);
  font-size: 8px;
}

.formal-field input {
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgb(255 255 255 / 2%);
  color: var(--text);
  outline: 0;
  font-size: 12px;
  transition: border-color 160ms ease;
}

.formal-field input:focus {
  border-color: rgb(200 245 106 / 25%);
}

.track-facts {
  display: grid;
  grid-template-columns: 1.4fr 0.7fr 0.8fr;
  gap: 10px;
  margin-top: 5px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}

.track-facts > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.track-facts span {
  color: var(--faint);
  font-size: 8px;
  font-family: var(--font-mono);
}

.track-facts strong {
  color: var(--muted);
  font-size: 9.5px;
  font-weight: 480;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-facts strong.accent {
  color: rgb(200 245 106 / 70%);
}

.edit-note {
  color: var(--faint);
  font-size: 8.5px;
  line-height: 1.6;
  margin-top: 2px;
}

.form-error {
  color: #ff9378;
  font-size: 9.5px;
}

.edit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 26px;
  border-top: 1px solid var(--line);
}

.danger-zone {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.remove-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--faint);
  font-size: 9px;
  text-align: left;
  transition: color 160ms ease;
  align-self: flex-start;
}

.remove-button:hover {
  color: #ff9378;
}

.remove-button.confirming {
  color: #ff9378;
}

.danger-zone > span {
  color: var(--faint);
  font-size: 7.5px;
  opacity: 0.7;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 620px) {
  .edit-body {
    grid-template-columns: 1fr;
  }
  .cover-column :deep(.cover-art) {
    width: 130px;
  }
  .edit-footer {
    align-items: flex-start;
    flex-direction: column-reverse;
  }
  .footer-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
