/**
 * 插件键值存储的键校验，对齐桌面端 `PluginStorage.invoke` 的输入检查：
 * 键必须是 1–256 字符的字符串，且不能是原型链上的特殊名。
 *
 * 移动端此前直接把 `params.key` 拼进 `plugin:<key>:<userKey>` 再写 IndexedDB，
 * 既不校验键也不校验值大小。脏键（超长、控制字符、原型链特殊名）会永久留在
 * 数据库里，而一次写入一个几十 MB 的对象会把整个 IndexedDB 撑爆，
 * 之后所有插件、歌单、下载记录的读写都会一起变慢甚至失败。
 */

export const MAX_STORAGE_KEY_LENGTH = 256
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** 合法返回 null，否则返回给人看的错误原因。 */
export function checkStorageKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return '无效的存储键'
  if (value.length > MAX_STORAGE_KEY_LENGTH) return '无效的存储键'
  if (FORBIDDEN_KEYS.has(value)) return '无效的存储键'
  // 插件键会拼进 IndexedDB 主键；空白与控制字符一律拒绝，避免产生
  // 无法在界面上阅读、也无法按前缀安全清理的条目。
  if (/[\u0000-\u001f\u007f]/.test(value)) return '无效的存储键'
  return null
}

/** 存储值的上限：桌面版按 10 MiB 计，移动端沿用同一数字。 */
export const MAX_STORAGE_VALUE_BYTES = 10 * 1024 * 1024

/** 估算 JSON 序列化后的字节数；无法序列化时返回 null（调用方应拒绝）。 */
export function storageValueBytes(value: unknown): number | null {
  try {
    const text = JSON.stringify(value)
    if (text === undefined) return null
    return new TextEncoder().encode(text).length
  } catch {
    return null
  }
}
