import type { RgbColor } from './coverColor'

/**
 * Desktop 四色渐变 (IsolationRenderer) parity for mobile: the artwork is
 * reduced to its main colors and re-expressed as a flowing multi-stop gradient
 * that keeps no cover pattern.
 */
const GRADIENT_STOPS = 4

/** Desktop keeps the cover sampled colors readable over a dark player shell. */
const STOP_ALPHA = 0.72

export function rgbCss(color: RgbColor, alpha = STOP_ALPHA): string {
  return `rgba(${color.r},${color.g},${color.b},${alpha})`
}

/**
 * Builds a radial-gradient layer set from up to four colors. Radials are used
 * instead of a single linear gradient so the colors blend like the desktop
 * mesh flow instead of forming hard bands.
 */
export function fourColorGradientLayers(colors: RgbColor[]): string[] {
  if (!colors.length) return []
  const stops = colors.slice(0, GRADIENT_STOPS)
  const positions = [
    { x: '22%', y: '18%' },
    { x: '78%', y: '24%' },
    { x: '26%', y: '78%' },
    { x: '74%', y: '80%' }
  ]
  return stops.map(
    (color, index) =>
      `radial-gradient(circle at ${positions[index].x} ${positions[index].y}, ` +
      `${rgbCss(color)} 0%, rgba(0,0,0,0) 62%)`
  )
}

/** CSS `background-image` value for the gradient renderer. */
export function fourColorGradientBackground(colors: RgbColor[]): string {
  return fourColorGradientLayers(colors).join(', ')
}
