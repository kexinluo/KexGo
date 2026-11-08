<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useApp } from '../stores/app'
import AppIcon from './AppIcon.vue'

const { state, closeImportIssues } = useApp()

const hasUnsupported = computed(() =>
  state.importIssues.some(
    (issue) => issue.reason.includes('fragmented MP4') || issue.reason.includes('分片 MP4')
  )
)

const title = computed(() => {
  if (state.importIssues.length === 1) {
    return hasUnsupported.value ? '此文件暂不支持' : '文件未能导入'
  }
  return '有文件未能导入'
})

const lead = computed(() => {
  if (hasUnsupported.value) {
    return '检测到分片 MP4（fragmented MP4）音频。当前版本会明确拒绝这类文件，不会进入解码和播放流程，因此不会触发闪退。'
  }
  return '下面这些文件没有加入曲库，旁边是对应的原因。'
})

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeImportIssues()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div class="modal-backdrop" @mousedown.self="closeImportIssues">
        <section
          class="issues-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="import-issues-title"
          aria-describedby="import-issues-lead"
        >
          <header class="issues-header">
            <div class="issues-title-wrap">
              <span class="issues-mark"><AppIcon name="file-text" :size="22" /></span>
              <div>
                <span class="eyebrow">IMPORT CHECK</span>
                <h2 id="import-issues-title">{{ title }}</h2>
              </div>
            </div>
            <button class="modal-close" aria-label="关闭" @click="closeImportIssues">
              <AppIcon name="close" :size="17" />
            </button>
          </header>

          <div class="issues-body">
            <p id="import-issues-lead" class="issues-lead">{{ lead }}</p>

            <div class="issue-list">
              <article v-for="issue in state.importIssues" :key="`${issue.path}-${issue.reason}`" class="issue-row">
                <span class="issue-icon"><AppIcon name="music" :size="15" /></span>
                <div class="issue-copy">
                  <strong :title="issue.path">{{ fileName(issue.path) }}</strong>
                  <p>{{ issue.reason }}</p>
                </div>
              </article>
            </div>

            <div v-if="hasUnsupported" class="action-card">
              <span class="action-icon"><AppIcon name="refresh" :size="15" /></span>
              <div>
                <strong>可以这样处理</strong>
                <p>先用播放器或格式转换工具把它转换为普通 M4A（AAC）或 MP3，再拖回 KexGo。原文件不会被修改或上传。</p>
              </div>
            </div>
          </div>

          <footer class="issues-footer">
            <span>已安全阻止解码，应用不会闪退。</span>
            <button class="primary-button" @click="closeImportIssues">知道了</button>
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
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--overlay-bg);
  backdrop-filter: blur(13px);
}

.issues-modal {
  width: min(600px, calc(100vw - 36px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--panel-bg);
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  box-shadow: 0 40px 120px rgb(0 0 0 / 60%);
}

.issues-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 23px 25px 18px;
  border-bottom: 1px solid var(--line);
}

.issues-title-wrap {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.issues-mark {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  border: 1px solid rgb(233 201 134 / 21%);
  border-radius: 10px;
  color: var(--sand);
  background: rgb(233 201 134 / 6%);
}

.eyebrow {
  color: var(--sand);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.issues-header h2 {
  margin-top: 7px;
  color: var(--text-bright);
  font-family: var(--font-display);
  font-size: 23px;
  font-weight: 540;
  letter-spacing: -0.04em;
}

.modal-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
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

.issues-body {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 25px;
}

.issues-lead {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.8;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 15px;
}

.issue-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgb(255 255 255 / 2%);
}

.issue-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 7px;
  color: var(--muted);
  background: rgb(255 255 255 / 3%);
}

.issue-copy {
  min-width: 0;
  flex: 1;
}

.issue-copy strong {
  display: block;
  color: var(--text);
  font-size: 10.5px;
  font-weight: 560;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.issue-copy p {
  margin-top: 4px;
  color: var(--faint);
  font-size: 9px;
  line-height: 1.65;
}

.action-card {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 15px;
  padding: 12px;
  border: 1px solid rgb(200 245 106 / 11%);
  border-radius: 9px;
  background: rgb(200 245 106 / 3.5%);
}

.action-icon {
  color: var(--accent-text);
  margin-top: 1px;
}

.action-card strong {
  color: var(--text);
  font-size: 10px;
  font-weight: 540;
}

.action-card p {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.65;
}

.issues-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 25px;
  border-top: 1px solid var(--line);
}

.issues-footer > span {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  line-height: 1.5;
}

.issues-footer .primary-button {
  height: 32px;
  min-width: 76px;
  font-size: 10px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 200ms ease;
}

.modal-enter-active .issues-modal,
.modal-leave-active .issues-modal {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .issues-modal,
.modal-leave-to .issues-modal {
  opacity: 0;
  transform: translateY(8px) scale(0.985);
}
</style>
