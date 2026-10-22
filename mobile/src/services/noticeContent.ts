/**
 * 消息中心里官方通知的正文渲染，对齐桌面版 `notifications/NoticeCard.vue`。
 *
 * 桌面版用 marked + DOMPurify 把 markdown 转成 HTML（`v-html`），再用 DOMPurify
 * 过滤；移动端没有这两个依赖，也不想为了通知区引入约 80 KB 的解析器与过滤器。
 * 这里改成**先解析成结构、再由模板渲染**：不产出 HTML 字符串，也就不存在
 * XSS 面——所有文本都按纯文本插值，链接只保留 http(s)。
 *
 * 只实现通知里真正会用到的子集：标题、列表、段落，以及行内的粗体、斜体、
 * 行内代码与链接。其它语法按原文显示，不猜。
 */

export type NoticeBlockType = 'paragraph' | 'heading' | 'bullet'

export interface InlineSegment {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'link'
  text: string
  /** 仅 `link` 有值，且已确认是 http(s)。 */
  href?: string
}

export interface NoticeBlock {
  type: NoticeBlockType
  /** 标题层级（1–6）；非标题为 undefined。 */
  level?: number
  segments: InlineSegment[]
}

/** 正文过长时截断，避免一条公告把消息列表撑到无法滚动。 */
export const MAX_NOTICE_BLOCKS = 200
export const MAX_INLINE_LENGTH = 20000

/** 只接受 http(s)：其它协议（javascript:、data:、file:）一律当作普通文本。 */
export function safeHref(value: string): string | null {
  const href = value.trim()
  if (!/^https?:\/\//i.test(href)) return null
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * 解析行内标记。
 *
 * 按「链接 → 行内代码 → 粗体 → 斜体」的顺序匹配：代码里不应再解析粗体，
 * 而链接文字里允许有粗体，这里不做嵌套——通知文案用不到，做了反而增加歧义。
 */
export function parseInline(text: string): InlineSegment[] {
  const source = text.slice(0, MAX_INLINE_LENGTH)
  const segments: InlineSegment[] = []
  const pattern =
    /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  const pushText = (value: string) => {
    if (!value) return
    const previous = segments[segments.length - 1]
    if (previous?.kind === 'text') previous.text += value
    else segments.push({ kind: 'text', text: value })
  }
  while ((match = pattern.exec(source))) {
    pushText(source.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
    if (match[1] !== undefined) {
      const href = safeHref(match[2])
      // 危险协议的链接退化成纯文本，而不是渲染成一个点了会执行脚本的锚点。
      if (href) segments.push({ kind: 'link', text: match[1], href })
      else pushText(match[0])
    } else if (match[3] !== undefined) {
      segments.push({ kind: 'code', text: match[3] })
    } else if (match[4] !== undefined || match[5] !== undefined) {
      segments.push({ kind: 'bold', text: match[4] ?? match[5] })
    } else {
      segments.push({ kind: 'italic', text: match[6] ?? match[7] })
    }
  }
  pushText(source.slice(lastIndex))
  return segments.length ? segments : [{ kind: 'text', text: source }]
}

/**
 * 把通知正文拆成块。支持 ATX 标题（`#`–`######`）、无序列表（`-` / `*` / `+`）
 * 与段落；空行分段，行内换行保留为段落内的折行。
 */
export function parseNoticeBlocks(content: string): NoticeBlock[] {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: NoticeBlock[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (!paragraph.length) return
    const text = paragraph.join('\n').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', segments: parseInline(text) })
  }

  for (const rawLine of lines) {
    if (blocks.length >= MAX_NOTICE_BLOCKS) break
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flush()
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        segments: parseInline(heading[2].trim())
      })
      continue
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      flush()
      blocks.push({ type: 'bullet', segments: parseInline(bullet[1]) })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

/** 通知是否值得给「展开全文」：内容多到会被截断时才显示。 */
export function noticeNeedsExpand(blocks: readonly NoticeBlock[]): boolean {
  if (blocks.length > 3) return true
  return blocks.some((block) =>
    block.segments.reduce((sum, segment) => sum + segment.text.length, 0) > 120
  )
}
