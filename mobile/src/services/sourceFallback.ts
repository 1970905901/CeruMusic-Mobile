/**
 * 自动换源，对齐桌面 `utils/audio/audioHelpers.ts` 的 `getCandidateSongs` 与
 * `globaPlayList.ts` 的 `tryAutoNext` / `getAutoNextLimit`。
 *
 * 桌面版在「当前音源解析失败」或「解析出来的地址播放失败」时，会用「歌名 + 歌手」
 * 去其它已启用音源搜索，按相似度与时长相距打分挑出同一首歌，逐个尝试播放，
 * 成功就提示「已自动切换到 X 源播放」。移动端此前没有这层：解析失败直接把错误
 * 写进播放页，用户只能手动换源插件或跳过，队列里一首版权受限的歌会卡住整个列表。
 *
 * 这里只保留**判定**部分（搜索词、候选来源、打分、跳过预算），纯函数、可单测；
 * 真正发请求与起播由播放器 store 编排。
 */

/** 评分阈值：低于它视为「不是同一首歌」，与桌面 `filter(x => x.score > 0.6)` 同口径。 */
export const FALLBACK_SCORE_THRESHOLD = 0.6

/** 时长差在这个范围内视为同一版本（桌面同样取 5 秒）。 */
const CLOSE_DURATION_MS = 5_000
/** 超过这个差值视为明显不同的版本（现场 / 伴奏 / 串烧）。 */
const FAR_DURATION_MS = 40_000

export interface FallbackTrackLike {
  key?: string
  title?: string
  artists?: readonly string[]
  durationMs?: number
}

/**
 * 歌名 / 歌手相似度：bigram Dice 系数，逐行对齐桌面 `strSim`。
 *
 * 取 bigram 而不是编辑距离，是因为中文歌名里多一个「（Live）」「- 伴奏」
 * 这类修饰词时，编辑距离会把整串都算作不同，而 bigram 仍能看出主体相同。
 * 一侧为空（或只有一个字、凑不出 bigram）时返回 0 而不是 NaN——插件不声明
 * 歌手名很常见，NaN 会让排序结果随机。
 */
export function stringSimilarity(left: unknown, right: unknown): number {
  const a = String(left ?? '').toLowerCase().trim()
  const b = String(right ?? '').toLowerCase().trim()
  if (a === b) return 1
  if (!a || !b) return 0
  const bigrams = (text: string): Set<string> => {
    const result = new Set<string>()
    for (let index = 0; index < text.length - 1; index += 1) {
      result.add(text.slice(index, index + 2))
    }
    return result
  }
  const first = bigrams(a)
  const second = bigrams(b)
  if (!first.size || !second.size) return 0
  let shared = 0
  for (const gram of first) if (second.has(gram)) shared += 1
  return (2 * shared) / (first.size + second.size)
}

/** 换源时发给其它音源的搜索词：歌名 + 全部歌手，与桌面 `searchKeyword` 一致。 */
export function searchKeywordFor(track: FallbackTrackLike): string {
  const title = String(track.title ?? '').trim()
  const artists = (track.artists ?? []).map((name) => String(name ?? '').trim()).filter(Boolean)
  return [title, ...artists].filter(Boolean).join(' ')
}

/**
 * 可以尝试换源的音源 id：去掉当前音源、空值与重复项，保持声明顺序。
 *
 * 顺序有意义——桌面同样按 `sourceQualityMap` / `supportedSources` 的键序
 * 依次搜索，排在前面的音源会被优先尝试。
 */
export function fallbackSources(
  sources: readonly string[],
  current: string | undefined
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of sources) {
    const id = String(item ?? '').trim()
    if (!id || id === current || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/** 候选的「像不像同一首歌」得分，对齐桌面：歌名 0.6 / 歌手 0.4，再按时长加减。 */
export function fallbackScore(original: FallbackTrackLike, candidate: FallbackTrackLike): number {
  const nameScore = stringSimilarity(candidate.title, original.title)
  const artistScore = stringSimilarity(
    (candidate.artists ?? []).join(' / '),
    (original.artists ?? []).join(' / ')
  )
  let score = nameScore * 0.6 + artistScore * 0.4
  const originalMs = Number(original.durationMs)
  const candidateMs = Number(candidate.durationMs)
  // 两边都有时长才比较：插件常不声明时长，缺省不该被当成「版本不同」。
  if (originalMs > 0 && candidateMs > 0) {
    const diff = Math.abs(originalMs - candidateMs)
    if (diff <= CLOSE_DURATION_MS) score += 0.2
    else if (diff > FAR_DURATION_MS) score -= 0.3
  }
  return score
}

/**
 * 按得分挑出同一首歌的候选，最像的排在最前。
 *
 * 已经指向原曲的条目直接排除：同一个 key 换回自己只会把同一个失败地址再试一遍。
 */
export function rankFallbackCandidates<T extends FallbackTrackLike>(
  original: FallbackTrackLike,
  candidates: readonly T[]
): T[] {
  return candidates
    .filter((item) => !original.key || item.key !== original.key)
    .map((item) => ({ item, score: fallbackScore(original, item) }))
    .filter((entry) => entry.score > FALLBACK_SCORE_THRESHOLD)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)
}

/**
 * 连续自动跳过的上限：桌面 `getAutoNextLimit` 取「队列长度 × 0.3」，最少 1、最多 10。
 *
 * 上限存在的意义是防止整张歌单都失效时把队列从头翻到尾、每首都弹一次错误；
 * 到达上限后只提示一次「自动下一首失败」，不再继续。
 */
export function autoSkipLimit(queueLength: number): number {
  const length = Number.isFinite(queueLength) ? Math.max(0, Math.floor(queueLength)) : 0
  return Math.min(10, Math.max(1, Math.floor(length * 0.3)))
}

/** 还能不能再自动跳过一首。 */
export function canAutoSkip(skipped: number, limit: number): boolean {
  return Number(skipped) < Number(limit)
}
