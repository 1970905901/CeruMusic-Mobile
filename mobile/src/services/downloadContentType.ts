/**
 * 判断下载响应的 Content-Type 是否可能是音频。
 *
 * 插件解析出的直链可能因为鉴权过期返回 200 + HTML 登录页，CDN 也可能
 * 用 200 + JSON 报错。此前移动端不看类型，一律按 mp3 存盘——用户得到
 * 一首「坏歌」，播放时才报错，事后很难追到原因。
 *
 * 只拦截**明确不是音频**的类型；空类型与 `application/octet-stream`
 * 这类通用二进制必须放行，很多音频直链就是这么发的。
 */

const ALLOWED_APPLICATION_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/mp4',
  'application/ogg'
])

export function isAudioContentType(type: string | null | undefined): boolean {
  const value = String(type ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!value) return true
  if (value.startsWith('audio/')) return true
  return ALLOWED_APPLICATION_TYPES.has(value)
}

/** 给人看的错误文案；`type` 会去掉 charset 之类的参数。 */
export function notAudioMessage(type: string): string {
  const value = String(type ?? '').split(';')[0].trim() || '未知类型'
  return `下载内容不是音频（${value}），请检查音源是否可用`
}
