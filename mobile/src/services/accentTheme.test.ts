import { describe, expect, it } from 'vitest'
import {
  applyIonicPrimary,
  contrastColor,
  ionicPrimaryVars,
  parseHex,
  relativeLuminance
} from './accentTheme'

describe('hex parsing', () => {
  it('accepts #rgb and #rrggbb with or without the hash', () => {
    expect(parseHex('#00b39b')).toEqual({ r: 0, g: 179, b: 155 })
    expect(parseHex('00b39b')).toEqual({ r: 0, g: 179, b: 155 })
    expect(parseHex('#0ab')).toEqual({ r: 0, g: 170, b: 187 })
  })

  it('rejects anything else instead of guessing a colour', () => {
    // 非法值直接跳过，保持主题默认，而不是写入一个透明的强调色。
    expect(parseHex('rgb(0,0,0)')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
})

describe('ionic primary variables', () => {
  it('emits the whole variable group Ionic needs', () => {
    const vars = ionicPrimaryVars('#4f7cff')
    expect(vars).not.toBeNull()
    expect(Object.keys(vars as object).sort()).toEqual(
      [
        '--ion-color-primary',
        '--ion-color-primary-rgb',
        '--ion-color-primary-contrast',
        '--ion-color-primary-contrast-rgb',
        '--ion-color-primary-shade',
        '--ion-color-primary-tint'
      ].sort()
    )
    expect(vars?.['--ion-color-primary']).toBe('#4f7cff')
    expect(vars?.['--ion-color-primary-rgb']).toBe('79, 124, 255')
  })

  it('derives a darker shade and a lighter tint', () => {
    const vars = ionicPrimaryVars('#4f7cff')
    const base = parseHex('#4f7cff')!
    const shade = parseHex(vars!['--ion-color-primary-shade'])!
    const tint = parseHex(vars!['--ion-color-primary-tint'])!
    expect(relativeLuminance(shade)).toBeLessThan(relativeLuminance(base))
    expect(relativeLuminance(tint)).toBeGreaterThan(relativeLuminance(base))
  })

  it('picks readable contrast text for light and dark accents', () => {
    // 浅黄底上白字几乎看不见；深蓝底上黑字同样看不清。
    expect(contrastColor(parseHex('#ffd400')!)).toBe('#08110f')
    expect(contrastColor(parseHex('#1b2a5e')!)).toBe('#ffffff')
    expect(ionicPrimaryVars('#ffd400')?.['--ion-color-primary-contrast']).toBe('#08110f')
  })

  it('returns null for an invalid accent so the theme keeps its defaults', () => {
    expect(ionicPrimaryVars('not-a-color')).toBeNull()
  })
})

describe('applying to the document', () => {
  it('writes the variable group onto the given root', () => {
    const written: Record<string, string> = {}
    const root = {
      style: { setProperty: (name: string, value: string) => (written[name] = value) }
    } as unknown as HTMLElement
    applyIonicPrimary('#a259ff', root)
    expect(written['--ion-color-primary']).toBe('#a259ff')
    expect(Object.keys(written)).toHaveLength(6)
  })

  it('writes nothing for an invalid accent', () => {
    const written: Record<string, string> = {}
    const root = {
      style: { setProperty: (name: string, value: string) => (written[name] = value) }
    } as unknown as HTMLElement
    applyIonicPrimary('', root)
    expect(written).toEqual({})
  })
})
