import { chromium } from 'playwright-core'
import fs from 'node:fs'

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-crash-reporter', '--disable-breakpad']
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})

fs.mkdirSync('screenshots', { recursive: true })

// Empty state
await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: 'screenshots/empty.png' })

const emptyHeading = await page.locator('h1').first().innerText()
if (!emptyHeading.includes('把喜欢的歌')) {
  errors.push(`empty state heading missing: ${emptyHeading}`)
}

// Demo player
await page.goto('http://127.0.0.1:1420/?demo=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: 'screenshots/player.png' })

const title = await page.locator('.track-title').innerText()
if (!title.includes('第八号夜车')) errors.push(`demo track title missing: ${title}`)

// Phase 1 UI contract: old action buttons are gone, tags are shown, and the
// player is now using Lucide's pause glyph instead of the custom SVG.
const removedPlayerAction = await page.locator('.player-tools .align-tool').count()
if (removedPlayerAction !== 0) errors.push('player bar still shows the align button')
const removedCoverActions = await page.locator('.track-actions').count()
if (removedCoverActions !== 0) errors.push('cover area still shows find/align buttons')
if ((await page.locator('.tag-chip').count()) < 2) errors.push('initial tags are missing')

await page.evaluate(async () => {
  const { useApp } = await import('/src/stores/app.ts')
  useApp().state.playing = true
})
await page.waitForTimeout(100)
const pauseIconClass = (await page.locator('.play-button svg').getAttribute('class')) || ''
if (!pauseIconClass.includes('lucide-pause')) {
  errors.push(`pause icon is not provided by Lucide: ${pauseIconClass}`)
}
await page.evaluate(async () => {
  const { useApp } = await import('/src/stores/app.ts')
  useApp().state.playing = false
})
await page.waitForTimeout(100)

const volumeValue = page.locator('.volume-value')
const volumeBeforeMute = await volumeValue.innerText()
const volumeStep = await page.locator('.volume-range').getAttribute('step')
if (volumeStep !== '0.1') errors.push(`volume step is ${volumeStep}, expected 0.1`)
await page.getByRole('button', { name: '静音' }).click()
await page.waitForTimeout(150)
if ((await volumeValue.innerText()) !== '0') errors.push('muting did not show volume 0')
await page.getByRole('button', { name: '恢复音量' }).click()
await page.waitForTimeout(220)
if ((await volumeValue.innerText()) !== volumeBeforeMute) {
  errors.push(`mute restore changed volume: ${volumeBeforeMute} -> ${await volumeValue.innerText()}`)
}

const tagInput = page.getByRole('textbox', { name: '添加标签' })
await tagInput.fill('测试')
await tagInput.press('Enter')
await page.waitForTimeout(250)
if (!(await page.locator('.tag-chip', { hasText: '测试' }).count())) {
  errors.push('adding a tag did not update the tag list')
}

// File issue state: banner is shown and the play button is disabled.
await page.evaluate(async () => {
  const { useApp } = await import('/src/stores/app.ts')
  const app = useApp()
  const trackId = app.state.currentTrackId
  if (trackId) {
    app.state.trackIssues[trackId] = {
      trackId,
      status: 'missing',
      message: '文件不存在或已被移动，请重新导入或从曲库移除。'
    }
  }
})
await page.waitForTimeout(200)
if (!(await page.locator('.track-issue').count())) errors.push('missing-file banner was not shown')
if (!(await page.locator('.play-button').isDisabled())) errors.push('play button is not disabled for a missing file')
await page.screenshot({ path: 'screenshots/track-issue.png' })
await page.evaluate(async () => {
  const { useApp } = await import('/src/stores/app.ts')
  const app = useApp()
  if (app.state.currentTrackId) delete app.state.trackIssues[app.state.currentTrackId]
})
await page.waitForTimeout(150)

// Explicit unsupported-file modal. This injects the same store state that the
// Rust importer produces for fragmented MP4 files.
await page.evaluate(async () => {
  const { useApp } = await import('/src/stores/app.ts')
  const app = useApp()
  app.state.importIssues = [
    {
      path: 'D:\\Media\\Music\\Glass Animals\\《I Love You So Fucking Much》.mp3',
      reason:
        '检测到该文件实际是 fragmented MP4（分片 MP4，常见音轨为 AAC），不是普通的 MP3/M4A 文件。当前版本暂不支持分片 MP4，已停止导入和播放以避免闪退。请先将它转换为普通 M4A 或 MP3 后再导入。'
    }
  ]
  app.state.importIssuesOpen = true
})
await page.waitForTimeout(300)
const issueModalTitle = await page.locator('.issues-modal h2').innerText()
if (!issueModalTitle.includes('此文件暂不支持')) {
  errors.push(`unsupported import modal title missing: ${issueModalTitle}`)
}
await page.screenshot({ path: 'screenshots/import-unsupported.png' })
await page.getByRole('button', { name: '知道了' }).click()
await page.waitForTimeout(200)
if (await page.locator('.issues-modal').count()) errors.push('unsupported import modal did not close')

// Online lyric search with a deterministic mocked response.
await page.route('https://lrclib.net/**', async (route) => {
  const url = route.request().url()
  const payload = url.includes('/api/search')
    ? [
        {
          id: 1,
          trackName: '第八号夜车',
          artistName: '林间电台',
          albumName: '慢速城市',
          duration: 96,
          instrumental: false,
          plainLyrics: '第八号夜车\n穿过潮湿的街道\n霓虹在后视镜里退潮',
          syncedLyrics: '[00:09.50]穿过潮湿的街道\n[00:17.20]霓虹在后视镜里退潮'
        },
        {
          id: 2,
          trackName: '第八号夜车 (Live)',
          artistName: '林间电台',
          albumName: '慢速城市 Live',
          duration: 101,
          instrumental: false,
          plainLyrics: '只有纯文本歌词',
          syncedLyrics: null
        }
      ]
    : {
        id: 1,
        trackName: '第八号夜车',
        artistName: '林间电台',
        albumName: '慢速城市',
        duration: 96,
        instrumental: false,
        plainLyrics: '第八号夜车',
        syncedLyrics: '[00:09.50]穿过潮湿的街道'
      }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
})
await page.getByRole('button', { name: '找词' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: 'screenshots/find-lyrics.png' })
const resultCount = await page.locator('.result-row').count()
if (resultCount !== 2) errors.push(`expected 2 mocked lyric results, got ${resultCount}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

// Quick aligner
await page.getByRole('button', { name: '快速对轴' }).click()
await page.waitForTimeout(600)
await page.locator('.align-row', { hasText: '把音量调到刚好' }).click()
await page.waitForTimeout(350)
await page.screenshot({ path: 'screenshots/align.png' })

const rowCount = await page.locator('.align-row').count()
if (rowCount < 10) errors.push(`alignment rows missing: ${rowCount}`)

const nativeAlignSliders = await page.locator('.align-console input[type="range"]').count()
if (nativeAlignSliders !== 0) {
  errors.push(`alignment console still contains a native range input: ${nativeAlignSliders}`)
}
const customScrubberCount = await page.locator('.align-scrubber').count()
if (customScrubberCount !== 1) {
  errors.push(`custom alignment scrubber missing: ${customScrubberCount}`)
}
const timeBeforeSeek = await page.locator('.big-time > span').innerText()
const scrubberBox = await page.locator('.align-scrubber').boundingBox()
if (scrubberBox) {
  await page.mouse.click(scrubberBox.x + scrubberBox.width * 0.25, scrubberBox.y + scrubberBox.height / 2)
  await page.waitForTimeout(250)
}
const timeAfterSeek = await page.locator('.big-time > span').innerText()
if (timeBeforeSeek === timeAfterSeek) {
  errors.push(`custom alignment scrubber did not seek: ${timeBeforeSeek}`)
}
await page.screenshot({ path: 'screenshots/align.png' })

// Keyboard adjustment should change the active line's timestamp.
const activeRow = page.locator('.align-row.current')
const before = await activeRow.locator('.row-time').innerText()
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(250)
const after = await activeRow.locator('.row-time').innerText()
if (before === after) errors.push(`ArrowLeft did not adjust timestamp: ${before}`)
await page.keyboard.press('z')
await page.waitForTimeout(200)
const undone = await activeRow.locator('.row-time').innerText()
if (undone !== before) errors.push(`undo did not restore timestamp: ${undone} vs ${before}`)

// Stamp should advance the current row.
const currentIndexBefore = await page.locator('.align-row.current .row-index').innerText()
await page.keyboard.press('Space')
await page.waitForTimeout(250)
const currentIndexAfter = await page.locator('.align-row.current .row-index').innerText()
if (currentIndexBefore === currentIndexAfter) errors.push('Space did not advance the aligner cursor')

// Save in browser fallback and confirm a success toast.
await page.getByRole('button', { name: /保存 LRC/ }).first().click()
await page.waitForTimeout(450)
const toastText = await page.locator('.toast').last().innerText().catch(() => '')
if (!toastText.includes('已保存')) errors.push(`save toast missing: ${toastText}`)
await page.screenshot({ path: 'screenshots/align-saved.png' })

// A compact viewport check.
await page.setViewportSize({ width: 1280, height: 820 })
await page.waitForTimeout(300)
await page.screenshot({ path: 'screenshots/align-compact.png' })

console.log(JSON.stringify({ errors, title, rowCount, before, after, undone }, null, 2))
await browser.close()
