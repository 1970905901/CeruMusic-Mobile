import { describe, expect, it } from 'vitest'
import { filePickerOptions } from './filePickOptions'

/**
 * `files.pick(request)` 的 `multiple` 是**显式**开关：桌面只在它为真时弹多选。
 *
 * 移动端此前写成 `multiple !== false`，所以插件不传 multiple 时也会弹多选；
 * 用户选了五个文件，插件按单文件契约只取第一个，其余静默丢失。
 */
describe('file picker options', () => {
  it('defaults to single selection when multiple is absent', () => {
    expect(filePickerOptions({}).multiple).toBe(false)
    expect(filePickerOptions(undefined).multiple).toBe(false)
    expect(filePickerOptions(null).multiple).toBe(false)
  })

  it('only allows multiple when explicitly true', () => {
    expect(filePickerOptions({ multiple: true }).multiple).toBe(true)
    // 真值不等于契约里的 true：桌面用 `request.multiple ? ... : ...`，
    // 字符串 `"false"` 之类在 JS 里是真值，但这里按严格布尔处理更安全。
    expect(filePickerOptions({ multiple: 1 }).multiple).toBe(false)
    expect(filePickerOptions({ multiple: 'yes' }).multiple).toBe(false)
    expect(filePickerOptions({ multiple: 0 }).multiple).toBe(false)
  })

  it('builds dot-prefixed accept filters and tolerates messy input', () => {
    expect(filePickerOptions({ extensions: ['mp3', '.flac', ' js '] }).accept).toBe(
      '.mp3,.flac,.js'
    )
    expect(filePickerOptions({ extensions: [] }).accept).toBe('')
    expect(filePickerOptions({}).accept).toBe('')
    expect(filePickerOptions({ extensions: 'mp3' }).accept).toBe('')
  })
})
