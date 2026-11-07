import type { Track } from './types'

export const DEMO_TRACK_ID = 'demo-night-train'

export const demoLyrics = `[ti:第八号夜车]
[ar:林间电台]
[al:慢速城市]
[00:00.00]第八号夜车
[00:09.50]穿过潮湿的街道
[00:17.20]霓虹在后视镜里退潮
[00:25.10]你说城市像一盘卡带
[00:33.30]偶尔倒带 偶尔空白
[00:41.60]窗外的风 把夜色吹开
[00:49.40]我们沿着高架 慢慢开
[00:57.10]没有目的地也算抵达
[01:05.20]把音量调到刚好
[01:12.80]让这首歌替我们说话
[01:20.50]前方还有很长的夏
[01:28.10]别急着回答
[01:34.60]就让夜车继续开
`

export function createDemoTrack(): Track {
  return {
    id: DEMO_TRACK_ID,
    filePath: '/demo/night-train.wav',
    title: '第八号夜车',
    artist: '林间电台',
    album: '慢速城市',
    duration: 96,
    coverPath: '/demo/cover.svg',
    lrcPath: 'demo-managed.lrc',
    lyricsText: demoLyrics,
    lyricsOrigin: 'lrclib',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}
