import { describe, expect, it } from 'vitest'
import { downloadEventTarget } from './downloadEventScope'

describe('download event scope', () => {
  it('targets the plugin that created the task', () => {
    expect(downloadEventTarget({ pluginKey: 'plugin-a' })).toBe('plugin-a')
  })

  it('does not broadcast tasks the user started in the app', () => {
    // 桌面端只推给发起者；移动端此前把这类任务也广播给所有插件。
    expect(downloadEventTarget({})).toBeUndefined()
    expect(downloadEventTarget({ pluginKey: '' })).toBeUndefined()
    expect(downloadEventTarget({ pluginKey: '   ' })).toBeUndefined()
  })

  it('tolerates a missing task', () => {
    expect(downloadEventTarget(null)).toBeUndefined()
    expect(downloadEventTarget(undefined)).toBeUndefined()
  })

  it('trims the key so a padded value still resolves', () => {
    expect(downloadEventTarget({ pluginKey: ' plugin-a ' })).toBe('plugin-a')
  })
})
