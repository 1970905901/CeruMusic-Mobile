import { Gunzip } from 'fflate'

/**
 * 有解压上限的 gzip 解包。
 *
 * 歌单文件来自外部（聊天记录、网盘、插件目录），而 gzip 的压缩比可以上千倍：
 * 一个几百 KB 的文件能解出几个 GB。`gunzipSync` 会一次性申请这么多内存，
 * 移动端 WebView 直接被系统杀掉，用户只看到闪退、不知道是哪个文件。
 *
 * 这里用流式解压边解边计数，超过上限立即中止并抛出，交给调用方给出可读的提示。
 */
export function gunzipWithLimit(bytes: Uint8Array, limit: number): Uint8Array {
  // 流式解压不会对坏数据抛错，只会悄悄产出空结果——那样调用方会拿到一份
  // 「空歌单」而不是「文件损坏」，用户看到的是导入成功但零首歌。
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error('不是有效的 gzip 数据')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  let tooLarge = false
  const stream = new Gunzip((chunk) => {
    if (tooLarge) return
    total += chunk.length
    if (total > limit) {
      tooLarge = true
      chunks.length = 0
      return
    }
    chunks.push(chunk)
  })
  stream.push(bytes, true)
  if (tooLarge) throw new Error('文件解压后过大，可能不是有效的歌单文件')
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  return joined
}
