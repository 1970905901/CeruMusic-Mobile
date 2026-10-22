/**
 * 音源音质交集，对齐桌面版 `MusicSourceSection.vue` 的「全局音质（支持交集）」。
 *
 * 桌面版允许给每个音源单独设音质，再提供一个「所有音源都支持」的交集下拉，
 * 避免选中某个音源才支持的高音质、切到别的音源时静默降级。
 *
 * 移动端只有一个全局 `preferredQuality`（对所有音源生效），所以这里不需要
 * 每源映射，但同样需要「交集」这个判定：给用户列出所有已启用音源都支持的音质，
 * 并识别当前保存的值是否在交集里。
 */

export interface QualitySource {
  /** 音源标识，仅用于去重统计。 */
  id: string
  qualities: readonly string[]
}

/** 归一化用于比较：音质名大小写与空白不应影响是否「同一个音质」。 */
function normalizeQuality(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * 所有音源共同支持的音质，按**第一个音源声明顺序**排序，
 * 与桌面版 `globalQualityOptions` 的顺序语义一致。
 * 没有任何音源时返回空数组。
 */
export function intersectQualities(sources: readonly QualitySource[]): string[] {
  if (!sources.length) return []
  const present = sources.map((source) => {
    const set = new Set<string>()
    for (const quality of source.qualities) {
      const key = normalizeQuality(quality)
      if (key) set.add(key)
    }
    return set
  })
  // 以第一个音源为候选，逐个与后面求交；同时保留第一个音源的原始大小写写法。
  const candidates = sources[0].qualities.filter((quality) => {
    const key = normalizeQuality(quality)
    return key && present.every((set) => set.has(key))
  })
  // 去重但保留首次出现的写法。
  const seen = new Set<string>()
  return candidates.filter((quality) => {
    const key = normalizeQuality(quality)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 某个音质是否被全部音源支持。空值（跟随自动）不算「被支持」。 */
export function isQualitySupportedEverywhere(
  quality: unknown,
  sources: readonly QualitySource[]
): boolean {
  const key = normalizeQuality(quality)
  if (!key) return false
  if (!sources.length) return false
  return sources.every((source) =>
    source.qualities.some((item) => normalizeQuality(item) === key)
  )
}

/**
 * 当前全局音质若不被所有音源支持，返回一个可读的说明；否则返回空字符串。
 * 用于设置页给出提示，而不是悄悄降级。
 */
export function describeQualityCoverage(
  quality: unknown,
  sources: readonly QualitySource[]
): string {
  const value = String(quality ?? '').trim()
  if (!value) return ''
  if (!sources.length) return ''
  if (isQualitySupportedEverywhere(value, sources)) return ''
  const unsupported = sources.filter(
    (source) => !source.qualities.some((item) => normalizeQuality(item) === normalizeQuality(value))
  )
  if (!unsupported.length) return ''
  return `${unsupported.length} 个音源不支持该音质，切换到它们时会自动降级`
}
