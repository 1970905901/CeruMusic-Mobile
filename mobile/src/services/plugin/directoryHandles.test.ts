import { describe, expect, it } from 'vitest'
import { resolveDownloadDirectory, type PickedDirectory } from './directoryHandles'

/**
 * `downloads.create({ directory })` 里的目录句柄来自 `files.pickDirectory`。
 * 插件指定下载到它自己选的文件夹时，宿主必须按句柄 id 找回那一次选择；
 * 找不到就报错，而不是悄悄退回默认目录（那样歌会落在用户找不到的地方）。
 */
function mapOf(...entries: Array<[string, PickedDirectory]>): Map<string, PickedDirectory> {
  return new Map(entries)
}

describe('plugin directory handles', () => {
  it('resolves the folder the plugin was given', () => {
    const picked = mapOf(['dir-1', { uri: 'content://tree/sdcard%2FMusic', name: 'Music' }])
    expect(resolveDownloadDirectory({ kind: 'directory', id: 'dir-1', name: 'Music' }, picked)).toBe(
      'content://tree/sdcard%2FMusic'
    )
  })

  it('treats a missing directory request as "use the configured folder"', () => {
    // 不传目录是合法用法（桌面同样回落到设置里的下载位置）。
    expect(resolveDownloadDirectory(undefined, mapOf())).toBeUndefined()
    expect(resolveDownloadDirectory(null, mapOf())).toBeUndefined()
  })

  it('rejects an expired handle instead of silently using the default folder', () => {
    const picked = mapOf(['dir-1', { uri: 'content://tree/old', name: 'Old' }])
    expect(() => resolveDownloadDirectory({ kind: 'directory', id: 'dir-2' }, picked)).toThrow(
      '目录句柄已过期'
    )
    // 插件停止/重启后句柄表被清空，同样要报错而不是落到默认目录。
    expect(() => resolveDownloadDirectory({ kind: 'directory', id: 'dir-1' }, mapOf())).toThrow(
      '目录句柄已过期'
    )
  })

  it('rejects malformed handles', () => {
    expect(() => resolveDownloadDirectory('dir-1', mapOf())).toThrow('目录句柄无效')
    expect(() => resolveDownloadDirectory([], mapOf())).toThrow('目录句柄无效')
    expect(() => resolveDownloadDirectory({ kind: 'directory' }, mapOf())).toThrow('目录句柄无效')
  })
})
