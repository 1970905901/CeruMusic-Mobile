/**
 * 本地音乐的「同目录歌词」匹配（对齐桌面版 `main/services/localLyrics.ts`
 * 的 sidecar 兜底）。
 *
 * 桌面版在解析本地歌词时，内嵌标签之外还会在音频同目录找同名歌词文件
 * （`.lrc` / `.ttml` / 更多格式）；移动端此前只读内嵌标签，「音频 + 同名
 * .lrc」这种最常见的本地音乐组织方式一律没有歌词。
 *
 * 移动端只认自己能解析的两种格式：LRC 与 TTML。其余格式（qrc/krc/yrc…）
 * 需要插件转换器，而 Windows 之外的插件生态未必提供——与其读进来解析成
 * 空文档，不如直接不匹配，让播放页照常显示「暂无歌词」。
 */

/** 移动端能本地解析的歌词扩展名（对照 `services/lyrics.ts` 的 parseLyrics）。 */
export const SIDECAR_LYRIC_EXTENSIONS = ['lrc', 'ttml'] as const

export type SidecarLyricExtension = (typeof SIDECAR_LYRIC_EXTENSIONS)[number]

const EXTENSION_PRIORITY: Record<string, number> = { lrc: 0, ttml: 1 }

/** 去掉目录与扩展名，得到用于「同名」比较的基名。 */
export function baseName(path: string): string {
  const withoutDir = path.split(/[\\/]/).pop() || ''
  const dot = withoutDir.lastIndexOf('.')
  return dot > 0 ? withoutDir.slice(0, dot) : withoutDir
}

/** 该文件名是否是移动端可解析的歌词文件；是则返回其扩展名。 */
export function sidecarLyricExtension(name: string): SidecarLyricExtension | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = name.slice(dot + 1).toLowerCase()
  return (SIDECAR_LYRIC_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as SidecarLyricExtension)
    : null
}

/**
 * 在同一个目录的候选文件里挑出属于这首音频的歌词。
 *
 * `candidates` 只应包含同目录的文件名。同名优先，多个同名歌词（`a.lrc` +
 * `a.ttml`）时按 LRC 优先——LRC 覆盖面最广，TTML 通常是有 LRC 之外的额外
 * 信息（翻译/音译）时才单独存在。
 */
export function pickSidecarLyric(
  audioName: string,
  candidates: readonly string[]
): string | null {
  const target = baseName(audioName).toLowerCase()
  if (!target) return null
  const matches = candidates
    .filter((name) => sidecarLyricExtension(name) !== null)
    .filter((name) => baseName(name).toLowerCase() === target)
    .sort(
      (a, b) =>
        (EXTENSION_PRIORITY[sidecarLyricExtension(a)!] ?? 99) -
        (EXTENSION_PRIORITY[sidecarLyricExtension(b)!] ?? 99)
    )
  return matches[0] ?? null
}

/**
 * 侧车歌词的读取上限。桌面版同样有 2 MiB 上限：异常大的「歌词」文件
 * 多半不是歌词，读进来只会拖慢扫描。
 */
export const SIDECAR_LYRIC_MAX_BYTES = 2 * 1024 * 1024

/**
 * 把 `Filesystem.readFile` 的返回值还原成歌词原文。
 *
 * 原生端默认返回 base64，Web 端返回明文；LRC 本身是纯 ASCII/UTF-8 文本，
 * 用 base64 字符集判定（含 `[`/`]`/换行的一定不是 base64）即可区分。
 */
export function decodeLyricText(value: string): string {
  const base64Like = /^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s/g, '').length % 4 === 0
  if (!base64Like) return value
  try {
    const binary = atob(value.replace(/\s/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const decoded = new TextDecoder().decode(bytes)
    // 解出来若是替换字符（错误的编码猜测），保留原文更稳妥。
    return decoded.includes('�') ? value : decoded
  } catch {
    return value
  }
}

/** 内嵌歌词优先，缺失时才用侧车文件（桌面版同一顺序）。 */
export function preferLyrics(embedded: string | undefined, sidecar: string | null | undefined): string | undefined {
  const inline = typeof embedded === 'string' ? embedded.trim() : ''
  if (inline) return embedded
  const external = typeof sidecar === 'string' ? sidecar.trim() : ''
  return external || undefined
}
