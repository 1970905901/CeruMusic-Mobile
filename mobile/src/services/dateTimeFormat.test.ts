import { describe, expect, it } from 'vitest'
import { formatClockTime, formatDateOnly, formatDateTime } from './dateTimeFormat'

const sample = new Date(2026, 9, 30, 21, 20, 0)

describe('date time formatting', () => {
  it('formats date and time in 24-hour form regardless of locale defaults', () => {
    // 通知列表里官方通知卡与互动消息卡此前各用一份实现，
    // 结果是同一屏内出现 12 小时制与 24 小时制两种写法。
    const text = formatDateTime(sample)
    expect(text).toContain('2026')
    expect(text).toMatch(/21:20|21：20/)
    expect(text).not.toMatch(/下午|上午|PM|AM/i)
  })

  it('accepts strings, numbers and Date instances', () => {
    expect(formatDateTime(sample.toISOString())).toBe(formatDateTime(sample))
    expect(formatDateTime(sample.getTime())).toBe(formatDateTime(sample))
  })

  it('keeps date-only and clock-only variants for compact rows', () => {
    expect(formatDateOnly(sample)).toContain('2026')
    expect(formatDateOnly(sample)).not.toMatch(/21:20/)
    expect(formatClockTime(sample)).toMatch(/21:20|21：20/)
    expect(formatClockTime(sample)).not.toContain('2026')
  })

  it('returns an empty string for missing or invalid values', () => {
    // 调用方据此隐藏整行；显示 Invalid Date 比不显示更糟。
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('not a date')).toBe('')
    expect(formatDateOnly('not a date')).toBe('')
    expect(formatClockTime('not a date')).toBe('')
  })
})
