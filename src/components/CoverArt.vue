<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    title?: string
    artist?: string
    alt?: string
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero'
    glow?: boolean
  }>(),
  { src: null, title: '', artist: '', alt: '', size: 'md', glow: false }
)

const initials = computed(() => {
  const title = props.title.trim()
  if (!title) return 'K'
  const first = Array.from(title)[0] ?? 'K'
  return first.toUpperCase()
})

const gradient = computed(() => {
  const source = `${props.title}${props.artist}`
  let hash = 0
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) % 360
  return `linear-gradient(145deg, hsl(${hash} 30% 32%), hsl(${(hash + 38) % 360} 38% 15%))`
})
</script>

<template>
  <div class="cover-art" :class="[`cover-${size}`, { 'cover-glow': glow }]">
    <img v-if="src" :src="src" :alt="alt || `${title} 封面`" loading="lazy" draggable="false" />
    <div v-else class="cover-fallback" :style="{ background: gradient }">
      <span class="cover-initial">{{ initials }}</span>
      <span class="cover-grooves" aria-hidden="true"></span>
      <AppIcon name="music" :size="size === 'xs' ? 13 : 18" class="cover-note" />
    </div>
    <span v-if="glow" class="cover-sheen" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.cover-art {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 12px;
  background: #22251f;
  box-shadow: 0 8px 22px rgb(0 0 0 / 22%);
  isolation: isolate;
}

.cover-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-xs {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}
.cover-sm {
  width: 44px;
  height: 44px;
  border-radius: 10px;
}
.cover-md {
  width: 64px;
  height: 64px;
}
.cover-lg {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
}
.cover-hero {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 20px;
}

.cover-fallback {
  position: relative;
  height: 100%;
  width: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.cover-initial {
  font-size: clamp(20px, 4vw, 66px);
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.06em;
  color: rgb(255 255 255 / 70%);
  z-index: 2;
  transform: translateY(-4%);
}

.cover-xs .cover-initial {
  font-size: 14px;
}
.cover-sm .cover-initial {
  font-size: 17px;
}
.cover-md .cover-initial {
  font-size: 22px;
}

.cover-grooves {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background: repeating-radial-gradient(
    circle at center,
    transparent 0,
    transparent 7px,
    rgb(255 255 255 / 5%) 8px,
    transparent 9px
  );
  opacity: 0.85;
}

.cover-note {
  position: absolute;
  right: 9%;
  bottom: 9%;
  opacity: 0.5;
}

.cover-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(155deg, rgb(255 255 255 / 17%), transparent 33%, transparent 67%, rgb(0 0 0 / 22%));
  pointer-events: none;
}

.cover-glow {
  box-shadow:
    0 30px 70px rgb(0 0 0 / 55%),
    0 0 0 1px rgb(255 255 255 / 7%),
    0 36px 90px -30px rgb(200 245 106 / 10%);
}
</style>
