/**
 * 图片处理通用工具
 * 支持将图片居中裁切为正方形并按比例压缩，减少持久化存储体积
 */

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 将图片裁剪为居中正方形并压缩为指定分辨率与质量的 JPEG Data URL。
 * 若在非浏览器环境（如单元测试无 Canvas）或处理异常，自动降级为普通 Data URL。
 */
export async function compressAndCropToSquare(
  file: Blob | File,
  maxSize = 600,
  quality = 0.85
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return blobToDataUrl(file)
  }

  try {
    const dataUrl = await blobToDataUrl(file)
    if (typeof Image === 'undefined') return dataUrl

    return await new Promise<string>((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          const naturalWidth = img.naturalWidth || img.width
          const naturalHeight = img.naturalHeight || img.height
          if (!naturalWidth || !naturalHeight) {
            resolve(dataUrl)
            return
          }

          const geometry = squareCropGeometry(naturalWidth, naturalHeight, maxSize)
          if (!geometry) {
            resolve(dataUrl)
            return
          }
          const { sx, sy, squareSize, targetSize } = geometry

          const canvas = document.createElement('canvas')
          canvas.width = targetSize
          canvas.height = targetSize
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(dataUrl)
            return
          }

          ctx.drawImage(img, sx, sy, squareSize, squareSize, 0, 0, targetSize, targetSize)
          const result = canvas.toDataURL('image/jpeg', quality)
          resolve(result)
        } catch {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  } catch {
    return blobToDataUrl(file)
  }
}

export interface SquareCropGeometry {
  sx: number
  sy: number
  squareSize: number
  targetSize: number
}

/**
 * 计算「居中裁成正方形 + 等比缩到 maxSize」的取图参数。
 *
 * 抽成纯函数的原因：这段几何之前内联在 canvas 回调里，任何边界
 * （零尺寸、非正方形、maxSize 异常）都只能靠肉眼判断。
 * 返回 null 表示输入不可用，调用方应回落到原始 Data URL。
 */
export function squareCropGeometry(
  width: number,
  height: number,
  maxSize = 600
): SquareCropGeometry | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  const squareSize = Math.min(width, height)
  if (!Number.isFinite(squareSize) || squareSize <= 0) return null
  const limit = Number.isFinite(maxSize) && maxSize > 0 ? maxSize : 600
  return {
    sx: (width - squareSize) / 2,
    sy: (height - squareSize) / 2,
    squareSize,
    targetSize: Math.max(1, Math.min(squareSize, limit))
  }
}
