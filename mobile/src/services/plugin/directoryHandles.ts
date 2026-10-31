/**
 * 插件目录句柄 → 宿主内部目录。
 *
 * `files.pickDirectory` 交给插件的只是一个不透明句柄（`{ kind, id, name }`），
 * 真实路径留在宿主这边。`downloads.create({ directory })` 带着这个句柄回来时，
 * 必须按 id 找回**这一次**选中的目录。
 *
 * 移动端此前完全忽略 `request.directory`：插件指定下载到用户刚授权的文件夹，
 * 歌却落进应用私有目录，用户在文件管理器里哪儿也找不到。句柄过期（插件停止、
 * 应用重启后句柄表被清空）时要如实报错，而不是悄悄退回默认目录。
 */
export interface PickedDirectory {
  uri: string
  name: string
}

export function resolveDownloadDirectory(
  handle: unknown,
  picked: ReadonlyMap<string, PickedDirectory>
): string | undefined {
  if (handle === null || handle === undefined) return undefined
  if (typeof handle !== 'object' || Array.isArray(handle)) throw new Error('目录句柄无效')
  const id = String((handle as { id?: unknown }).id ?? '')
  if (!id) throw new Error('目录句柄无效')
  const folder = picked.get(id)
  if (!folder) throw new Error('目录句柄已过期，请重新选择文件夹')
  return folder.uri
}
