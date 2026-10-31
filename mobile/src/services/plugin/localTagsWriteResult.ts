/**
 * `localMusic.writeTags` 的返回语义。
 *
 * SDK 声明的是 `Promise<void>`，桌面在文件标签写失败时直接抛错。移动端
 * store 的写入分两段：先把信息存进应用内记录，再尽力写回音频文件；文件那
 * 一段失败时它**不抛错**，而是把原因放在 `fileTagWarning` 里，让界面能提示
 * 「已保存在应用内，文件标签没写进去」。
 *
 * 对插件来说这个中间态必须变成失败：插件以为自己改了文件标签，实际文件里
 * 什么都没变，用户把歌拷到别的播放器就发现信息没跟着走。
 */
export interface LocalTagsWriteResult {
  success?: boolean
  fileTagWritten?: boolean
  fileTagWarning?: string
}

export function assertLocalTagsWritten(result: LocalTagsWriteResult | null | undefined): void {
  if (result?.success === false) throw new Error('写入标签失败')
  if (result?.fileTagWarning) {
    throw new Error(`标签已保存到应用内，但写入音频文件失败：${result.fileTagWarning}`)
  }
}
