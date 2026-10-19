import { describe, expect, it } from 'vitest'
import {
  pluginSettingsGet,
  pluginSettingsUpdate
} from '@/services/pluginSettings'

describe('plugin settings', () => {
  it('reads only public settings', () => {
    expect(
      pluginSettingsGet(
        ['theme', 'aiApiKey', 'grantedPermissions'],
        { theme: 'dark', accent: '#fff', aiApiKey: 'secret', grantedPermissions: {} }
      )
    ).toEqual({ theme: 'dark' })
  })

  it('rejects oversized key lists', () => {
    expect(() =>
      pluginSettingsGet(Array.from({ length: 51 }, (_, index) => `key${index}`), {})
    ).toThrow('设置项列表无效')
  })

  it('updates only public settings and reports changed keys', () => {
    const settings: Record<string, any> = { theme: 'dark', accent: '#fff', aiApiKey: 'secret' }
    const changed = pluginSettingsUpdate({ theme: 'light' }, settings)
    expect(changed).toEqual(['theme'])
    expect(settings).toEqual({ theme: 'light', accent: '#fff', aiApiKey: 'secret' })
  })

  it('rejects invalid values and oversized payloads', () => {
    const settings: Record<string, any> = {}
    expect(() => pluginSettingsUpdate(null, settings)).toThrow('设置值无效')
    expect(() => pluginSettingsUpdate({ aiApiKey: 'secret' }, settings)).toThrow(
      '包含不可由插件修改的设置：aiApiKey'
    )
    expect(() => pluginSettingsUpdate({ theme: 'x'.repeat(33 * 1024) }, settings)).toThrow(
      '设置数据过大'
    )
  })
})
