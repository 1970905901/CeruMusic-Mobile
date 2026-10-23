/**
 * 社区内容的 IP 归属地文案。
 *
 * 后端只在较新的帖子和评论里带 `ipLocation`，早期数据没有这个字段。桌面端
 * `community/PostDetailModal.vue` 用同一个兜底常量 `澜星`：缺字段时说明「这条
 * 内容发布时不记录归属地」，而不是留一段空白让人以为是渲染漏了。移动端此前
 * 只在帖子详情里、且仅在字段存在时才显示，列表与评论、回复则完全不显示——
 * 同一套数据在两个端上看到的元信息不一样。
 *
 * 各页面共用这一份判定，避免哪一处又漏掉兜底或换成别的说法。
 */

/** 归属地缺失时统一展示的文案，与桌面端 `IP_LOCATION_FALLBACK` 一致。 */
export const IP_LOCATION_FALLBACK = '澜星'

/** 把后端可能给出的归属地归一成可展示文案；空值、纯空白与非字符串都回落到兜底。 */
export function communityLocationText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || IP_LOCATION_FALLBACK
}

/**
 * 元信息行（时间 · 归属地）的完整文案。
 *
 * 时间可能因为字段损坏而解析失败（`formatTime` 返回空串），这时不留下开头的分隔符。
 */
export function communityMetaLine(time: string, ipLocation: unknown): string {
  const location = communityLocationText(ipLocation)
  return time ? `${time} · ${location}` : location
}
