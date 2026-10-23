/**
 * 从剪贴板导入歌单，对齐桌面版 `PlaylistActions.vue` / `Settings/PlaylistSettings.vue`
 * 的「从剪贴板导入」。
 *
 * 移动端已经有「复制歌单到剪贴板」（歌单页菜单），但没有对应的导入入口：
 * 复制出去的加密歌单在手机上没有任何地方能读回来，只能先存成文件再手动找。
 * 桌面版靠 `navigator.clipboard.readText()` 直接读，移动端 WebView 里
 * 该 API 在多数版本上不可用或不询问权限，因此走 `@capacitor/clipboard`。
 *
 * 这里只做「文本 → 曲目」的纯逻辑；剪贴板读写由调用方注入，方便单测。
 */
import { decryptPlaylistText, playlistFileTracks, type PlaylistFileSong } from './playlistFiles'
import type { ProviderEntry } from '@/types/plugin'
import type { Track } from '@/types/music'

/** 剪贴板文本的体量上限：正常的加密歌单几十 KB，超出的多半贴错了东西。 */
export const MAX_CLIPBOARD_TEXT_BYTES = 4 * 1024 * 1024

export interface ClipboardPlaylistResult {
  songs: PlaylistFileSong[]
  tracks: Track[]
}

/**
 * 把剪贴板文本解析成歌单曲目。
 *
 * 解密失败、内容不是歌单、或整单只有本地歌曲时都抛错并给出可读原因——
 * 这些情况用户没法从「导入失败」四个字里猜出问题所在。
 */
export function parsePlaylistClipboard(
  text: string,
  providers: readonly ProviderEntry[]
): ClipboardPlaylistResult {
  const raw = String(text ?? '').trim()
  if (!raw) throw new Error('剪贴板是空的')
  // 按 UTF-8 估算字节数：逐字符量编码不划算，而这里只需要一个上界。
  const bytes = new TextEncoder().encode(raw).length
  if (bytes > MAX_CLIPBOARD_TEXT_BYTES) {
    throw new Error(
      `剪贴板内容超过 ${Math.round(MAX_CLIPBOARD_TEXT_BYTES / 1024 / 1024)} MB，可能不是歌单`
    )
  }
  const songs = decryptPlaylistText(raw)
  const tracks = playlistFileTracks(songs, providers)
  if (!tracks.length) throw new Error('剪贴板里的歌单没有可导入的歌曲')
  return { songs, tracks }
}

/**
 * 从复制来的歌单里取一个可用名称。
 *
 * 复制到剪贴板的只有加密串，没有名字；桌面版同样退回到固定文案。
 * 这里用「导入的歌单 + 日期」让它至少能和别的导入歌单区分开。
 */
export function clipboardPlaylistName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `导入的歌单 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
