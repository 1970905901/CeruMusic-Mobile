/**
 * 阿里云 OSS 图片处理 URL 拼接（桌面端 `utils/ossImage.ts` 的移动端等价实现）。
 *
 * 用于社区列表缩略图、详情大图与头像：移动网络下原图往往几 MB，
 * 限定长边并转 webp 能显著减少流量与首屏等待。
 *
 * 只对已知 OSS 域名拼接参数，外部 URL（如 Logto 头像）原样返回。
 * 处理串作为 query value 必须整体 encode，否则经 CDN/反代时 "/" 会被吞掉。
 */
const OSS_HOST_PATTERNS: Array<string | RegExp> = ['cqoss.shiqianjiang.cn', /\.aliyuncs\.com$/i]

export interface OssImageOpts {
  /** 长边像素，`m_lfit` 即等比缩放且不放大 */
  w?: number
  /** 质量 1-100 */
  q?: number
  /** 模糊半径与标准差，越大越糊 */
  blur?: { r: number; s: number }
  format?: 'webp' | 'jpg' | 'png'
}

export function isOssUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return OSS_HOST_PATTERNS.some((host) =>
      typeof host === 'string' ? parsed.host === host : host.test(parsed.host)
    )
  } catch {
    return false
  }
}

/**
 * 给 OSS 图片 URL 拼处理参数；非 OSS URL 原样返回。
 *
 * @example
 *   ossImage('https://cqoss.shiqianjiang.cn/x.webp', { w: 640, q: 80 })
 *   -> '.../x.webp?x-oss-process=image%2Fresize%2Cw_640%2Cm_lfit%2Fquality%2Cq_80'
 */
export function ossImage(url: string | undefined | null, opts: OssImageOpts = {}): string {
  if (!url) return ''
  if (!isOssUrl(url)) return url

  const parts: string[] = []
  if (opts.w) parts.push(`resize,w_${opts.w},m_lfit`)
  if (opts.q !== undefined) parts.push(`quality,q_${opts.q}`)
  if (opts.blur) parts.push(`blur,r_${opts.blur.r},s_${opts.blur.s}`)
  if (opts.format) parts.push(`format,${opts.format}`)
  if (!parts.length) return url

  const process = `image/${parts.join('/')}`
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}x-oss-process=${encodeURIComponent(process)}`
}

/** 卡片/列表封面：移动端 2-3 列网格，640 宽对高 DPI 屏足够。 */
export const ossCard = (url: string | undefined | null) =>
  ossImage(url, { w: 640, q: 80, format: 'webp' })

/** 详情页大图：限到 1600 长边，避免拉原图。 */
export const ossDetail = (url: string | undefined | null) =>
  ossImage(url, { w: 1600, q: 88, format: 'webp' })

/** 头像/小图标：120 宽。 */
export const ossAvatar = (url: string | undefined | null) =>
  ossImage(url, { w: 120, q: 80, format: 'webp' })
