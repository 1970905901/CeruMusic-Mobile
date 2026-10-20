/**
 * 音质显示名与选项文案。
 *
 * 与桌面版同源，桌面实现分别在 `src/common/utils/quality.ts`
 * （DISPLAY_NAME_MAP / getQualityDisplayName）和
 * `views/settings/sections/MusicSourceSection.vue`（getQualityDescription）。
 * 音质优先级排序仍由 `services/mediaCache.ts` 与插件清单顺序负责，这里只做展示。
 */

export interface QualityOption {
  value: string
  label: string
}

/** 插件自定义音质类型与中文显示名的映射（与桌面 DISPLAY_NAME_MAP 保持一致）。 */
export const QUALITY_DISPLAY_NAMES: Record<string, string> = {
  low: '标准',
  standard: '高品质',
  high: '超高品质',
  lossless: '无损',
  '128k': '标准',
  '192k': '高品',
  '320k': '超高',
  flac: '无损',
  flac24bit: '超高解析',
  hires: '高清臻音',
  atmos: '全景环绕',
  atmos_plus: '全景增强',
  master: '超清母带'
}

/** 音质说明文案（与桌面 MusicSourceSection.getQualityDescription 一致）。 */
const QUALITY_DESCRIPTIONS: Record<string, string> = {
  low: '适合网络较慢的环境，节省流量',
  standard: '平衡音质与文件大小，推荐选择',
  high: '高音质体验，适合有线网络',
  lossless: '最佳音质体验，需要较好的网络环境',
  '128k': '基础音质，文件较小',
  '192k': '良好音质，适合大多数场景',
  '320k': '高品质音质，接近CD品质',
  flac: '无损音质，完美还原原始录音',
  flac24bit: '更饱满清晰的高解析度音质，最高192kHz/24bit',
  hires: '声音听感加强，96kHz/24bit',
  atmos: '沉浸式空间环绕音感，最高5.1声道',
  atmos_plus: '音源提供的增强环绕音质',
  master: '母带级音质,192kHz/24bit'
}

const UNKNOWN_QUALITY_DESCRIPTION = '自定义音质设置'

/** 音质既可能是裸类型字符串，也可能是插件的 { type, size } 描述对象。 */
export type QualityInput = string | { type?: string } | null | undefined

function qualityTypeOf(quality: QualityInput): string {
  if (quality && typeof quality === 'object') return String(quality.type ?? '').trim()
  return String(quality ?? '').trim()
}

/** 统一获取音质中文显示名称；未收录的类型原样返回。 */
export function getQualityDisplayName(quality: QualityInput): string {
  const type = qualityTypeOf(quality)
  if (!type) return ''
  return QUALITY_DISPLAY_NAMES[type] || type
}

/** 音质说明文案；未知类型回落到通用文案。 */
export function getQualityDescription(quality: QualityInput): string {
  const type = qualityTypeOf(quality)
  if (!type) return UNKNOWN_QUALITY_DESCRIPTION
  return QUALITY_DESCRIPTIONS[type] || UNKNOWN_QUALITY_DESCRIPTION
}

/**
 * 汇总多个音质列表为一个去重序列，保留首次出现顺序。
 * 插件清单中音质由低到高声明，因此这里的顺序即由低到高。
 */
export function collectQualityTypes(lists: readonly (readonly string[] | undefined)[]): string[] {
  const order: string[] = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const value = String(item ?? '').trim()
      if (value && !order.includes(value)) order.push(value)
    }
  }
  return order
}

/**
 * 构建设置页下拉选项：首选一项为「未指定」占位，其后是各音质的显示名。
 */
export function buildQualitySelectOptions(
  types: readonly string[],
  emptyLabel: string
): QualityOption[] {
  const options: QualityOption[] = [{ value: '', label: emptyLabel }]
  for (const type of types) {
    options.push({ value: type, label: getQualityDisplayName(type) || type })
  }
  return options
}

/**
 * 把已保存的音质并入候选列表。
 *
 * 已保存值可能来自当前已卸载或已禁用的插件，若不在候选中，`ion-select` 会匹配失败
 * 而显示空白，用户也就看不到自己选的是什么。因此这些值必须保留在选项末尾。
 */
export function mergeSavedQualityTypes(
  types: readonly string[],
  saved: readonly (string | null | undefined)[]
): string[] {
  const merged = [...types]
  for (const value of saved) {
    const type = String(value ?? '').trim()
    if (type && !merged.includes(type)) merged.push(type)
  }
  return merged
}

/** 无损容器扩展名（对应桌面 getLocalQualityLabel 的扩展名分支）。 */
const LOSSLESS_EXTENSIONS = ['flac', 'wav', 'ape', 'dsd', 'dff']

/**
 * 本地文件的音质标签。移动端本地曲目不带 sampleRate/bitrate，
 * 因此只能按扩展名推断（桌面版优先用采样率与码率，这里的兜底分支与之相同）。
 */
export function getLocalFileQualityLabel(fileName: string | undefined): string {
  const extension = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
  if (!extension) return ''
  return LOSSLESS_EXTENSIONS.includes(extension) ? '无损' : ''
}
