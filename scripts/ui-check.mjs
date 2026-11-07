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
await page.getByRole('button', { name: '找歌词' }).click()
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
