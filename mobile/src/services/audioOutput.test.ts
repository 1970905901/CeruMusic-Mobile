import { describe, expect, it, vi } from 'vitest'
import {
  SYSTEM_OUTPUT_ID,
  applyAudioOutput,
  canSwitchAudioOutput,
  normalizeAudioOutputs,
  resolveOutputDeviceId,
  supportsSinkSelection
} from './audioOutput'

describe('canSwitchAudioOutput', () => {
  it('requires both setSinkId and device enumeration', () => {
    expect(canSwitchAudioOutput({ canSetSinkId: true, canEnumerate: true })).toBe(true)
    expect(canSwitchAudioOutput({ canSetSinkId: true, canEnumerate: false })).toBe(false)
    expect(canSwitchAudioOutput({ canSetSinkId: false, canEnumerate: true })).toBe(false)
  })
})

describe('normalizeAudioOutputs', () => {
  it('keeps audiooutput entries, dedupes and puts default first', () => {
    const devices = normalizeAudioOutputs([
      { deviceId: 'speaker', kind: 'audiooutput', label: '显示器扬声器' },
      { deviceId: 'default', kind: 'audiooutput', label: '系统默认' },
      { deviceId: 'mic', kind: 'audioinput', label: '麦克风' },
      { deviceId: 'speaker', kind: 'audiooutput', label: '重复项' }
    ])
    expect(devices.map((device) => device.deviceId)).toEqual(['default', 'speaker'])
    expect(devices[0].isDefault).toBe(true)
    expect(devices[1]).toMatchObject({ label: '显示器扬声器', isDefault: false })
  })

  it('fills labels for privacy-blurred and special devices', () => {
    const devices = normalizeAudioOutputs([
      { deviceId: 'default', kind: 'audiooutput', label: '' },
      { deviceId: 'communications', kind: 'audiooutput' },
      { deviceId: 'hdmi1', kind: 'audiooutput', label: '   ' }
    ])
    expect(devices.map((device) => device.label)).toEqual([
      '系统默认输出',
      '通话音输出',
      '未知输出设备'
    ])
  })

  it('handles empty and malformed lists', () => {
    expect(normalizeAudioOutputs([])).toEqual([])
    expect(normalizeAudioOutputs(undefined as any)).toEqual([])
  })
})

describe('resolveOutputDeviceId', () => {
  const devices = [
    { deviceId: 'default', label: '系统默认输出', isDefault: true },
    { deviceId: 'speaker', label: '扬声器', isDefault: false }
  ]

  it('keeps a valid saved device', () => {
    expect(resolveOutputDeviceId('speaker', devices)).toBe('speaker')
  })

  it('falls back to the system default when the device disappeared', () => {
    expect(resolveOutputDeviceId('bluetooth', devices)).toBe(SYSTEM_OUTPUT_ID)
    expect(resolveOutputDeviceId('', devices)).toBe(SYSTEM_OUTPUT_ID)
    expect(resolveOutputDeviceId(undefined, devices)).toBe(SYSTEM_OUTPUT_ID)
  })
})

describe('supportsSinkSelection and applyAudioOutput', () => {
  it('detects sink support structurally', () => {
    expect(supportsSinkSelection(null)).toBe(false)
    expect(supportsSinkSelection({})).toBe(false)
    expect(supportsSinkSelection({ setSinkId: vi.fn() })).toBe(true)
  })

  it('calls setSinkId with a trimmed id and reports support', async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined)
    await expect(applyAudioOutput({ setSinkId }, ' speaker ')).resolves.toBe(true)
    expect(setSinkId).toHaveBeenCalledWith('speaker')
  })

  it('falls back to the default id and returns false when unsupported', async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined)
    await applyAudioOutput({ setSinkId }, '')
    expect(setSinkId).toHaveBeenCalledWith(SYSTEM_OUTPUT_ID)
    await expect(applyAudioOutput({}, 'speaker')).resolves.toBe(false)
  })
})