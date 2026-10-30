/**
 * 播放队列的剪贴板搬运（桌面版 `Play/PlaylistActions.vue` 的「复制到剪贴板 /
 * 从剪贴板导入」）。
 *
 * 桌面版的队列导出有两个方向：落成加密 `.cmpl` 文件，或**直接把加密串写进
 * 剪贴板**；导入同样两条路。移动端队列此前只有文件，手机上传文件很别扭，
 * 而「复制一串文本发到另一台设备」才是手机上的常见做法。
 *
 * 走的是与歌单文件、音乐库「从剪贴板导入」完全相同的那一份加密格式
 * （`services/playlistFiles.ts`），因此队列、歌单、桌面版三者可以互相搬运。
 */

/** 剪贴板里队列数据的体量上限，与音乐库导入同一口径。 */
export const MAX_QUEUE_CLIPBOARD_BYTES = 4 * 1024 * 1024

/** 导出前按 UTF-8 估算体量；超限时明确拒绝，而不是塞一个读不回来的字符串。 */
export function assertQueueClipboardFits(text: string): void {
  const bytes = new TextEncoder().encode(String(text ?? '')).length
  if (bytes > MAX_QUEUE_CLIPBOARD_BYTES) {
    throw new Error(
      `队列数据超过 ${Math.round(MAX_QUEUE_CLIPBOARD_BYTES / 1024 / 1024)} MB，请改用导出文件`
    )
  }
}

/**
 * 导出提示：本地音乐与已下载副本只存在于本机，带进剪贴板只会变成坏引用，
 * 因此和文件导出一样先剔除，并把剔除数量说出来。
 *
 */
export function describeQueueExport(exported: number, dropped: number): string {
  if (!exported) throw new Error('队列里没有可导出的在线歌曲')
  return dropped > 0
    ? `已复制 ${exported} 首（${dropped} 首本地歌曲未包含）`
    : `已复制 ${exported} 首`
}

/** 从剪贴板导入队列后的提示，与文件导入同一文案口径。 */
export function describeQueueImport(added: number): string {
  return added > 0 ? `已加入 ${added} 首到播放队列` : '这些歌曲已经在队列中'
}
