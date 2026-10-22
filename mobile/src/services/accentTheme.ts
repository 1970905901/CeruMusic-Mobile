/**
 * 把强调色同步到 Ionic 的 primary 色组。
 *
 * Ionic 的按钮、开关、进度条、分段控件只认 `--ion-color-primary*` 这一组变量，
 * 应用自绘的部分认 `--ceru-brand`。设置页的强调色此前只写后者，于是换了颜色后
 * 两套强调色并存（自绘卡片变色、Ionic 控件仍是青绿）。
 *
 * 变体算法与 Ionic 官方 palette 一致：shade 混 12% 黑、tint 混 10% 白，
 * contrast 按亮度选黑或白，保证文字在任意强调色上都可读。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** 解析 `#rgb` / `#rrggbb`；非法输入返回 null。 */
export function parseHex(value: string): Rgb | null {
  const hex = String(value ?? '').trim().replace(/^#/, '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function toHex({ r, g, b }: Rgb): string {
  return '#' + [r, g, b].map((value) => clamp(value).toString(16).padStart(2, '0')).join('')
}

/** Ionic 的 shade：向黑色混合 `weight`（0–1）。 */
export function shade(color: Rgb, weight = 0.12): Rgb {
  return { r: color.r * (1 - weight), g: color.g * (1 - weight), b: color.b * (1 - weight) }
}

/** Ionic 的 tint：向白色混合 `weight`（0–1）。 */
export function tint(color: Rgb, weight = 0.1): Rgb {
  return {
    r: color.r + (255 - color.r) * weight,
    g: color.g + (255 - color.g) * weight,
    b: color.b + (255 - color.b) * weight
  }
}

/** WCAG 相对亮度，用于挑对比色。 */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const x = value / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * 强调色上的文字颜色：亮底用深墨色，暗底用白色。
 * 阈值取 0.179（WCAG 对比度 4.5:1 的分界），比「看起来亮不亮」更可靠。
 */
export function contrastColor(color: Rgb): string {
  return relativeLuminance(color) > 0.179 ? '#08110f' : '#ffffff'
}

export interface IonicPrimaryVars {
  '--ion-color-primary': string
  '--ion-color-primary-rgb': string
  '--ion-color-primary-contrast': string
  '--ion-color-primary-contrast-rgb': string
  '--ion-color-primary-shade': string
  '--ion-color-primary-tint': string
}

/** 生成 Ionic 需要的整组 primary 变量；输入非法时返回 null（保持主题默认）。 */
export function ionicPrimaryVars(accent: string): IonicPrimaryVars | null {
  const color = parseHex(accent)
  if (!color) return null
  const contrast = contrastColor(color)
  const contrastRgb = parseHex(contrast)
  return {
    '--ion-color-primary': toHex(color),
    '--ion-color-primary-rgb': `${clamp(color.r)}, ${clamp(color.g)}, ${clamp(color.b)}`,
    '--ion-color-primary-contrast': contrast,
    '--ion-color-primary-contrast-rgb': contrastRgb
      ? `${contrastRgb.r}, ${contrastRgb.g}, ${contrastRgb.b}`
      : '255, 255, 255',
    '--ion-color-primary-shade': toHex(shade(color)),
    '--ion-color-primary-tint': toHex(tint(color))
  }
}

/** 把整组变量写到根元素上；失败或非法输入时静默跳过。 */
export function applyIonicPrimary(accent: string, root?: HTMLElement): void {
  const vars = ionicPrimaryVars(accent)
  if (!vars) return
  const target = root ?? (typeof document !== 'undefined' ? document.documentElement : undefined)
  if (!target) return
  for (const [name, value] of Object.entries(vars)) target.style.setProperty(name, value)
}
