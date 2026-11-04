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
 * 「文件不存在」；而且每次扫描都跳过它，用户没有任何办法让它消失（只能逐首手动删）。
 *
 * 这里只做判定，删除由 library store 执行。
 */

export interface PrunableRecord {
  key: string
  /** 扫描时记录的归属，形如 `DOCUMENTS:Music/a.mp3`；早期记录没有。 */
  sourcePath?: string
  /** 设备上的绝对路径（早期记录只存了这个）。 */
  path?: string
}

/** 归一化：统一分隔符、忽略大小写、去掉末尾分隔符。 */
function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isUnder(sourcePath: string, directory: string): boolean {
  const path = normalize(sourcePath)
  const dir = normalize(directory)
  if (!dir) return false
  return path === dir || path.startsWith(dir + '/')
}

/**
 * 返回本次扫描应该删掉的记录 key。
 *
 * 两条保险，桌面同口径：
 * - **只清理被扫描目录下的记录**。SAF 授权目录（`content://…`）、这次没扫的
 *   外部存储目录，一条都不能动。
 * - **本次扫描结果为空时不清任何东西**。目录读不出来（权限被撤销、存储卸载）
 *   会让结果为空，照单全收等于把整库本地音乐删光。
 */
export function planLocalPrune(
  records: readonly PrunableRecord[],
  scannedDirectories: readonly string[],
  scannedPaths: readonly string[]
): string[] {
  if (!scannedDirectories.length || !scannedPaths.length) return []
  const keep = new Set(scannedPaths.map(normalize))
  const directories = scannedDirectories.filter(Boolean)
  if (!directories.length) return []
  const result: string[] = []
  for (const record of records) {
    // 没有归属信息的老记录无法判断它属于哪个目录，宁可留着让用户自己删。
    if (!record.sourcePath) continue
    if (!directories.some((directory) => isUnder(record.sourcePath!, directory))) continue
    if (keep.has(normalize(record.sourcePath))) continue
    result.push(record.key)
  }
  return result
}
