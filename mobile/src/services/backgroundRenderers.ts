/**
 * Desktop `config/backgroundRenderers.ts` parity for the mobile player page.
 * The values intentionally match desktop so a future shared settings document
 * keeps the same renderer identity; mobile expresses each renderer with CSS
 * layers instead of the AMLL WebGL renderers.
 */
const RENDERER_VALUES = ['pixi', 'mesh', 'isolation'] as const

export type BackgroundRendererType = (typeof RENDERER_VALUES)[number]

export interface BackgroundRendererOption {
  value: BackgroundRendererType
  label: string
  description: string
  /** Desktop parity: only 网格渐变 reacts to the low-frequency beat. */
  supportsBeat: boolean
}

export const backgroundRenderers: readonly BackgroundRendererOption[] = [
  {
    value: 'pixi',
    label: '经典流动',
    description: '封面叠层旋转、模糊成柔和彩色云雾，不随鼓点变化',
    supportsBeat: false
  },
  {
    value: 'mesh',
    label: '网格渐变',
    description: '柔化封面轮廓形成流动色块，可随低频鼓点缩放与明暗变化',
    supportsBeat: true
  },
  {
    value: 'isolation',
    label: '四色渐变',
    description: '提取封面四个主色生成流动渐变，不保留封面图案',
    supportsBeat: false
  }
]

export function getBackgroundRenderer(value: string): BackgroundRendererOption {
  return backgroundRenderers.find((renderer) => renderer.value === value) ?? backgroundRenderers[0]
}

/** Desktop parity for `playSetting.getBackgroundSupportsBeat`. */
export function backgroundSupportsBeat(value: string): boolean {
  return getBackgroundRenderer(value).supportsBeat
}
