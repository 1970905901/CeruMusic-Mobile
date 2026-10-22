/**
 * 文字帖封面（桌面端 `community/noteCoverTheme.ts` + `TextNoteCover.vue`）。
 *
 * 桌面版给没有配图的帖子生成一张「音乐随记」卡片：按帖子 id 稳定选一组
 * 纸张配色、版式与手写字体，同一条帖子在列表、详情、下次打开时都是同一张图。
 * 移动端此前无图帖子就是一段纯文字，信息流看起来像聊天记录。
 *
 * 与桌面版的取舍：桌面版打包了 7 款中文手写字体（共约 17 MB），移动端不引入——
 * 17 MB 的安装包增量对一张装饰性封面不划算。这里只用系统手写体候选
 * （KaiTi / STKaiti / 华文楷体等），拿不到时回落到 serif。配色、版式、
 * 角度与种子规则与桌面版保持一致，因此同一条帖子在两端看起来是「同一款」。
 */

export const NOTE_LAYOUTS = ['journal', 'letter', 'quote', 'postcard'] as const
export type NoteLayout = (typeof NOTE_LAYOUTS)[number]

/** 与桌面版完全相同的配色：纸张、晕染、点缀、墨色。 */
const PALETTES: ReadonlyArray<readonly [string, string, string, string]> = [
  ['#f4e8dc', '#e7bfb3', '#d8d8bc', '#654d43'],
  ['#e7eee5', '#b7cdbc', '#e6d8bc', '#415c4e'],
  ['#e8e9f2', '#c7bedc', '#edcbd2', '#574c6d'],
  ['#e7eef2', '#b6d0dc', '#d9dfcf', '#405c6c'],
  ['#f4ecde', '#e6cc98', '#dfbbac', '#6a553b'],
  ['#f1e6e7', '#deb9c3', '#d2c3dc', '#684951']
]

/** 系统手写体候选；顺序即优先级，全部不可用时用 serif。 */
const HAND_FONT_STACK =
  '"KaiTi", "STKaiti", "Kaiti SC", "楷体", "AR PL UKai CN", "Noto Serif SC", serif'

export function hashSeed(seed: string): number {
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return hash
}

/** 稳定版式：同一条帖子永远落在同一个版式上。 */
export function noteCoverLayout(seed: string): NoteLayout {
  return NOTE_LAYOUTS[(hashSeed(seed) >>> 5) % NOTE_LAYOUTS.length]
}

export interface NoteCoverStyle {
  layout: NoteLayout
  fontFamily: string
  /** 直接绑到 style 上的 CSS 变量。 */
  cssVars: Record<string, string>
}

export function noteCoverStyle(seed: string): NoteCoverStyle {
  const hash = hashSeed(seed)
  const [paper, wash, accent, ink] = PALETTES[hash % PALETTES.length]
  return {
    layout: noteCoverLayout(seed),
    fontFamily: HAND_FONT_STACK,
    cssVars: {
      '--note-paper': paper,
      '--note-wash': wash,
      '--note-accent': accent,
      '--note-ink': ink,
      '--note-angle': `${110 + ((hash >>> 8) % 80)}deg`,
      '--note-x': `${15 + ((hash >>> 16) % 65)}%`,
      '--note-y': `${10 + ((hash >>> 24) % 60)}%`
    }
  }
}

/** 封面正文：换行压成空格，超过 60 字截断（与桌面版 PostCard 同口径）。 */
export function noteExcerpt(content: string, limit = 60): string {
  const text = String(content ?? '').replace(/\n+/g, ' ').trim()
  return text.length > limit ? text.slice(0, limit) + '...' : text
}
