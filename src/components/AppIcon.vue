<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    strokeWidth?: number
    filled?: boolean
  }>(),
  { size: 20, strokeWidth: 1.8, filled: false }
)

const paths: Record<string, string[]> = {
  play: ['M8 5.4v13.2L19 12 8 5.4Z'],
  pause: ['M8 5.5h3.2v13H8zM12.8 5.5H16v13h-3.2z'],
  previous: ['M19 5.5v13L9 12l10-6.5Z', 'M5.5 5.5v13'],
  next: ['M5 5.5v13L15 12 5 5.5Z', 'M18.5 5.5v13'],
  plus: ['M12 5v14', 'M5 12h14'],
  folder: [
    'M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z'
  ],
  music: ['M9 18V6.5l10-2v10.8', 'M9 18a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0Z', 'M19 15.3a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0Z'],
  search: ['M10.8 18.2a7.4 7.4 0 1 1 0-14.8 7.4 7.4 0 0 1 0 14.8Z', 'm16.2 16.2 4 4'],
  volume: [
    'M4 9.5h3.2L12 5.8v12.4l-4.8-3.7H4v-5Z',
    'M15.2 9.2a4 4 0 0 1 0 5.6',
    'M17.8 6.8a7.3 7.3 0 0 1 0 10.4'
  ],
  'volume-low': ['M4 9.5h3.2L12 5.8v12.4l-4.8-3.7H4v-5Z', 'M15.2 9.2a4 4 0 0 1 0 5.6'],
  'volume-mute': ['M4 9.5h3.2L12 5.8v12.4l-4.8-3.7H4v-5Z', 'm16 9 5 5', 'm21 9-5 5'],
  align: [
    'M4 6h7',
    'M4 12h4',
    'M4 18h9',
    'M17 4v16',
    'M14.8 7.2 17 5l2.2 2.2',
    'M14.8 16.8 17 19l2.2-2.2'
  ],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  sparkles: [
    'M12 3.5 13.5 8l4.5 1.5L13.5 11 12 15.5 10.5 11 6 9.5 10.5 8 12 3.5Z',
    'M18.5 15.5 19.3 18l2.2.8-2.2.7-.8 2.5-.8-2.5-2.2-.7 2.2-.8.8-2.5Z',
    'M5 15l.6 1.9L7.5 17.5 5.6 18 5 20l-.6-1.9-1.9-.6 1.9-.6L5 15Z'
  ],
  download: ['M12 4v11', 'm7.5 11 4.5 4.5 4.5-4.5', 'M5 20h14'],
  edit: ['M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z', 'm13.4 6.4 4.2 4.2'],
  image: ['M4 5.5h16v13H4z', 'm4 15 4.5-4.2 4.2 3.8 2.5-2.2 4.8 4', 'M15.8 9.5h.01'],
  'file-text': ['M6 3.5h8l4 4v13H6z', 'M14 3.5v4h4', 'M9 12h6', 'M9 16h4'],
  'arrow-left': ['m14.5 5-7 7 7 7'],
  close: ['m6 6 12 12', 'm18 6-12 12'],
  undo: ['M9 8 4.5 12.5 9 17', 'M4.5 12.5H14a5 5 0 0 1 0 10h-1'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v6h8V4', 'M8 20v-6h8v6'],
  rewind: ['M4 5v14', 'M20 6 8 12l12 6V6Z'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3.5 12h17', 'M12 3.2c2.3 2.4 3.4 5.4 3.4 8.8S14.3 18.4 12 20.8C9.7 18.4 8.6 15.4 8.6 12S9.7 5.6 12 3.2Z'],
  check: ['m5 12.5 4.2 4.2L19 7'],
  keyboard: ['M3.5 6.5h17v11h-17z', 'M7 10h.01', 'M11 10h.01', 'M15 10h.01', 'M7.5 14h9'],
  refresh: ['M20 11a8 8 0 1 0-2.2 6.5', 'M20 5.5V11h-5.5'],
  trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l.8 13h9.4l.8-13', 'M10 11v5', 'M14 11v5'],
  chevron: ['m9 5 7 7-7 7'],
  disc: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 14.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5.2l3.2 2'],
  tune: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10', 'M16 4.5v5', 'M8 14.5v5'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z'],
  loop: ['M4 8.5h13.5', 'm14.5 5.5 3 3-3 3', 'M20 15.5H6.5', 'm9.5 12.5-3 3 3 3']
}

const iconPaths = computed(() => paths[props.name] ?? paths.music)
const isFilled = computed(
  () => props.filled || props.name === 'play' || props.name === 'pause' || props.name === 'previous' || props.name === 'next' || props.name === 'rewind'
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="isFilled && (name === 'play' || name === 'previous' || name === 'next' || name === 'rewind') ? 'none' : 'currentColor'"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="app-icon"
  >
    <path v-for="(path, index) in iconPaths" :key="index" :d="path" :fill="isFilled && (name === 'play' || name === 'pause' || name === 'previous' || name === 'next' || name === 'rewind') ? 'currentColor' : 'none'" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
  overflow: visible;
}
</style>
