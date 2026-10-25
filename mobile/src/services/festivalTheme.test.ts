import { describe, expect, it } from 'vitest'
import { isSpringFestivalWindow, shouldUseFestivalTheme } from './festivalTheme'

const at = (ymd: string) => new Date(ymd + 'T12:00:00')

describe('spring festival window', () => {
  it('matches the desktop hardcoded window exactly', () => {
    // 桌面版窗口是 2026-02-17 ~ 2026-02-23 的固定日期段，两端必须一致，
    // 否则同一时段手机和电脑看到的主题不同。
    expect(isSpringFestivalWindow(at('2026-02-17'))).toBe(true)
    expect(isSpringFestivalWindow(at('2026-02-23'))).toBe(true)
    expect(isSpringFestivalWindow(at('2026-02-16'))).toBe(false)
    expect(isSpringFestivalWindow(at('2026-02-24'))).toBe(false)
    expect(isSpringFestivalWindow(at('2025-02-20'))).toBe(false)
  })
})

describe('festival theme decision', () => {
  it('is on inside the window and off outside', () => {
    expect(shouldUseFestivalTheme({}, at('2026-02-20'))).toBe(true)
    expect(shouldUseFestivalTheme({}, at('2026-03-01'))).toBe(false)
  })

  it('can be disabled by the user even inside the window', () => {
    // 设置页的「关闭春节主题」必须对窗口内的日期也生效。
    expect(shouldUseFestivalTheme({ disabled: true }, at('2026-02-20'))).toBe(false)
  })

  it('honors the desktop preview flag outside the window', () => {
    expect(shouldUseFestivalTheme({ preview: '1' }, at('2026-06-01'))).toBe(true)
    expect(shouldUseFestivalTheme({ preview: '0' }, at('2026-06-01'))).toBe(false)
  })

  it('keeps preview from overriding an explicit disable', () => {
    // 用户主动关闭的优先级最高，预览开关不能把它顶回去。
    expect(shouldUseFestivalTheme({ preview: '1', disabled: true }, at('2026-06-01'))).toBe(false)
  })
})
