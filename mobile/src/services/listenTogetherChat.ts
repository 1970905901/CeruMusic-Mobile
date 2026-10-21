/**
 * 一起听聊天：与桌面端 ChatPanel 对齐的纯逻辑。
 *
 * 桌面端把这些规则写在组件里（系统消息模板、@ 提及切片、meta 组装、
 * 分享链接识别）。移动端要在「页面 + 长按菜单 + 输入框」三处复用同一套
 * 规则，因此抽成无副作用的模块，便于单测。
 */

export interface ChatMetaSource {
  content: string
  /** 当前草稿里仍保留文本的提及：userId + nickname */
  mentions: ReadonlyArray<{ userId: string; nickname: string }>
  reply?: { id: string; from: string; preview: string } | null
}

export interface ChatShareLinkRef {
  cardType: 'song' | 'playlist'
  cardId: string
}

export type ChatSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; isSelf: boolean }

const SHARE_ID = '[A-Za-z0-9_-]{4,32}'

/**
 * 贴纸 id → 中文描述。与桌面端 `utils/listenTogether/stickers.ts` 的 label
 * 保持一致：协议层只传 id，移动端不打包贴纸图片（约 2.3 MB），
 * 统一用文字描述渲染，避免出现「sticker-5」这类裸 id。
 */
export const CHAT_STICKER_LABELS: Record<string, string> = {
  'sticker-0': '好听！',
  'sticker-1': '一起听歌',
  'sticker-2': '哇塞',
  'sticker-3': '感动',
  'sticker-4': '单曲循环',
  'sticker-5': '等你哦',
  'sticker-6': '来啦~',
  'sticker-7': '哈哈哈',
  'sticker-8': '谢谢你',
  'sticker-9': '晚安',
  'sticker-10': '没事哒',
  'sticker-11': '随便听听',
  'sticker-12': '等歌中…',
  'sticker-13': '拜拜',
  'sticker-14': '棒！',
  'sticker-15': '抱抱'
}

/** 未知 id 原样返回 —— 新版本贴纸不应被吞掉。 */
export function describeChatSticker(id: string): string {
  return CHAT_STICKER_LABELS[String(id ?? '')] || String(id ?? '')
}

const SHARE_PATTERNS: Array<{ cardType: ChatShareLinkRef['cardType']; pattern: RegExp }> = [
  { cardType: 'playlist', pattern: new RegExp(`/p/(${SHARE_ID})(?![A-Za-z0-9_-])`, 'i') },
  { cardType: 'playlist', pattern: new RegExp(`/(?:share|playlist)/playlist/(${SHARE_ID})(?![A-Za-z0-9_-])`, 'i') },
  { cardType: 'playlist', pattern: new RegExp(`/playlist/share/(${SHARE_ID})(?![A-Za-z0-9_-])`, 'i') },
  { cardType: 'song', pattern: new RegExp(`/share/song/(${SHARE_ID})(?![A-Za-z0-9_-])`, 'i') },
  { cardType: 'song', pattern: new RegExp(`/song/share/(${SHARE_ID})(?![A-Za-z0-9_-])`, 'i') }
]

/** 桌面端分享站点的短链：`https://host/<id>` 为单曲。 */
const SHORT_LINK = new RegExp(`https?://ceru\\.share\\.shiqianjiang\\.cn/(${SHARE_ID})(?![A-Za-z0-9_-])`, 'i')

/**
 * 从消息正文识别 Ceru 分享链接。返回第一处命中，避免一条消息里多张卡片。
 * 只做文本识别，不发请求 —— 卡片点击后由路由页面拉取详情。
 */
export function parseChatShareLink(text: string): ChatShareLinkRef | null {
  if (!text) return null
  for (const entry of SHARE_PATTERNS) {
    const matched = text.match(entry.pattern)
    if (matched) return { cardType: entry.cardType, cardId: matched[1] }
  }
  const short = text.match(SHORT_LINK)
  if (short && short[1].toLowerCase() !== 'p') {
    return { cardType: 'song', cardId: short[1] }
  }
  return null
}

/**
 * 组装发送用 meta。与桌面端一致：
 * - 昵称文本被删掉的提及不再发送（避免「@ 了但正文没有」的脏数据）
 * - 有引用才写 replyTo*
 * - 分享链接把 cardType/cardId 透传，供接收端直接渲染
 */
export function buildChatMeta(source: ChatMetaSource): Record<string, string> {
  const content = String(source.content ?? '')
  const meta: Record<string, string> = {}
  const stillMentioned = source.mentions
    .filter((item) => content.includes(`@${item.nickname}`))
    .map((item) => item.userId)
  if (stillMentioned.length > 0) meta.mentions = stillMentioned.join(',')
  if (source.reply) {
    meta.replyToId = source.reply.id
    meta.replyToFrom = source.reply.from
    meta.replyToPreview = source.reply.preview
  }
  const card = parseChatShareLink(content)
  if (card) {
    meta.cardType = card.cardType
    meta.cardId = card.cardId
  }
  return meta
}

/**
 * 把正文按 @昵称 切片，供渲染时套高亮。
 * 昵称按长度降序匹配，避免「@张三」吃掉「@张三丰」。
 */
export function splitMentions(
  content: string,
  mentionIds: readonly string[],
  members: ReadonlyArray<{ userId: string; nickname?: string }>,
  selfId: string
): ChatSegment[] {
  const text = String(content ?? '')
  if (!text) return []
  if (!mentionIds.length) return [{ type: 'text', text }]
  const known = mentionIds
    .map((id) => members.find((member) => member.userId === id))
    .filter((member): member is { userId: string; nickname?: string } => !!member?.nickname)
    .map((member) => ({ nickname: String(member.nickname), isSelf: member.userId === selfId }))
    .sort((left, right) => right.nickname.length - left.nickname.length)
  if (!known.length) return [{ type: 'text', text }]

  const segments: ChatSegment[] = []
  let index = 0
  while (index < text.length) {
    if (text[index] === '@') {
      const matched = known.find((item) => text.startsWith(item.nickname, index + 1))
      if (matched) {
        segments.push({ type: 'mention', text: '@' + matched.nickname, isSelf: matched.isSelf })
        index += matched.nickname.length + 1
        continue
      }
    }
    const last = segments[segments.length - 1]
    if (last && last.type === 'text') last.text += text[index]
    else segments.push({ type: 'text', text: text[index] })
    index++
  }
  return segments
}

/**
 * 输入框里的 @ 触发判定：光标前最近的 @ 必须在行首/空白后，
 * 避免邮箱、变量名里的 @ 误触发候选浮层。
 */
export function findMentionQuery(text: string, cursor?: number): { query: string; at: number } | null {
  const value = String(text ?? '')
  const end = Math.min(Math.max(0, cursor ?? value.length), value.length)
  let at = -1
  for (let index = end - 1; index >= 0 && end - index <= 16; index--) {
    const char = value[index]
    if (char === '@') {
      at = index
      break
    }
    if (char === ' ' || char === '\n' || char === '\t') break
  }
  if (at < 0) return null
  if (at > 0) {
    const previous = value[at - 1]
    if (previous !== ' ' && previous !== '\n' && previous !== '\t') return null
  }
  return { query: value.slice(at + 1, end), at }
}

/** 引用条预览文本：贴纸消息显示为「[贴纸] 描述」，避免出现 sticker-5 占位。 */
export function replyPreview(content: string, type: string, stickerLabel?: string): string {
  const text = String(content ?? '')
  if (type === 'sticker') return `[贴纸] ${stickerLabel || text}`.slice(0, 40)
  return text.slice(0, 40)
}

/** 系统消息 content 是后端 key，这里统一翻成可读中文。 */
export function renderSystemMessage(
  content: string,
  meta?: Record<string, string>
): string {
  const data = meta || {}
  switch (content) {
    case 'member-join':
      return `${data.user || '某人'} 加入了房间`
    case 'member-leave':
      return `${data.user || '某人'} 离开了房间`
    case 'queue-request':
      return `${data.user || '某人'} 申请点歌《${data.song || '?'}》`
    case 'queue-approved':
      return `${data.admin || '管理员'} 通过了《${data.song || '?'}》`
    case 'queue-rejected':
      return `${data.admin || '管理员'} 拒绝了《${data.song || '?'}》`
    case 'role-promote':
      return `${data.user || '某人'} 被提升为管理员`
    case 'role-demote':
      return `${data.user || '某人'} 不再是管理员`
    case 'owner-transfer':
      return `${data.user || '某人'} 成为了新房主`
    case 'kick':
      return `${data.user || '某人'} 被 ${data.admin || '管理员'} 移出了房间`
    case 'song-change':
      return `${data.admin || '管理员'} 切歌到《${data.song || '?'}》`
    case 'song-pick':
      return `${data.admin || '管理员'} 选播《${data.song || '?'}》`
    case 'song-skip':
      return `${data.admin || '管理员'} 跳到下一首《${data.song || '?'}》`
    case 'song-prev':
      return `${data.admin || '管理员'} 切回上一首《${data.song || '?'}》`
    default:
      return content
  }
}
