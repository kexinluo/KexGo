<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useApp } from '../stores/app'
import type { ContextMenuAction, Track } from '../types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  track: Track
  source: 'library' | 'queue'
  x: number
  y: number
}>()

const emit = defineEmits<{ (event: 'close'): void }>()

const {
  state,
  currentTrack,
  selectTrack,
  openEditModal,
  addTracksToQueue,
  removeTrack,
  removeFromQueue,
  playQueueItem
} = useApp()

const ICONS: Record<ContextMenuAction, string> = {
  play: 'play',
  queue: 'queue',
  edit: 'edit',
  remove: 'trash'
}

const LABELS = computed<Record<ContextMenuAction, string>>(() => ({
  play: '播放',
  queue: '加入播放队列',
  edit: '编辑歌曲信息',
  remove: props.source === 'queue' ? '从队列移除' : '从曲库移除'
}))

const items = computed(() =>
  state.preferences.contextMenu.filter(
    (item) => item.visible && !(props.source === 'queue' && item.id === 'queue')
  )
)

const left = computed(() => Math.min(props.x, window.innerWidth - 190))
const top = computed(() => Math.min(props.y, window.innerHeight - (items.value.length * 32 + 24)))

function onOutside(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('pointerdown', onOutside)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onOutside)
  window.addEventListener('scroll', onOutside, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onOutside)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onOutside)
  window.removeEventListener('scroll', onOutside, true)
})

async function run(action: ContextMenuAction): Promise<void> {
  emit('close')
  if (action === 'play') {
    if (props.source === 'queue') await playQueueItem(props.track.id)
    else await selectTrack(props.track)
    return
  }
  if (action === 'queue') {
    addTracksToQueue([props.track.id], true)
    return
  }
  if (action === 'edit') {
    if (currentTrack.value?.id !== props.track.id) {
      await selectTrack(props.track, { autoplay: false })
    }
    openEditModal()
    return
  }
  if (action === 'remove') {
    if (props.source === 'queue') await removeFromQueue(props.track.id)
    else await removeTrack(props.track.id)
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="track-menu"
      role="menu"
      :style="{ left: `${left}px`, top: `${top}px` }"
      @pointerdown.stop
    >
      <button
        v-for="item in items"
        :key="item.id"
        class="track-menu-item"
        :class="{ danger: item.id === 'remove' }"
        role="menuitem"
        @click="run(item.id)"
      >
        <AppIcon :name="ICONS[item.id]" :size="13" />
        {{ LABELS[item.id] }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.track-menu {
  position: fixed;
  z-index: 120;
  width: 180px;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 18px 48px rgb(0 0 0 / 32%);
  animation: menu-in 110ms ease-out;
}

@keyframes menu-in {
  from { opacity: 0; transform: translateY(-3px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.track-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  color: var(--muted);
  border-radius: 5px;
  font-size: 9px;
  text-align: left;
}

.track-menu-item:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.track-menu-item.danger:hover {
  color: #e7a19a;
}
</style>
