import { describe, expect, it } from 'vitest'
import { pluginAudioDevices, selectPluginAudioDevice } from '@/services/pluginDevices'

describe('plugin audio devices', () => {
  it('exposes the local system output', () => {
    expect(pluginAudioDevices()).toEqual([
      { id: 'local:default', name: '本机扬声器', kind: 'local', available: true }
    ])
  })

  it('allows selecting the local output only', () => {
    expect(() => selectPluginAudioDevice('local:default')).not.toThrow()
    expect(() => selectPluginAudioDevice('dlna:nope')).toThrow('音频设备不可用')
  })
})
