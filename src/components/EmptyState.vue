<script setup lang="ts">
import { useApp } from '../stores/app'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ (event: 'import'): void }>()
const { isBrowser } = useApp()
</script>

<template>
  <section class="empty-state">
    <div class="empty-visual" aria-hidden="true">
      <span class="orbit orbit-a"></span>
      <span class="orbit orbit-b"></span>
      <span class="orbit orbit-c"></span>
      <div class="empty-disc">
        <span class="disc-label">KEX</span>
        <span class="disc-hole"></span>
      </div>
      <span class="floating-note note-a"><AppIcon name="music" :size="14" /></span>
      <span class="floating-note note-b"><AppIcon name="sparkles" :size="12" /></span>
    </div>

    <div class="empty-content">
      <span class="eyebrow">YOUR MUSIC, UNHURRIED</span>
      <h1>把喜欢的歌，<br /><em>安静地放起来。</em></h1>
      <p class="empty-lede">
        拖入本地音频文件，KexGo 会自动寻找同名歌词和封面。<br />
        没有歌词也没关系，跟着唱一遍就能完成对轴。
      </p>

      <div class="empty-actions">
        <button class="primary-button large" @click="emit('import')">
          <AppIcon name="folder" :size="16" />
          选择音乐文件
        </button>
        <span class="drag-hint"><kbd>或</kbd> 直接拖进来</span>
      </div>

      <div class="feature-notes">
        <span><i>01</i> 本地播放</span>
        <span><i>02</i> 自动配词</span>
        <span><i>03</i> 五分钟对轴</span>
      </div>

      <p v-if="isBrowser" class="preview-note">
        当前为浏览器预览模式。桌面版支持原生文件拖放、内嵌封面读取与本地音频输出。
      </p>
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.1fr);
  align-items: center;
  gap: 47px;
  max-width: 980px;
  margin: 0 auto;
  padding: 44px 64px;
  width: 100%;
  min-height: 0;
}

.empty-visual {
  position: relative;
  aspect-ratio: 1;
  max-width: 360px;
  width: 100%;
  justify-self: center;
  display: grid;
  place-items: center;
}

.orbit {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgb(255 255 255 / 5%);
}

.orbit-a {
  inset: 1%;
}
.orbit-b {
  inset: 10%;
  border-style: dashed;
  border-color: rgb(200 245 106 / 8%);
  animation: orbit-spin 46s linear infinite;
}
.orbit-c {
  inset: 20%;
}

.empty-disc {
  position: relative;
  width: 63%;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, #262b22 0 10%, transparent 10.5%),
    repeating-radial-gradient(circle at 50% 50%, #0d0f0c 0 3px, #161914 4px 5px),
    #11130f;
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow:
    0 30px 70px rgb(0 0 0 / 55%),
    inset 0 0 0 1px rgb(255 255 255 / 2%);
  animation: vinyl-turn 52s linear infinite;
  display: grid;
  place-items: center;
}

.empty-disc::after {
  content: '';
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  border: 1px solid rgb(255 255 255 / 5%);
}

.disc-label {
  position: absolute;
  width: 28%;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: clamp(7px, 1vw, 10px);
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #191d13;
  background: var(--accent);
  box-shadow: 0 0 35px rgb(200 245 106 / 14%);
}

.disc-hole {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #11130f;
}

.floating-note {
  position: absolute;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: var(--muted);
  border: 1px solid var(--line);
  background: rgb(24 27 22 / 70%);
  backdrop-filter: blur(7px);
}

.note-a {
  right: 9%;
  top: 17%;
  transform: rotate(8deg);
}

.note-b {
  left: 7%;
  bottom: 19%;
  color: var(--accent);
  transform: rotate(-7deg);
  width: 27px;
  height: 27px;
}

@keyframes vinyl-turn {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes orbit-spin {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

.empty-content {
  max-width: 430px;
}

.eyebrow {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.empty-content h1 {
  margin-top: 18px;
  color: var(--text-bright);
  font-family: var(--font-display);
  font-size: clamp(34px, 3.7vw, 50px);
  line-height: 1.17;
  letter-spacing: -0.055em;
  font-weight: 520;
}

.empty-content h1 em {
  color: var(--muted);
  font-style: normal;
}

.empty-lede {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.9;
  margin-top: 22px;
  letter-spacing: 0.005em;
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 30px;
}

.primary-button.large {
  height: 43px;
  padding: 0 17px;
  font-size: 12px;
  border-radius: 10px;
}

.drag-hint {
  color: var(--faint);
  font-size: 10px;
  white-space: nowrap;
}

.drag-hint kbd {
  padding: 2px 5px;
  margin-right: 3px;
  border: 1px solid var(--line);
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: 9px;
}

.feature-notes {
  display: flex;
  gap: 21px;
  margin-top: 37px;
  padding-top: 19px;
  border-top: 1px solid var(--line);
}

.feature-notes span {
  color: var(--faint);
  font-size: 9.5px;
  letter-spacing: 0.01em;
}

.feature-notes i {
  color: rgb(200 245 106 / 42%);
  font-family: var(--font-mono);
  font-size: 7.5px;
  font-style: normal;
  margin-right: 4px;
}

.preview-note {
  margin-top: 19px;
  color: var(--faint);
  font-size: 8.5px;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .empty-state {
    grid-template-columns: 0.85fr 1.15fr;
    gap: 24px;
    padding: 32px 40px;
  }
}

@media (max-width: 880px) {
  .empty-state {
    grid-template-columns: 1fr;
    padding: 28px;
    overflow-y: auto;
    justify-items: center;
    text-align: center;
  }
  .empty-visual {
    max-width: 220px;
  }
  .empty-content {
    max-width: 470px;
  }
  .empty-actions {
    justify-content: center;
  }
  .feature-notes {
    justify-content: center;
  }
}
</style>
