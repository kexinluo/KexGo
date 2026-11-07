<script setup lang="ts">
import { useApp } from '../stores/app'
import AppIcon from './AppIcon.vue'

const { state, dismissToast } = useApp()

const icons: Record<string, string> = {
  success: 'check',
  error: 'close',
  warning: 'clock',
  info: 'sparkles'
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="message in state.toasts" :key="message.id" class="toast" :class="`toast-${message.kind}`">
          <span class="toast-icon">
            <AppIcon :name="icons[message.kind] || 'sparkles'" :size="15" :stroke-width="2" />
          </span>
          <div class="toast-copy">
            <strong>{{ message.title }}</strong>
            <span v-if="message.detail">{{ message.detail }}</span>
          </div>
          <button class="toast-close" aria-label="关闭提示" @click="dismissToast(message.id)">
            <AppIcon name="close" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: 200;
  right: 24px;
  bottom: 112px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: min(390px, calc(100vw - 48px));
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px 12px 13px 13px;
  color: var(--text);
  background: rgb(27 30 26 / 96%);
  border: 1px solid var(--line-strong);
  box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
  border-radius: 13px;
  backdrop-filter: blur(18px);
}

.toast-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}

.toast-success .toast-icon {
  color: var(--accent);
}
.toast-error .toast-icon {
  color: #ff9378;
  background: rgb(255 112 80 / 11%);
}
.toast-warning .toast-icon {
  color: var(--sand);
  background: rgb(238 200 130 / 9%);
}

.toast-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
}

.toast-copy strong {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.toast-copy span {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--muted);
}

.toast-close {
  color: var(--faint);
  padding: 4px;
  border-radius: 6px;
  transition: color 160ms ease, background 160ms ease;
}

.toast-close:hover {
  color: var(--text);
  background: rgb(255 255 255 / 6%);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
