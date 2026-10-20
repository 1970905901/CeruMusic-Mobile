export interface RgbColor {
  r: number
  g: number
  b: number
}

/** Desktop fallback when the artwork cannot be sampled. */
export const DEFAULT_DOMINANT_COLOR: RgbColor = { r: 76, g: 116, b: 206 }

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === red) h = (green - blue) / d + (green < blue ? 6 : 0)
    else if (max === green) h = (blue - red) / d + 2
    else h = (red - green) / d + 4
    h /= 6
  }
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const grey = Math.round(l * 255)
    return [grey, grey, grey]
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ]
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function calculateCentroid(colors: RgbColor[]): RgbColor {
  if (!colors.length) return { r: 0, g: 0, b: 0 }
  let sumR = 0
  let sumG = 0
  let sumB = 0
  for (const color of colors) {
    sumR += color.r
    sumG += color.g
    sumB += color.b
  }
  return {
    r: Math.round(sumR / colors.length),
    g: Math.round(sumG / colors.length),
    b: Math.round(sumB / colors.length)
  }
}

/** Deterministic k-means so identical artwork always yields the same accent. */
function kMeansCluster(colors: RgbColor[], k: number): RgbColor[] {
  if (colors.length <= k) return colors.map((color) => ({ ...color }))
  const centroids: RgbColor[] = []
  const step = Math.max(1, Math.floor(colors.length / k))
  for (let index = 0; index < k; index++) {
    centroids.push({ ...colors[Math.min(index * step, colors.length - 1)] })
  }
  const clusters: RgbColor[][] = Array.from({ length: k }, () => [])
  for (let iteration = 0; iteration < 10; iteration++) {
    for (const cluster of clusters) cluster.length = 0
    for (const color of colors) {
      let closest = 0
      let minDistance = Infinity
      for (let index = 0; index < centroids.length; index++) {
        const distance = colorDistance(color, centroids[index])
        if (distance < minDistance) {
          minDistance = distance
          closest = index
        }
      }
      clusters[closest].push(color)
    }
    let changed = false
    for (let index = 0; index < k; index++) {
      if (!clusters[index].length) continue
      const next = calculateCentroid(clusters[index])
      const current = centroids[index]
      if (next.r !== current.r || next.g !== current.g || next.b !== current.b) {
        centroids[index] = next
        changed = true
      }
    }
    if (!changed) break
  }
  return centroids
}

function mostSaturated(colors: RgbColor[]): RgbColor {
  let best = colors[0]
  let bestSaturation = -1
  for (const color of colors) {
    const { s } = rgbToHsl(color.r, color.g, color.b)
    if (s > bestSaturation) {
      bestSaturation = s
      best = color
    }
  }
  return best
}

function enhanceColor(color: RgbColor): RgbColor {
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b)
  const enhancedS = Math.min(s * 1.2, 0.9)
  const enhancedL = l < 0.3 ? Math.min(l * 1.5, 0.5) : l > 0.7 ? Math.max(l * 0.8, 0.5) : l
  const [r, g, b] = hslToRgb(h, enhancedS, enhancedL)
  return { r, g, b }
}

/** Skips transparent pixels plus near-black/near-white clusters, matching desktop. */
export function dominantColorFromPixels(data: ArrayLike<number>): RgbColor {
  const colors: RgbColor[] = []
  for (let index = 0; index + 3 < data.length; index += 4) {
    if (data[index + 3] < 128) continue
    colors.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
  }
  if (!colors.length) return DEFAULT_DOMINANT_COLOR
  const clusters = kMeansCluster(colors, 5)
  const filtered = clusters.filter((color) => {
    if (color.r < 30 && color.g < 30 && color.b < 30) return false
    if (color.r > 225 && color.g > 225 && color.b > 225) return false
    return true
  })
  const picked = filtered.length ? mostSaturated(filtered) : clusters[0]
  return enhanceColor(picked ?? DEFAULT_DOMINANT_COLOR)
}

/** Desktop lightMainColor: 20% of the way from the dominant color toward white. */
export function lightMainColor(color: RgbColor): string {
  const lighten = (value: number): number => Math.round(255 - (255 - value) * 0.2)
  return `rgba(${lighten(color.r)},${lighten(color.g)},${lighten(color.b)},.9)`
}

const SAMPLE_SIZE = 100

/** Loads an artwork URL and resolves the desktop-equivalent light accent color. */
export function extractLightMainColor(src: string): Promise<string> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(lightMainColor(DEFAULT_DOMINANT_COLOR))
      return
    }
    const image = new Image()
    image.crossOrigin = 'Anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        const context = canvas.getContext('2d')
        if (!context) throw new Error('canvas unavailable')
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        resolve(lightMainColor(dominantColorFromPixels(data)))
      } catch {
        resolve(lightMainColor(DEFAULT_DOMINANT_COLOR))
      }
    }
    image.onerror = () => resolve(lightMainColor(DEFAULT_DOMINANT_COLOR))
    image.src = src
  })
}
