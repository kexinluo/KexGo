<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import type { AppPreferences, ThemeMode } from '../types'
import AppIcon from './AppIcon.vue'
import ContextMenuSettings from './ContextMenuSettings.vue'
import CustomCssSettings from './CustomCssSettings.vue'
import ShortcutSettings from './ShortcutSettings.vue'

type SettingsTab = 'appearance' | 'fonts' | 'shortcuts' | 'interaction' | 'advanced'
type BooleanLayoutKey = 'showSidebar' | 'showCover' | 'showTags' | 'showLyrics'

const {
  state,
  resolvedTheme,
  isBrowser,
  closeSettings,
  setTheme,
  setLyricsFontSize,
  setVisualizerEnabled,
  savePreferences,
  migrateDataLocation
} = useApp()

const tab = ref<SettingsTab>('appearance')

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: '外观' },
  { id: 'fonts', label: '字体' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'interaction', label: '交互' },
  { id: 'advanced', label: '高级' }
]

const themes: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'dark', label: '深色', icon: 'moon' },
  { id: 'light', label: '浅色', icon: 'sun' },
  { id: 'system', label: '跟随系统', icon: 'monitor' }
]

const primarySwatches = ['#c8f56a', '#78d6ff', '#6de3c1', '#ffd166', '#ff9f5a', '#ff7b81', '#f18fff', '#b7a4ff']
const secondarySwatches = ['#e9c986', '#8bd3ff', '#8fe3c7', '#ffbf6b', '#ff9e87', '#f0a6ff', '#c6b6ff', '#a7d7a0']

const layoutToggles: { key: BooleanLayoutKey; label: string }[] = [
  { key: 'showSidebar', label: '曲库侧栏' },
  { key: 'showCover', label: '封面' },
  { key: 'showTags', label: '标签' },
  { key: 'showLyrics', label: '歌词' }
]

const fontLanguages: { key: keyof AppPreferences['languageFonts']; label: string }[] = [
  { key: 'han', label: '中文 / 汉字' },
  { key: 'latin', label: '西文' },
  { key: 'japanese', label: '日文' },
  { key: 'korean', label: '韩文' }
]

const currentPrimary = computed(
  () => state.preferences.primaryColor || (resolvedTheme.value === 'light' ? '#a8dc48' : '#c8f56a')
)
const currentSecondary = computed(() => state.preferences.secondaryColor || '#e9c986')

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeSettings()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function save(): void {
  savePreferences()
}

function setPrimary(color: string): void {
  state.preferences.primaryColor = color
  save()
}

function setSecondary(color: string): void {
  state.preferences.secondaryColor = color
  save()
}

function resetColors(): void {
  state.preferences.primaryColor = ''
  state.preferences.secondaryColor = ''
  save()
}

function setPauseMode(mode: 'instant' | 'fade'): void {
  state.preferences.pauseMode = mode
  save()
}

function onPauseDuration(event: Event): void {
  state.preferences.pauseFadeMs = Number((event.target as HTMLInputElement).value)
  save()
}

function onLyricsSize(event: Event): void {
  setLyricsFontSize(Number((event.target as HTMLInputElement).value))
}

function toggleLayout(key: BooleanLayoutKey): void {
  state.preferences.layout[key] = !state.preferences.layout[key]
  save()
}

function onSidebarWidth(event: Event): void {
  state.preferences.layout.sidebarWidth = Number((event.target as HTMLInputElement).value)
  save()
}

function onCoverScale(event: Event): void {
  state.preferences.layout.coverScale = Number((event.target as HTMLInputElement).value) / 100
  save()
}

function onFontChange(): void {
  save()
}

function onLyricsPreview(event: Event): void {
  setLyricsFontSize(Number((event.target as HTMLInputElement).value))
}

function toggleCloseToTray(): void {
  state.closeToTray = !state.closeToTray
  save()
}
</script>

<template>
  <div class="settings-layer">
    <div class="settings-backdrop" @click="closeSettings"></div>
    <section class="settings-panel" role="dialog" aria-modal="true" aria-label="设置">
      <header class="settings-heading">
        <div>
          <span class="eyebrow">PREFERENCES</span>
          <h2>设置</h2>
        </div>
        <button class="icon-button small" aria-label="关闭设置" @click="closeSettings">
          <AppIcon name="close" :size="15" />
        </button>
      </header>

      <nav class="settings-tabs" aria-label="设置分类">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: tab === item.id }"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="settings-body">
        <template v-if="tab === 'appearance'">
          <section class="settings-section">
            <div class="section-heading">
              <span>主题</span>
              <small>{{ resolvedTheme === 'light' ? '当前浅色' : '当前深色' }}</small>
            </div>
            <div class="theme-options" role="group" aria-label="主题">
              <button
                v-for="option in themes"
                :key="option.id"
                class="theme-option"
                :class="{ active: state.theme === option.id }"
                :aria-pressed="state.theme === option.id"
                @click="setTheme(option.id)"
              >
                <AppIcon :name="option.icon" :size="16" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </section>

          <section class="settings-section">
            <div class="section-heading">
              <span>颜色</span>
              <small>主色用于按钮和进度，强调色用于提示和选中态</small>
            </div>
            <div class="color-block">
              <div class="color-title">
                <strong>主色</strong>
                <span>{{ currentPrimary }}</span>
                <input
                  type="color"
                  :value="currentPrimary"
                  aria-label="自定义主色"
                  @input="setPrimary(($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="swatches">
                <button
                  v-for="color in primarySwatches"
                  :key="`p-${color}`"
                  class="swatch"
                  :class="{ active: currentPrimary.toLowerCase() === color.toLowerCase() }"
                  :style="{ background: color }"
                  :aria-label="`主色 ${color}`"
                  @click="setPrimary(color)"
                ></button>
              </div>
            </div>
            <div class="color-block">
              <div class="color-title">
                <strong>强调色</strong>
                <span>{{ currentSecondary }}</span>
                <input
                  type="color"
                  :value="currentSecondary"
                  aria-label="自定义强调色"
                  @input="setSecondary(($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="swatches">
                <button
                  v-for="color in secondarySwatches"
                  :key="`s-${color}`"
                  class="swatch"
                  :class="{ active: currentSecondary.toLowerCase() === color.toLowerCase() }"
                  :style="{ background: color }"
                  :aria-label="`强调色 ${color}`"
                  @click="setSecondary(color)"
                ></button>
              </div>
            </div>
            <button class="clear-colors" @click="resetColors">恢复主题默认色</button>
          </section>

          <section class="settings-section">
            <div class="section-heading"><span>显示</span></div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>播放页律动</strong>
                <span>轻量 Canvas 动画，默认关闭以节省性能</span>
              </div>
              <button
                class="switch"
                :class="{ on: state.visualizerEnabled }"
                role="switch"
                :aria-checked="state.visualizerEnabled"
                aria-label="播放页律动"
                @click="setVisualizerEnabled(!state.visualizerEnabled)"
              >
                <span></span>
              </button>
            </div>
            <div class="setting-row stacked">
              <div class="setting-copy">
                <strong>歌词字号</strong>
                <span>当前 {{ state.lyricsFontSize }} px，立即预览</span>
              </div>
              <div class="font-range-wrap">
                <span>A</span>
                <input
                  class="range settings-range"
                  type="range"
                  min="12"
                  max="20"
                  step="1"
                  :value="state.lyricsFontSize"
                  aria-label="歌词字号"
                  :style="{ '--range-progress': `${((state.lyricsFontSize - 12) / 8) * 100}%` }"
                  @input="onLyricsSize"
                />
                <span class="font-large">A</span>
              </div>
            </div>
          </section>

          <section class="settings-section">
            <div class="section-heading"><span>布局</span><small>保存到设置</small></div>
            <div class="layout-grid">
              <button
                v-for="item in layoutToggles"
                :key="item.key"
                class="layout-toggle"
                :class="{ active: state.preferences.layout[item.key] }"
                @click="toggleLayout(item.key)"
              >
                <AppIcon :name="state.preferences.layout[item.key] ? 'check' : 'close'" :size="11" />
                {{ item.label }}
              </button>
            </div>
            <div class="setting-row stacked compact-row">
              <div class="setting-copy"><strong>侧栏宽度</strong><span>{{ state.preferences.layout.sidebarWidth }} px</span></div>
              <input
                class="range settings-range"
                type="range"
                min="250"
                max="380"
                step="10"
                :value="state.preferences.layout.sidebarWidth"
                aria-label="侧栏宽度"
                :style="{ '--range-progress': `${((state.preferences.layout.sidebarWidth - 250) / 130) * 100}%` }"
                @input="onSidebarWidth"
              />
            </div>
            <div class="setting-row stacked compact-row">
              <div class="setting-copy"><strong>封面比例</strong><span>{{ Math.round(state.preferences.layout.coverScale * 100) }}%</span></div>
              <input
                class="range settings-range"
                type="range"
                min="80"
                max="110"
                step="5"
                :value="Math.round(state.preferences.layout.coverScale * 100)"
                aria-label="封面比例"
                :style="{ '--range-progress': `${((state.preferences.layout.coverScale * 100 - 80) / 30) * 100}%` }"
                @input="onCoverScale"
              />
            </div>
          </section>
        </template>

        <template v-else-if="tab === 'fonts'">
          <section class="settings-section">
            <div class="section-heading"><span>界面字体</span><small>留空使用系统字体</small></div>
            <input
              v-model="state.preferences.uiFont"
              class="text-setting"
              placeholder="例如：'Segoe UI Variable Text', sans-serif"
              @change="onFontChange"
            />
          </section>
          <section class="settings-section">
            <div class="section-heading"><span>歌词字体</span><small>留空继承界面字体</small></div>
            <input
              v-model="state.preferences.lyricsFont"
              class="text-setting"
              placeholder="例如：'Noto Serif SC', serif"
              @change="onFontChange"
            />
            <div class="setting-row stacked compact-row">
              <div class="setting-copy"><strong>歌词字号</strong><span>{{ state.lyricsFontSize }} px</span></div>
              <input
                class="range settings-range"
                type="range"
                min="12"
                max="20"
                step="1"
                :value="state.lyricsFontSize"
                aria-label="歌词字号预览"
                :style="{ '--range-progress': `${((state.lyricsFontSize - 12) / 8) * 100}%` }"
                @input="onLyricsPreview"
              />
            </div>
          </section>
          <section class="settings-section">
            <div class="section-heading"><span>按语言 fallback 链</span><small>逗号分隔，按顺序回退</small></div>
            <label v-for="entry in fontLanguages" :key="entry.key" class="font-stack-field">
              <span>{{ entry.label }}</span>
              <input
                v-model="state.preferences.languageFonts[entry.key]"
                class="text-setting"
                @change="onFontChange"
              />
            </label>
          </section>
          <section class="settings-section">
            <div class="section-heading"><span>歌词注音显示</span></div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>显示翻译</strong>
                <span>在歌词下方显示每行翻译</span>
              </div>
              <button
                class="switch"
                :class="{ on: state.preferences.showTranslations }"
                role="switch"
                :aria-checked="state.preferences.showTranslations"
                @click="state.preferences.showTranslations = !state.preferences.showTranslations; save()"
              >
                <span></span>
              </button>
            </div>
            <div class="mode-options pronunciation-options">
              <button :class="{ active: state.preferences.annotationMode === 'none' }" @click="state.preferences.annotationMode = 'none'; save()">关闭注音</button>
              <button :class="{ active: state.preferences.annotationMode === 'ruby' }" @click="state.preferences.annotationMode = 'ruby'; save()">汉字上方假名</button>
              <button :class="{ active: state.preferences.annotationMode === 'romaji' }" @click="state.preferences.annotationMode = 'romaji'; save()">全罗马音</button>
            </div>
            <p class="setting-note">日文支持假名与全罗马音；韩文在“全罗马音”模式显示罗马音。打开“翻译/注音”编辑每行内容。</p>
          </section>
        </template>

        <template v-else-if="tab === 'shortcuts'">
          <section class="settings-section">
            <ShortcutSettings />
          </section>
        </template>

        <template v-else-if="tab === 'interaction'">
          <section class="settings-section">
            <div class="section-heading"><span>暂停策略</span></div>
            <div class="mode-options">
              <button :class="{ active: state.preferences.pauseMode === 'instant' }" @click="setPauseMode('instant')">瞬时暂停</button>
              <button :class="{ active: state.preferences.pauseMode === 'fade' }" @click="setPauseMode('fade')">淡出淡入</button>
            </div>
            <div v-if="state.preferences.pauseMode === 'fade'" class="setting-row stacked compact-row">
              <div class="setting-copy"><strong>淡入淡出时长</strong><span>{{ state.preferences.pauseFadeMs }} ms</span></div>
              <input
                class="range settings-range"
                type="range"
                min="80"
                max="1200"
                step="20"
                :value="state.preferences.pauseFadeMs"
                aria-label="淡入淡出时长"
                :style="{ '--range-progress': `${((state.preferences.pauseFadeMs - 80) / 1120) * 100}%` }"
                @input="onPauseDuration"
              />
            </div>
            <p class="setting-note">单曲可在“编辑信息”中单独启用暂停淡出。</p>
          </section>
          <section class="settings-section">
            <div class="section-heading"><span>右键菜单</span></div>
            <ContextMenuSettings />
          </section>
          <section class="settings-section">
            <div class="section-heading"><span>窗口</span></div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>关闭到系统托盘</strong>
                <span>{{ isBrowser ? '浏览器预览不会创建系统托盘' : '关闭窗口后继续在后台播放' }}</span>
              </div>
              <button
                class="switch"
                :class="{ on: state.closeToTray }"
                role="switch"
                :aria-checked="state.closeToTray"
                :disabled="isBrowser"
                @click="toggleCloseToTray"
              >
                <span></span>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="settings-section">
            <div class="section-heading"><span>数据存储位置</span><small>迁移不会删除旧目录</small></div>
            <p class="path-display">{{ state.dataLocation?.current || '读取中…' }}</p>
            <div class="data-actions">
              <button class="secondary-action" :disabled="isBrowser || state.dataMigrationBusy" @click="migrateDataLocation">
                {{ state.dataMigrationBusy ? '迁移中…' : '更改数据目录' }}
              </button>
              <span v-if="isBrowser">仅桌面版可用</span>
            </div>
            <p class="setting-note">迁移后需要重启 KexGo；旧目录会完整保留，不会自动删除。</p>
          </section>
          <section class="settings-section">
            <CustomCssSettings />
          </section>
          <section class="settings-section about-section">
            <div class="section-heading"><span>关于</span></div>
            <p>KexGo · 本地音乐播放器</p>
            <span>音乐、歌词、注音和设置只保存在本机。系统托盘菜单可控制播放并退出。</span>
          </section>
        </template>
      </div>

      <footer class="settings-footer">
        <span><i></i> 设置会自动保存</span>
        <span class="phase-mark">PHASE 03</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.settings-layer { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; }
.settings-backdrop { position: absolute; inset: 0; background: var(--overlay-bg); backdrop-filter: blur(12px); }
.settings-panel {
  position: relative; z-index: 1; width: min(680px, 100%); max-height: min(820px, calc(100vh - 48px));
  display: flex; flex-direction: column; border: 1px solid var(--line-strong); border-radius: 16px;
  background: var(--panel-bg); box-shadow: 0 30px 100px rgb(0 0 0 / 40%); overflow: hidden;
  animation: settings-in 180ms ease-out;
}
@keyframes settings-in { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
.settings-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 21px 24px 15px; }
.eyebrow { display: block; color: var(--faint); font-size: 8px; font-weight: 700; letter-spacing: 0.19em; margin-bottom: 7px; }
.settings-heading h2 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 520; letter-spacing: -0.04em; }
.settings-tabs { display: flex; gap: 4px; padding: 0 24px; border-bottom: 1px solid var(--line); }
.settings-tabs button { position: relative; padding: 9px 10px 10px; color: var(--faint); font-size: 9px; transition: color 150ms ease; }
.settings-tabs button:hover { color: var(--muted); }
.settings-tabs button.active { color: var(--accent-text); }
.settings-tabs button.active::after { content: ''; position: absolute; left: 9px; right: 9px; bottom: -1px; height: 1px; background: var(--accent); }
.settings-body { overflow-y: auto; padding: 0 24px 8px; }
.settings-section { padding: 17px 0; border-bottom: 1px solid var(--line); }
.settings-section:last-child { border-bottom: 0; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: var(--muted); font-size: 10px; letter-spacing: 0.02em; }
.section-heading small { color: var(--faint); font-family: var(--font-mono); font-size: 7px; letter-spacing: 0.02em; font-weight: 400; }
.theme-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.theme-option, .mode-options button { display: flex; align-items: center; justify-content: center; gap: 7px; height: 37px; color: var(--muted); border: 1px solid var(--line); border-radius: 7px; font-size: 9px; transition: color 160ms ease, border-color 160ms ease, background 160ms ease; }
.theme-option:hover, .mode-options button:hover { color: var(--text); border-color: var(--line-strong); }
.theme-option.active, .mode-options button.active { color: var(--accent-text); border-color: rgb(200 245 106 / 30%); background: var(--accent-soft); }
.color-block { padding: 10px 0; border-top: 1px solid var(--line); }
.color-block:first-of-type { border-top: 0; }
.color-title { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.color-title strong { color: var(--text); font-size: 9.5px; font-weight: 520; }
.color-title span { color: var(--faint); font-family: var(--font-mono); font-size: 7px; }
.color-title input[type='color'] { width: 24px; height: 19px; margin-left: auto; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: transparent; cursor: pointer; }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.swatch { width: 23px; height: 23px; border: 2px solid transparent; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%); }
.swatch.active { border-color: var(--text-bright); box-shadow: 0 0 0 2px var(--panel-bg), 0 0 0 3px var(--accent); }
.clear-colors { margin-top: 8px; color: var(--faint); font-size: 8px; text-decoration: underline; text-underline-offset: 2px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 42px; }
.setting-row + .setting-row { border-top: 1px solid var(--line); }
.setting-row.stacked { flex-direction: column; align-items: stretch; gap: 10px; min-height: 0; padding: 10px 0; }
.setting-row.compact-row { min-height: 0; padding: 7px 0; }
.setting-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.setting-copy strong { color: var(--text); font-size: 9.5px; font-weight: 520; }
.setting-copy span { color: var(--faint); font-size: 8px; line-height: 1.45; }
.switch { position: relative; width: 34px; height: 19px; flex: 0 0 auto; border-radius: 10px; background: var(--line-strong); transition: background 160ms ease, opacity 160ms ease; }
.switch span { position: absolute; top: 3px; left: 3px; width: 13px; height: 13px; border-radius: 50%; background: var(--muted); transition: transform 160ms ease, background 160ms ease; }
.switch.on { background: var(--accent); }
.switch.on span { background: var(--on-accent); transform: translateX(15px); }
.switch:disabled { opacity: 0.35; }
.font-range-wrap { display: flex; align-items: center; gap: 10px; color: var(--faint); font-family: var(--font-mono); font-size: 8px; }
.font-range-wrap .font-large { font-size: 13px; }
.settings-range { flex: 1; height: 16px; }
.settings-range::-webkit-slider-runnable-track { height: 2px; border-radius: 2px; background: linear-gradient(to right, var(--accent) 0, var(--accent) var(--range-progress), var(--line-strong) var(--range-progress), var(--line-strong) 100%); }
.settings-range::-moz-range-track { height: 2px; background: var(--line-strong); }
.settings-range::-moz-range-progress { height: 2px; background: var(--accent); }
.layout-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.layout-toggle { display: inline-flex; align-items: center; gap: 4px; height: 25px; padding: 0 7px; color: var(--faint); border: 1px solid var(--line); border-radius: 5px; font-size: 8px; }
.layout-toggle.active { color: var(--accent-text); border-color: rgb(200 245 106 / 20%); background: var(--accent-soft); }
.text-setting { width: 100%; height: 31px; padding: 0 9px; color: var(--text); border: 1px solid var(--line); border-radius: 6px; background: var(--surface-soft); font-size: 9px; outline: none; }
.text-setting:focus { border-color: var(--line-strong); }
.font-stack-field { display: grid; grid-template-columns: 78px 1fr; align-items: center; gap: 10px; margin-top: 8px; color: var(--faint); font-size: 8px; }
.mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.mode-options button { height: 32px; }
.pronunciation-options { grid-template-columns: repeat(3, 1fr); margin-top: 8px; }
.setting-note { margin: 8px 0 0; color: var(--faint); font-size: 8px; line-height: 1.55; }
.path-display { margin: 0 0 9px; padding: 8px 9px; color: var(--muted); border: 1px solid var(--line); border-radius: 6px; background: var(--surface-soft); font-family: var(--font-mono); font-size: 7.5px; overflow-wrap: anywhere; }
.data-actions { display: flex; align-items: center; gap: 9px; }
.secondary-action { height: 28px; padding: 0 9px; color: var(--text); border: 1px solid var(--line-strong); border-radius: 5px; font-size: 8.5px; }
.secondary-action:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-text); }
.secondary-action:disabled { opacity: 0.35; }
.data-actions span { color: var(--faint); font-size: 8px; }
.about-section p { margin: 0 0 5px; color: var(--text); font-size: 10px; }
.about-section > span { color: var(--faint); font-size: 8px; line-height: 1.6; }
.settings-footer { display: flex; align-items: center; justify-content: space-between; padding: 11px 24px; border-top: 1px solid var(--line); color: var(--faint); font-size: 8px; }
.settings-footer > span:first-child { display: inline-flex; align-items: center; gap: 6px; }
.settings-footer i { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
.phase-mark { font-family: var(--font-mono); font-size: 7px; letter-spacing: 0.12em; }
</style>
