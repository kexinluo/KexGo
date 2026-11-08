<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  ArrowLeft,
  AudioLines,
  Captions,
  Check,
  ChevronRight,
  Clock,
  Disc3,
  Download,
  Ellipsis,
  FileText,
  FolderOpen,
  GripVertical,
  Globe,
  Image,
  Keyboard,
  ListFilter,
  ListMusic,
  Monitor,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat1,
  Repeat2,
  RotateCcw,
  Save,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tag,
  Target,
  Trash,
  TriangleExclamationPoint,
  Undo2,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
  X
} from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    strokeWidth?: number
    filled?: boolean
  }>(),
  { size: 20, strokeWidth: 1.8, filled: false }
)

const icons: Record<string, Component> = {
  play: Play,
  pause: Pause,
  previous: SkipBack,
  next: SkipForward,
  plus: Plus,
  folder: FolderOpen,
  music: AudioLines,
  search: Search,
  volume: Volume2,
  'volume-low': Volume1,
  'volume-mute': VolumeX,
  align: Captions,
  more: Ellipsis,
  sparkles: Sparkles,
  download: Download,
  edit: Pencil,
  image: Image,
  'file-text': FileText,
  'arrow-left': ArrowLeft,
  close: X,
  undo: Undo2,
  save: Save,
  rewind: RotateCcw,
  globe: Globe,
  check: Check,
  keyboard: Keyboard,
  refresh: RefreshCw,
  trash: Trash,
  chevron: ChevronRight,
  disc: Disc3,
  clock: Clock,
  tune: SlidersHorizontal,
  target: Target,
  loop: Repeat2,
  repeat: Repeat2,
  'repeat-one': Repeat1,
  shuffle: Shuffle,
  queue: ListMusic,
  grip: GripVertical,
  filter: ListFilter,
  upload: Upload,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  settings: SlidersHorizontal,
  tag: Tag,
  'alert-triangle': TriangleExclamationPoint
}

const icon = computed(() => icons[props.name] ?? AudioLines)
const looksFilled = computed(() => props.filled || props.name === 'play' || props.name === 'pause')
</script>

<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="strokeWidth"
    :fill="looksFilled ? 'currentColor' : 'none'"
    aria-hidden="true"
    class="app-icon"
  />
</template>

<style scoped>
.app-icon {
  display: block;
  flex: 0 0 auto;
  overflow: visible;
}
</style>
