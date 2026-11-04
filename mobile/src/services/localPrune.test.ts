import { describe, expect, it } from 'vitest'
import { planLocalPrune } from './localPrune'

/**
 * 本地音乐索引的「按扫描清理」，对齐桌面 `LocalMusicIndexService.pruneByScan`
 * → `MusicDatabase.pruneOutsideKeep`：
 *
 * ```ts
 * const underScanned = dirPrefixes.some(d => normalizedPath.startsWith(d))
 * if (underScanned && !keepSet.has(path)) removeIds.push(songmid)
 * ```
 *
 * 桌面每次扫描完把「位于被扫描目录下、但这次没扫到」的记录删掉。移动端从不清理：
 * 在系统文件管理器里删掉一首歌再重新扫描，它仍留在本地音乐列表里，点开只得到
 * 「文件不存在」——而且每次扫描都跳过它，用户没有任何办法让它消失。
 *
 * 这里只做判定。三条边界必须守住：
 * - 只清理**被扫描目录下**的记录。SAF 授权目录、外部存储里本次没扫的目录，
 *   一条都不能动（桌面同样按前缀过滤）。
 * - 本次扫到的路径全部保留（大小写与路径分隔符差异要归一化）。
 * - 扫描结果为空时不清任何东西：一次读取失败（权限被撤销、存储不可用）会让
 *   `files` 为空，照单全收等于把整库本地音乐删光。
 */

interface Record {
  key: string
  sourcePath?: string
  path?: string
}

function record(key: string, sourcePath: string): Record {
  return { key, sourcePath }
}

describe('planLocalPrune', () => {
  it('removes records under a scanned directory that the scan did not find', () => {
    const records = [
      record('a', 'DOCUMENTS:Music/a.mp3'),
      record('b', 'DOCUMENTS:Music/b.mp3'),
      record('gone', 'DOCUMENTS:Music/deleted.mp3')
    ]
    const keep = ['DOCUMENTS:Music/a.mp3', 'DOCUMENTS:Music/b.mp3']
    expect(planLocalPrune(records, ['DOCUMENTS:Music'], keep)).toEqual(['gone'])
  })

  it('leaves records outside the scanned directories alone', () => {
    // SAF 授权目录（content://…）与这次没扫的外部存储目录都在这条规则之外。
    const records = [
      record('saf', 'content://com.android.externalstorage.documents/tree/x/song.mp3'),
      record('other', 'EXTERNAL:D积云/歌.mp3'),
      record('gone', 'DOCUMENTS:Music/deleted.mp3')
    ]
    const keep = ['DOCUMENTS:Music/still-here.mp3']
    expect(planLocalPrune(records, ['DOCUMENTS:Music'], keep)).toEqual(['gone'])
  })

  it('compares paths case-insensitively and ignores separators', () => {
    // Android 的文件名大小写与扫描回来的分隔符都可能与记录不一致；
    // 按字面比较会把仍然存在的歌当成已删除。
    const records = [record('a', 'DOCUMENTS:Music/Song.MP3')]
    expect(planLocalPrune(records, ['DOCUMENTS:Music'], ['documents:music\\song.mp3'])).toEqual([])
  })

  it('refuses to prune when the scan found nothing', () => {
    // 目录读不出来（权限撤销、存储卸载）时 `files` 为空：这时清空索引等于
    // 把用户的本地音乐全部删掉。
    const records = [record('a', 'DOCUMENTS:Music/a.mp3')]
    expect(planLocalPrune(records, ['DOCUMENTS:Music'], [])).toEqual([])
  })

  it('refuses to prune when no directory was actually scanned', () => {
    const records = [record('a', 'DOCUMENTS:Music/a.mp3')]
    expect(planLocalPrune(records, [], ['DOCUMENTS:Music/a.mp3'])).toEqual([])
  })

  it('ignores records without a source path (old imports kept only a device path)', () => {
    // 早期版本只存 `path`（设备绝对路径），没有 `sourcePath`，无法判断归属目录。
    const records = [{ key: 'legacy', path: '/var/mobile/x.mp3' }, record('gone', 'DOCUMENTS:M/x.mp3')]
    expect(planLocalPrune(records, ['DOCUMENTS:M'], ['DOCUMENTS:M/kept.mp3'])).toEqual(['gone'])
  })
})
