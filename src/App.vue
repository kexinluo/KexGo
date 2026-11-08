<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from './api'
import { useApp } from './stores/app'
import { shortcutMatches } from './utils/shortcuts'
import AlignView from './components/AlignView.vue'
import AppIcon from './components/AppIcon.vue'
import EmptyState from './components/EmptyState.vue'
import ImportIssuesModal from './components/ImportIssuesModal.vue'
import LibrarySidebar from './components/LibrarySidebar.vue'
import LyricsPane from './components/LyricsPane.vue'
import LyricsNotesModal from './components/LyricsNotesModal.vue'
import LyricsSearchModal from './components/LyricsSearchModal.vue'
import NowPlaying from './components/NowPlaying.vue'
import PlayerBar from './components/PlayerBar.vue'
import QueueDrawer from './components/QueueDrawer.vue'
import SettingsModal from './components/SettingsModal.vue'
import ToastStack from './components/ToastStack.vue'
import TrackEditModal from './components/TrackEditModal.vue'

const {
  state,
  currentTrack,
  init,
  chooseAudio,
  importPaths,
  importBrowserFiles,
  closeLyricsModal,
  closeEditModal,
  loadCover,
  toast,
  openSettings,
  togglePlay,
  step,
  adjustVolume,
  seekBy,
  toggleSpeed,
  beginSpeedHold,
  endSpeedHold,
  nudgeSpeed
} = useApp()

const sidebarRef = ref<InstanceType<typeof LibrarySidebar> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dropDepth = ref(0)
let dropUnlisten: (() => void) | null = null
let closeUnlisten: (() => void) | null = null
let trayUnlisten: (() => void) | null = null
let minimizeUnlisten: (() => void) | null = null

const isOverlayOpen = computed(() => state.activeView === 'align')
const importLabel = computed(() => (state.importBusy ? '正在导入…' : '导入歌曲'))

async function handleImport(): Promise<void> {
  if (state.importBusy) return
  if (api.isTauri) {
    await chooseAudio()
    return
  }
  fileInput.value?.click()
}

async function onBrowserFiles(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  target.value = ''
  if (files.length) await importBrowserFiles(files)
}

function dragEnter(event: DragEvent): void {
  if (api.isTauri) return
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dropDepth.value += 1
  state.dragActive = true
}

function dragOver(event: DragEvent): void {
  if (api.isTauri) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function dragLeave(event: DragEvent): void {
  if (api.isTauri) return
  event.preventDefault()
  dropDepth.value = Math.max(0, dropDepth.value - 1)
  if (dropDepth.value === 0) state.dragActive = false
}

async function dropFiles(event: DragEvent): Promise<void> {
  if (api.isTauri) return
  event.preventDefault()
  dropDepth.value = 0
  state.dragActive = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length) await importBrowserFiles(files)
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const isEditable =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  if (
    isEditable ||
    state.activeView === 'align' ||
    state.lyricsModalOpen ||
    state.editModalOpen ||
    state.importIssuesOpen ||
    state.queueOpen ||
    state.settingsOpen ||
    state.lyricsNotesOpen
  ) {
    return
  }
  const shortcuts = state.preferences.shortcuts

  if (shortcutMatches(event, shortcuts.playPause)) {
    event.preventDefault()
    if (!event.repeat) void togglePlay()
    return
  }
  if (event.repeat) return
  if (shortcutMatches(event, shortcuts.previous)) {
    event.preventDefault()
    void step(-1)
    return
  }
  if (shortcutMatches(event, shortcuts.next)) {
    event.preventDefault()
    void step(1)
    return
  }
  if (shortcutMatches(event, shortcuts.volumeUp)) {
    event.preventDefault()
    adjustVolume(0.05)
    return
  }
  if (shortcutMatches(event, shortcuts.volumeDown)) {
    event.preventDefault()
    adjustVolume(-0.05)
    return
  }
  if (shortcutMatches(event, shortcuts.seekBack5)) {
    event.preventDefault()
    seekBy(-5)
    return
  }
  if (shortcutMatches(event, shortcuts.seekForward5)) {
    event.preventDefault()
    seekBy(5)
    return
  }
  if (shortcutMatches(event, shortcuts.seekBack10)) {
    event.preventDefault()
    seekBy(-10)
    return
  }
  if (shortcutMatches(event, shortcuts.seekForward10)) {
    event.preventDefault()
    seekBy(10)
    return
  }
  if (shortcutMatches(event, shortcuts.speedHold)) {
    event.preventDefault()
    beginSpeedHold()
    return
  }
  if (shortcutMatches(event, shortcuts.speedToggle)) {
    event.preventDefault()
    toggleSpeed()
    return
  }
  if (shortcutMatches(event, shortcuts.speedUp)) {
    event.preventDefault()
    nudgeSpeed(0.25)
    return
  }
  if (shortcutMatches(event, shortcuts.speedDown)) {
    event.preventDefault()
    nudgeSpeed(-0.25)
    return
  }

  if (event.key === '/') {
    event.preventDefault()
    sidebarRef.value?.focusSearch()
  }
}

function onGlobalKeyup(event: KeyboardEvent): void {
  if (shortcutMatches(event, state.preferences.shortcuts.speedHold)) endSpeedHold()
}

function onNativeDrop(paths: string[]): void {
  void importPaths(paths)
}

onMounted(async () => {
  await init()
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('keyup', onGlobalKeyup)
  if (api.isTauri) {
    dropUnlisten = await api.onFileDrop(onNativeDrop)
    closeUnlisten = await api.onCloseRequested(() => state.closeToTray)
    minimizeUnlisten = await api.onMinimized(() => state.closeToTray)
    trayUnlisten = await api.onTrayAction((action) => {
      if (action === 'play-pause') void togglePlay()
      if (action === 'previous') void step(-1)
      if (action === 'next') void step(1)
    })
  }
  if (currentTrack.value) {
    void loadCover(currentTrack.value)
    document.title = `KexGo — ${currentTrack.value.title}`
  }
})

watch(
  () => currentTrack.value?.title,
  (title) => {
    document.title = title ? `KexGo — ${title}` : 'KexGo'
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('keyup', onGlobalKeyup)
  dropUnlisten?.()
  closeUnlisten?.()
  minimizeUnlisten?.()
  trayUnlisten?.()
})
</script>

<template>
  <div
    class="app-shell"
    @dragenter="dragEnter"
    @dragover="dragOver"
    @dragleave="dragLeave"
    @drop="dropFiles"
  >
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">
          <span class="brand-letter">K</span>
        </span>
        <div class="brand-words">
          <span class="brand-name">KexGo</span>
          <span class="brand-sub">LOCAL PLAYER</span>
        </div>
      </div>

      <div class="topbar-center">
        <span class="topbar-status"><i></i> 本地曲库</span>
        <span class="topbar-separator"></span>
        <span class="topbar-note">不联网也能听，有网就去找词。</span>
      </div>

      <div class="topbar-actions">
        <span v-if="!api.isTauri" class="preview-badge">浏览器预览</span>
        <button class="settings-button" aria-label="设置" title="设置" @click="openSettings">
          <AppIcon name="settings" :size="16" />
        </button>
        <button class="import-button" :disabled="state.importBusy" @click="handleImport">
          <span v-if="state.importBusy" class="top-spinner"></span>
          <AppIcon v-else name="plus" :size="15" :stroke-width="2" />
          {{ importLabel }}
          <kbd>拖入</kbd>
        </button>
      </div>
    </header>

    <div class="app-body">
      <LibrarySidebar
        v-if="state.preferences.layout.showSidebar"
        ref="sidebarRef"
        @import="handleImport"
      />

      <main class="main-area">
        <div
          v-if="currentTrack"
          class="player-layout"
          :class="{ solo: !state.preferences.layout.showLyrics }"
        >
          <NowPlaying />
          <LyricsPane v-if="state.preferences.layout.showLyrics" />
        </div>
        <EmptyState v-else @import="handleImport" />
      </main>
    </div>

    <PlayerBar v-if="currentTrack" />

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept="audio/*,.mp3,.flac,.m4a,.aac,.wav,.ogg,.lrc,.jpg,.jpeg,.png,.webp"
      multiple
      tabindex="-1"
      @change="onBrowserFiles"
    />

    <Transition name="drop">
      <div v-if="state.dragActive" class="drop-layer">
        <div class="drop-card">
          <span class="drop-icon"><AppIcon name="folder" :size="28" /></span>
          <h2>松手，加入 KexGo</h2>
          <p>支持多选。同名 LRC 与封面会自动跟着歌曲一起进来。</p>
          <span class="drop-formats">MP3 / FLAC / M4A / WAV</span>
        </div>
      </div>
    </Transition>

    <Transition name="boot">
      <div v-if="state.booting" class="boot-screen">
        <div class="boot-brand">
          <span class="boot-mark">K</span>
          <span>KexGo</span>
        </div>
        <span class="boot-line"></span>
      </div>
    </Transition>

    <LyricsSearchModal v-if="state.lyricsModalOpen" @close="closeLyricsModal" />
    <LyricsNotesModal v-if="state.lyricsNotesOpen" />
    <TrackEditModal v-if="state.editModalOpen" @close="closeEditModal" />
    <ImportIssuesModal v-if="state.importIssuesOpen" />
    <QueueDrawer v-if="state.queueOpen" />
    <SettingsModal v-if="state.settingsOpen" />
    <AlignView v-if="isOverlayOpen && currentTrack" />
    <ToastStack />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 74% -4%, rgb(200 245 106 / 5.5%), transparent 36%),
    radial-gradient(ellipse at 12% 105%, rgb(238 200 130 / 2.5%), transparent 32%),
    var(--app-bg);
}

.app-shell::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.16;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.17'/%3E%3C/svg%3E");
}

.topbar {
  position: relative;
  z-index: 10;
  flex: 0 0 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 0 27px;
  border-bottom: 1px solid var(--line);
  background: var(--topbar-bg);
  backdrop-filter: blur(18px);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.brand-mark {
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--on-accent);
  background: var(--accent);
  box-shadow: 0 4px 20px rgb(200 245 106 / 12%);
}

.brand-letter {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.08em;
  line-height: 1;
  transform: translateX(-1px);
}

.brand-words {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 620;
  letter-spacing: -0.055em;
  color: var(--text-bright);
  line-height: 1;
}

.brand-sub {
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 6.5px;
  letter-spacing: 0.15em;
  line-height: 1;
}

.topbar-center {
  display: flex;
  align-items: center;
  gap: 11px;
  justify-content: center;
  min-width: 0;
}

.topbar-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 9.5px;
  white-space: nowrap;
}

.topbar-status i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 7px rgb(200 245 106 / 45%);
}

.topbar-separator {
  width: 1px;
  height: 11px;
  background: var(--line-strong);
}

.topbar-note {
  color: var(--faint);
  font-size: 9.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.preview-badge {
  padding: 4px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.03em;
}

.settings-button {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  color: var(--muted);
  border: 1px solid transparent;
  border-radius: 7px;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.settings-button:hover {
  color: var(--text);
  border-color: var(--line);
  background: var(--surface-soft);
}

.import-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 33px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text);
  border: 1px solid var(--line-strong);
  background: var(--surface-soft);
  font-size: 10.5px;
  transition: all 160ms ease;
  white-space: nowrap;
}

.import-button:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--line-strong);
}

.import-button:disabled {
  opacity: 0.6;
}

.import-button kbd {
  margin-left: 3px;
  padding: 2px 4px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 6.5px;
  font-weight: 400;
}

.top-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
  border-top-color: var(--accent-text);
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.app-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
}

.main-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.player-layout {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 0.76fr) minmax(420px, 1.24fr);
  gap: clamp(28px, 3.4vw, 54px);
  padding: clamp(24px, 3vw, 38px) clamp(28px, 3.6vw, 52px) 26px;
}

.player-layout.solo {
  grid-template-columns: minmax(280px, 520px);
  justify-content: start;
}

.player-layout > :first-child {
  padding-right: 4px;
}

.visually-hidden {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  left: -100px;
}

.drop-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  background: var(--overlay-bg);
  backdrop-filter: blur(12px);
}

.drop-card {
  width: min(440px, calc(100vw - 48px));
  padding: 44px 34px 37px;
  border-radius: 20px;
  border: 1px dashed rgb(200 245 106 / 33%);
  background: var(--drop-card-bg);
  text-align: center;
  box-shadow: 0 30px 100px rgb(0 0 0 / 50%);
}

.drop-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin: 0 auto 20px;
  border-radius: 17px;
  color: var(--accent-text);
  background: rgb(200 245 106 / 7%);
  border: 1px solid rgb(200 245 106 / 15%);
}

.drop-card h2 {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 520;
  letter-spacing: -0.045em;
  color: var(--text-bright);
}

.drop-card p {
  margin-top: 11px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}

.drop-formats {
  display: inline-block;
  margin-top: 22px;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.08em;
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 160ms ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
}

.boot-screen {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  background: var(--app-bg);
}

.boot-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-bright);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.05em;
}

.boot-mark {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--on-accent);
  background: var(--accent);
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
}

.boot-line {
  width: 80px;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--accent), transparent);
  animation: boot-pulse 1.1s ease-in-out infinite;
}

@keyframes boot-pulse {
  0%,
  100% {
    opacity: 0.25;
    transform: scaleX(0.55);
  }
  50% {
    opacity: 1;
    transform: scaleX(1);
  }
}

.boot-leave-active {
  transition: opacity 300ms ease;
}
.boot-leave-to {
  opacity: 0;
}

@media (max-width: 1180px) {
  .topbar-center {
    display: none;
  }
  .player-layout {
    gap: 26px;
    padding: 26px 28px 22px;
    grid-template-columns: minmax(235px, 0.7fr) minmax(380px, 1.3fr);
  }
}

@media (max-width: 900px) {
  .sidebar {
    display: none;
  }
  .topbar {
    padding: 0 17px;
  }
  .import-button kbd {
    display: none;
  }
  .player-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
    padding: 20px;
    gap: 23px;
  }
  .player-layout > :first-child {
    padding-right: 0;
  }
}
</style>
