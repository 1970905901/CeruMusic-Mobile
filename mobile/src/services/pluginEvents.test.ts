import { describe, expect, it } from 'vitest'
import {
  isHostEventName,
  settingsChangedKeys
} from '@/services/pluginEvents'

describe('plugin host events', () => {
  it('recognizes SDK host event names', () => {
    expect(isHostEventName('settings.changed')).toBe(true)
    expect(isHostEventName('theme.changed')).toBe(true)
    expect(isHostEventName('not-an-event')).toBe(false)
  })

  it('returns only changed setting keys', () => {
    expect(settingsChangedKeys({ theme: 'light', accent: '#fff' }, { theme: 'dark', accent: '#fff' })).toEqual([
      'theme'
    ])
    expect(settingsChangedKeys(undefined, { theme: 'dark' })).toEqual(['theme'])
    expect(settingsChangedKeys({ theme: 'dark' }, undefined)).toEqual([])
  })
})
