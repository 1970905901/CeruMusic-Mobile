import { describe, expect, it } from 'vitest'
import { isPluginKvKey, toPlain } from './db'

describe('plugin kv scoping', () => {
  it('matches keys that belong to the exact plugin', () => {
    expect(isPluginKvKey('plugin:alpha:token', 'alpha')).toBe(true)
    expect(isPluginKvKey('plugin:alpha:nested:key', 'alpha')).toBe(true)
    expect(isPluginKvKey('plugin:com.example.plugin:token', 'com.example.plugin')).toBe(true)
  })

  it('does not touch a plugin whose id merely starts with this one', () => {
    // 插件 id 只允许 [A-Za-z0-9._-]（见 manifest 校验），因此这些是真实可能的前缀冲突。
    expect(isPluginKvKey('plugin:alphabeta:token', 'alpha')).toBe(false)
    expect(isPluginKvKey('plugin:com.example.plugin2:token', 'com.example.plugin')).toBe(false)
    expect(isPluginKvKey('plugin:com.example.plugin-extra:token', 'com.example.plugin')).toBe(false)
  })

  it('does not match unrelated or malformed keys', () => {
    expect(isPluginKvKey('plugin:other:token', 'alpha')).toBe(false)
    expect(isPluginKvKey('other:alpha:token', 'alpha')).toBe(false)
    expect(isPluginKvKey('plugin:alpha', 'alpha')).toBe(false)
    expect(isPluginKvKey('plugin:alpha_token', 'alpha')).toBe(false)
  })

  it('refuses an empty plugin key so a bad caller cannot wipe everything', () => {
    expect(isPluginKvKey('plugin::token', '')).toBe(false)
    expect(isPluginKvKey('plugin:anything', '')).toBe(false)
  })
})

describe('toPlain', () => {
  it('round-trips plain structures and keeps null/undefined', () => {
    expect(toPlain({ a: 1, b: [2] })).toEqual({ a: 1, b: [2] })
    expect(toPlain(null)).toBeNull()
    expect(toPlain(undefined)).toBeUndefined()
  })

  it('returns the original value when serialisation fails (cyclic input)', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(toPlain(cyclic)).toBe(cyclic)
  })
})
