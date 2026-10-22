import { describe, expect, it } from 'vitest'
import {
  CONSENT_ITEMS,
  CONSENT_VERSION,
  buildConsentRecord,
  consentComplete,
  formatConsentDate,
  readConsentRecord
} from './shareConsent'

describe('consent completion', () => {
  it('requires every clause to be checked', () => {
    // 只勾两项就允许分享等于把合规承诺当成一个装饰性开关。
    expect(consentComplete([true, true, false])).toBe(false)
    expect(consentComplete([true, true, true])).toBe(true)
    expect(consentComplete([])).toBe(false)
    expect(consentComplete([true])).toBe(false)
  })

  it('keeps the desktop wording', () => {
    expect(CONSENT_ITEMS).toHaveLength(3)
    expect(CONSENT_ITEMS[0]).toBe('该插件及音源由我合法取得或已获得授权')
  })
})

describe('consent record', () => {
  const now = new Date('2026-10-22T10:00:00.000Z').getTime()

  it('round-trips a fresh record', () => {
    const record = buildConsentRecord(new Date(now))
    expect(record.version).toBe(CONSENT_VERSION)
    expect(readConsentRecord(JSON.stringify(record), now)).toEqual(record)
  })

  it('rejects a record from an older clause version', () => {
    // 条款改过之后旧承诺不能继续生效。
    const stale = JSON.stringify({ version: CONSENT_VERSION - 1, timestamp: new Date(now).toISOString() })
    expect(readConsentRecord(stale, now)).toBeNull()
  })

  it('rejects malformed or empty storage', () => {
    expect(readConsentRecord(null, now)).toBeNull()
    expect(readConsentRecord('', now)).toBeNull()
    expect(readConsentRecord('not json', now)).toBeNull()
    expect(readConsentRecord('[]', now)).toBeNull()
    expect(readConsentRecord(JSON.stringify({ version: CONSENT_VERSION }), now)).toBeNull()
    expect(readConsentRecord(JSON.stringify({ version: CONSENT_VERSION, timestamp: 'x' }), now)).toBeNull()
  })

  it('rejects a timestamp far in the future', () => {
    // 时钟被改过或手工写入的记录不可信，宁可重新确认。
    const future = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(readConsentRecord(JSON.stringify({ version: CONSENT_VERSION, timestamp: future }), now)).toBeNull()
  })
})

describe('consent date formatting', () => {
  it('formats as year/month/day like desktop', () => {
    const value = new Date(2026, 9, 22, 8, 30).toISOString()
    expect(formatConsentDate(value)).toBe('2026/10/22')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatConsentDate('nope')).toBe('')
  })
})
