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

          const squareSize = Math.min(naturalWidth, naturalHeight)
          const sx = (naturalWidth - squareSize) / 2
          const sy = (naturalHeight - squareSize) / 2
          const targetSize = Math.max(1, Math.min(squareSize, maxSize))

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