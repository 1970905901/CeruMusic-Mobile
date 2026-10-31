import { describe, expect, it } from 'vitest'
import { isKnownToastLevel, toastColorFor } from './toastLevel'

/**
 * `ui.toast` 的 `level` 桌面按白名单着色（info / success / warning / error）。
 * 移动端此前整个丢掉 level：插件报错时用户看到的是和普通提示一模一样的
 * 中性色，「出错了」被读成「搞定了」。
 */
describe('plugin toast level', () => {
  it('maps the documented levels to distinct colors', () => {
    expect(toastColorFor('success')).toBe('success')
    expect(toastColorFor('warning')).toBe('warning')
    expect(toastColorFor('error')).toBe('danger')
    expect(toastColorFor('info')).toBe('primary')
  })

  it('accepts messy casing and whitespace', () => {
    expect(toastColorFor(' ERROR ')).toBe('danger')
    expect(toastColorFor('Warning')).toBe('warning')
  })

  it('falls back to a neutral color for missing or unknown levels', () => {
    // 与桌面白名单同口径：不认识的值不当成成功也不当成失败。
    expect(toastColorFor(undefined)).toBe('medium')
    expect(toastColorFor('debug')).toBe('medium')
    expect(toastColorFor(1)).toBe('medium')
  })

  it('reports which levels are recognised', () => {
    expect(isKnownToastLevel('error')).toBe(true)
    expect(isKnownToastLevel('debug')).toBe(false)
    expect(isKnownToastLevel(undefined)).toBe(false)
  })

  it('keeps error distinguishable from success', () => {
    // 这是整件事的意义：两者不能落在同一个颜色上。
    expect(toastColorFor('error')).not.toBe(toastColorFor('success'))
  })
})
