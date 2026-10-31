import { describe, expect, it } from 'vitest'
import { assertLocalTagsWritten } from './localTagsWriteResult'

/**
 * `localMusic.writeTags` 的契约是 `Promise<void>`。移动端此前把内部状态
 * `{ success, fileTagWritten, fileTagWarning }` 原样返回，插件拿到的不是它以为的
 * 东西；更糟的是音频文件标签写失败时 store 不抛错，插件以为文件标签改好了，
 * 把歌拷到别的播放器才发现信息没跟着走。
 */
describe('local tag write result', () => {
  it('accepts a fully successful write', () => {
    expect(() => assertLocalTagsWritten({ success: true, fileTagWritten: true })).not.toThrow()
  })

  it('accepts a write where the file needed no tag update', () => {
    // 不是所有格式都能写标签；「没有写文件」本身不是失败。
    expect(() => assertLocalTagsWritten({ success: true, fileTagWritten: false })).not.toThrow()
  })

  it('turns a file-tag warning into a failure the plugin can see', () => {
    expect(() =>
      assertLocalTagsWritten({
        success: true,
        fileTagWritten: false,
        fileTagWarning: '文件只读'
      })
    ).toThrow('写入音频文件失败')
  })

  it('rejects an explicit unsuccessful result', () => {
    expect(() => assertLocalTagsWritten({ success: false })).toThrow('写入标签失败')
  })

  it('tolerates a missing result', () => {
    expect(() => assertLocalTagsWritten(undefined)).not.toThrow()
    expect(() => assertLocalTagsWritten(null)).not.toThrow()
  })
})
