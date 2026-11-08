<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApp } from '../stores/app'

const { state, resolvedTheme } = useApp()
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
let resizeObserver: ResizeObserver | null = null
let accent = '#c8f56a'
let line = 'rgba(255,255,255,0.12)'
let reduceMotion = false

function refreshPalette(): void {
  const styles = getComputedStyle(document.documentElement)
  accent = styles.getPropertyValue('--accent').trim() || accent
  line = styles.getPropertyValue('--line-strong').trim() || line
}

function resize(): void {
  const element = canvas.value
  if (!element) return
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, element.clientWidth)
  const height = Math.max(1, element.clientHeight)
  element.width = Math.round(width * ratio)
  element.height = Math.round(height * ratio)
  const context = element.getContext('2d')
  if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0)
  stop()
  draw(performance.now())
}

function draw(now: number): void {
  const element = canvas.value
  if (!element) return
  const context = element.getContext('2d')
  if (!context) return
  const width = element.clientWidth
  const height = element.clientHeight
  const ratio = window.devicePixelRatio || 1
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  context.fillStyle = line
  context.fillRect(0, height - 1, width, 1)

  const bars = Math.max(24, Math.min(46, Math.floor(width / 8)))
  const gap = 3
  const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars)
  const active = state.playing
  const level = active ? 0.45 + state.volume * 0.4 : 0.16
  const phase = reduceMotion ? 0.8 : now / 460

  for (let index = 0; index < bars; index += 1) {
    const wave =
      Math.sin(phase + index * 0.62) * 0.32 +
      Math.sin(phase * 1.7 + index * 0.19) * 0.26 +
      Math.cos(phase * 0.7 + index * 1.13) * 0.18
    const envelope = 0.4 + 0.6 * Math.sin((index / bars) * Math.PI)
    const amplitude = Math.max(0.06, Math.min(1, level + wave * envelope * 0.55))
    const barHeight = Math.max(2, amplitude * (height - 5))
    const x = index * (barWidth + gap)
    const alpha = active ? 0.32 + amplitude * 0.55 : 0.2
    context.globalAlpha = alpha
    context.fillStyle = accent
    context.beginPath()
    context.roundRect(x, height - 3 - barHeight, barWidth, barHeight, barWidth / 2)
    context.fill()
  }
  context.globalAlpha = 1

  if (!reduceMotion) frame = requestAnimationFrame(draw)
}

function stop(): void {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

watch(
  () => state.playing,
  () => {
    if (reduceMotion) draw(performance.now())
  }
)
watch(resolvedTheme, () => {
  refreshPalette()
  if (reduceMotion) draw(performance.now())
})

onMounted(() => {
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  refreshPalette()
  resizeObserver = new ResizeObserver(resize)
  if (canvas.value) resizeObserver.observe(canvas.value)
  window.addEventListener('resize', resize)
  resize()
  if (!reduceMotion) frame = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <div class="rhythm" aria-hidden="true">
    <div class="rhythm-heading">
      <span><i></i> RHYTHM</span>
      <small>{{ state.playing ? 'LIVE' : 'IDLE' }}</small>
    </div>
    <canvas ref="canvas" class="rhythm-canvas"></canvas>
  </div>
</template>

<style scoped>
.rhythm {
  width: 100%;
  max-width: 340px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.rhythm-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.14em;
}

.rhythm-heading > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.rhythm-heading i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px rgb(200 245 106 / 45%);
}

.rhythm-heading small {
  color: var(--faint);
  font-size: 6.5px;
  letter-spacing: 0.1em;
}

.rhythm-canvas {
  display: block;
  width: 100%;
  height: 34px;
  opacity: 0.9;
}
</style>
