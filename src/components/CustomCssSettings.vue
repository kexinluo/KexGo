<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApp } from '../stores/app'
import AppIcon from './AppIcon.vue'

const { state, saveCustomCss, setCustomCssEnabled } = useApp()
const draft = ref(state.customCssDraft)

watch(
  () => state.customCssDraft,
  (value) => {
    draft.value = value
  }
)

function save(): void {
  void saveCustomCss(draft.value)
}
</script>

<template>
  <div class="css-settings">
    <div class="css-heading">
      <div>
        <strong>自定义 CSS</strong>
        <span>保存后立即生效；直接编辑文件会在约 2 秒内热重载。</span>
      </div>
      <button
        class="switch small-switch"
        :class="{ on: state.preferences.customCssEnabled }"
        role="switch"
        :aria-checked="state.preferences.customCssEnabled"
        aria-label="启用自定义 CSS"
        @click="setCustomCssEnabled(!state.preferences.customCssEnabled)"
      >
        <span></span>
      </button>
    </div>
    <textarea
      v-model="draft"
      class="css-editor"
      spellcheck="false"
      placeholder="/* 例如：.track-title { letter-spacing: -0.05em; } */"
    ></textarea>
    <div class="css-footer">
      <span class="css-path" :title="state.dataLocation?.customCssPath || 'custom.css'">
        {{ state.dataLocation?.customCssPath || 'custom.css' }}
      </span>
      <button class="css-save" :disabled="state.customCssBusy" @click="save">
        <AppIcon name="save" :size="12" />
        {{ state.customCssBusy ? '保存中…' : '保存 CSS' }}
      </button>
    </div>
    <p v-if="state.customCssError" class="css-error">{{ state.customCssError }}</p>
    <p class="css-note">出错时保留最后可用版本；下一次改动仍可继续修正。</p>
  </div>
</template>

<style scoped>
.css-settings {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.css-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.css-heading > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.css-heading strong {
  color: var(--text);
  font-size: 10px;
  font-weight: 520;
}

.css-heading span {
  color: var(--faint);
  font-size: 8px;
  line-height: 1.55;
}

.switch {
  position: relative;
  width: 34px;
  height: 19px;
  flex: 0 0 auto;
  border-radius: 10px;
  background: var(--line-strong);
  transition: background 160ms ease;
}

.switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 160ms ease, background 160ms ease;
}

.switch.on {
  background: var(--accent);
}

.switch.on span {
  background: var(--on-accent);
  transform: translateX(15px);
}

.small-switch {
  width: 31px;
  height: 17px;
}

.small-switch span {
  width: 11px;
  height: 11px;
}

.small-switch.on span {
  transform: translateX(14px);
}

.css-editor {
  width: 100%;
  min-height: 164px;
  padding: 10px;
  resize: vertical;
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-soft);
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.6;
  outline: none;
}

.css-editor:focus {
  border-color: var(--line-strong);
}

.css-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.css-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
}

.css-save {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 26px;
  padding: 0 9px;
  color: var(--on-accent);
  background: var(--accent);
  border-radius: 5px;
  font-size: 8.5px;
}

.css-save:disabled {
  opacity: 0.5;
}

.css-error {
  margin: 0;
  color: #d87864;
  font-size: 8.5px;
}

.css-note {
  margin: 0;
  color: var(--faint);
  font-size: 8px;
}
</style>
