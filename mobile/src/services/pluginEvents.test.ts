import { describe, expect, it } from 'vitest'
import { changedPermissionKeys, isHostEventName, settingsChangedKeys } from './pluginEvents'

describe('host event names', () => {
  it('accepts only SDK-declared events', () => {
    expect(isHostEventName('settings.changed')).toBe(true)
    expect(isHostEventName('theme.changed')).toBe(true)
    expect(isHostEventName('made.up')).toBe(false)
  })
})

describe('settingsChangedKeys', () => {
  it('reports only keys whose value actually changed', () => {
    // 值没变的键不该惊动插件，否则一次无关设置保存会让所有插件重跑一遍。
    expect(
      settingsChangedKeys({ theme: 'light', accent: '#fff' }, { theme: 'dark', accent: '#fff' })
    ).toEqual(['theme'])
  })

  it('treats the first snapshot as every key being new', () => {
    expect(settingsChangedKeys(undefined, { theme: 'dark' })).toEqual(['theme'])
  })

  it('returns nothing when everything disappeared', () => {
    expect(settingsChangedKeys({ theme: 'dark' }, undefined)).toEqual([])
  })
})

describe('changedPermissionKeys', () => {
  it('reports a newly granted key', () => {
    expect(changedPermissionKeys({ p: {} }, {}, { p: { net: true } }, {})).toEqual(['net'])
  })

  it('reports a newly denied key', () => {
    expect(changedPermissionKeys({ p: { net: true } }, {}, { p: {} }, { p: { net: true } })).toEqual([
      'net'
    ])
  })

  it('reports a key revoked entirely', () => {
    expect(changedPermissionKeys({ p: { net: true } }, {}, {}, {})).toEqual(['net'])
  })

  it('returns nothing when the tables are unchanged', () => {
    const granted = { p: { net: true } }
    expect(changedPermissionKeys(granted, {}, { p: { net: true } }, {})).toEqual([])
  })

  it('deduplicates the same key across plugins and ignores falsy entries', () => {
    // 同一个权限键在多个插件下都变了，事件里只需要出现一次。
    expect(
      changedPermissionKeys({}, {}, { a: { net: true }, b: { net: true }, c: { net: false } }, {})
    ).toEqual(['net'])
  })
})
