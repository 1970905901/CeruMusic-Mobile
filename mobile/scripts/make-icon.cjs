/**
 * 把淡薄荷音符重绘成「品牌色底 + 白色音符」。
 *
 * 原图标是白底 + #B8F1CC 音符，放到 iOS 主屏的白色格子或浅色页头里几乎没有对比度。
 * 这里不重画字形，而是按「离白色有多远」得到字形的灰度遮罩，再与品牌色混合：
 * 既保留原始音符轮廓与抗锯齿边缘，又把它落到深色底上。
 */
const sharp = require('sharp')
const path = require('path')

const SRC = path.join(__dirname, '..', 'resources', 'icon.png')
const BRAND = { r: 0x00, g: 0xda, b: 0xc0 }
const GLYPH_MIN_CHANNEL = 184 // 采样自原音符最深处

async function buildIcon(output, { mark = 'square' } = {}) {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const out = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const o = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = channels > 3 ? data[i + 3] : 255

      if (a === 0) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0
        continue
      }

      // 原图只有两簇颜色：白底 ≈240、音符 ≈176（中间过渡像素极少）。
      // 用阈值取二值遮罩，边缘的抗锯齿交给 4x 超采样重建，而不是靠颜色插值——
      // 插值会把原图的中间值铺成一圈浅色毛边。
      const t = Math.min(r, g, b) < 208 ? 1 : 0

      // square 版本：底为品牌色；mark 版本：底透明，仅留白边字形（用于深色/品牌色承载面）。
      if (mark === 'square') {
        out[o] = Math.round(BRAND.r + (255 - BRAND.r) * t)
        out[o + 1] = Math.round(BRAND.g + (255 - BRAND.g) * t)
        out[o + 2] = Math.round(BRAND.b + (255 - BRAND.b) * t)
        out[o + 3] = a
      } else if (mark === 'brand') {
        // 透明底 + 品牌色音符：给页头这类浅色小尺寸位置用，
        // 实心色块在 30px 的标题栏里会显得过重。
        out[o] = BRAND.r
        out[o + 1] = BRAND.g
        out[o + 2] = BRAND.b
        out[o + 3] = Math.round(a * t)
      } else {
        out[o] = out[o + 1] = out[o + 2] = 255
        out[o + 3] = Math.round(a * t)
      }
    }
  }

  // 二值遮罩本身是硬边；先升采样再降采样，用重采样的卷积把边缘化成真正的抗锯齿。
  const upscaled = await sharp(out, { raw: { width, height, channels: 4 } })
    .resize(width * 4, height * 4, { kernel: 'nearest' })
    .png()
    .toBuffer()

  await sharp(upscaled)
    .resize(width, height, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(output)
  return output
}

async function main() {
  const [, , mode] = process.argv
  if (mode === 'preview') {
    const outDir = path.join(__dirname, '..', '.icon-preview')
    require('fs').mkdirSync(outDir, { recursive: true })
    await buildIcon(path.join(outDir, 'icon-square.png'))
    await buildIcon(path.join(outDir, 'icon-mark.png'), { mark: 'glyph' })
    console.log('preview written to', outDir)
    return
  }
  // App 图标源：透明底 + 白色音符。
  // `capacitor-assets` 会自己铺背景色（Android 自适应图标的前景层、iOS 的底），
  // 如果这里再画一层实底，两边都会叠成「色块套色块」，音符反而看不见。
  await buildIcon(path.join(__dirname, '..', 'resources', 'icon.png'), { mark: 'glyph' })
  // 页头 logo：透明底 + 品牌色音符（小尺寸、浅色标题栏上更轻盈）。
  await buildIcon(path.join(__dirname, '..', 'public', 'logo.png'), { mark: 'brand' })
  console.log('icons rebuilt')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
