/**
 * NSFW（违规图片）本地检测，对齐桌面版 `utils/nsfwCheck.ts`。
 *
 * 同样的体积纪律：只经 `nsfwjs/core` + `nsfwjs/models/mobilenet_v2` 打入
 * 3.5MB 的轻量模型权重，绝不 `import * as nsfwjs`（那会连带 InceptionV3
 * ~28MB + MobileNetV2Mid 5.5MB）。
 *
 * 移动端差异：iOS 14.0–14.3 的 WKWebView 没有 WebGL2，tfjs 无法初始化
 * 后端——检测不可用时**放行并提示**（fail-open），而不是把上传整个卡死；
 * 桌面版遇到模型加载失败也是上层 catch 后继续上传，口径一致。
 */
import { load, type NSFWJS } from 'nsfwjs/core'
import { MobileNetV2Model } from 'nsfwjs/models/mobilenet_v2'

/** 桌面版同款阈值：数值越小越严格。 */
const UNSAFE_THRESHOLDS: Record<string, number> = {
  Hentai: 0.6,
  Porn: 0.6,
  Sexy: 0.8
}

let model: NSFWJS | null = null
let loading: Promise<void> | null = null
/** 检测能力是否已确认不可用（老 WebView 无 WebGL2）。此后直接放行。 */
let unavailable = false

async function ensureModel(): Promise<void> {
  if (model) return
  if (unavailable) throw new Error('model-unavailable')
  if (!loading) {
    loading = (async () => {
      try {
        model = await load('MobileNetV2', { modelDefinitions: [MobileNetV2Model] })
      } catch (error) {
        // WebGL 后端初始化失败基本等于这台设备的 WebView 跑不了模型。
        unavailable = true
        throw error
      } finally {
        loading = null
      }
    })()
  }
  await loading
}

function getImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败，无法进行内容检测'))
    if (typeof source !== 'string') img.src = URL.createObjectURL(source)
    else img.src = source
  })
}

export interface NsfwCheckResult {
  safe: boolean
  /** 检测没有跑起来（设备不支持 / 图片解码失败）——放行但告知未检测。 */
  skipped: boolean
  reason?: string
}

/**
 * 检测上传图片是否安全。与桌面版 `checkImageIsSafe` 的关键区别在错误语义：
 * 桌面版把异常抛给上层各自 catch；这里收敛成 `{ safe, skipped }`——
 * 拦截（false）与放行（true）都只有一处判定，调用方不再各自决定失败口径。
 */
export async function checkUploadImageSafe(
  source: File | Blob | string
): Promise<NsfwCheckResult> {
  try {
    await ensureModel()
    if (!model) return { safe: true, skipped: true, reason: 'model-unavailable' }
    const img = await getImageElement(source)
    let predictions: Array<{ className: string; probability: number }>
    try {
      predictions = await model.classify(img)
    } finally {
      if (typeof source !== 'string') URL.revokeObjectURL(img.src)
    }
    for (const prediction of predictions) {
      const threshold = UNSAFE_THRESHOLDS[prediction.className]
      if (threshold !== undefined && prediction.probability > threshold) {
        return { safe: false, skipped: false, reason: prediction.className }
      }
    }
    return { safe: true, skipped: false }
  } catch (error) {
    console.warn('NSFW 图片检测未执行（放行）:', error)
    return { safe: true, skipped: true, reason: error instanceof Error ? error.message : 'unknown' }
  }
}

/** 纯函数判定导出：预测列表是否越过阈值（单测锁定阈值口径）。 */
export function predictionViolates(
  predictions: Array<{ className: string; probability: number }>
): string | null {
  for (const prediction of predictions) {
    const threshold = UNSAFE_THRESHOLDS[prediction.className]
    if (threshold !== undefined && prediction.probability > threshold) return prediction.className
  }
  return null
}
