import JSON5 from 'json5'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'

export interface ParsedPluginArtifact {
  manifest: PluginManifest
  body: string
  metadata: Record<string, unknown>
  signatureStatus: 'unsigned' | 'signature-present'
}

interface Assignment {
  expression: string
  end: number
}

function skipWhitespaceAndComments(source: string, start: number): number {
  let i = start
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      i += 2
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++
      i += 2
      continue
    }
    break
  }
  return i
}

function extractAssignment(source: string, name: string, from = 0): Assignment | null {
  const pattern = new RegExp(`exports\\.${name}\\s*=\\s*`, 'g')
  pattern.lastIndex = from
  const match = pattern.exec(source)
  if (!match) return null

  const start = match.index + match[0].length
  let i = start
  let depth = 0
  let quote: string | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (lineComment) {
      if (ch === '\n') lineComment = false
      i++
      continue
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false
        i += 2
      } else {
        i++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      lineComment = true
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      blockComment = true
      i += 2
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      i++
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
      i++
      continue
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (depth === 0 && ch === ';') {
      return { expression: source.slice(start, i), end: i + 1 }
    }
    if (depth === 0 && ch === '\n') {
      const lookahead = skipWhitespaceAndComments(source, i + 1)
      if (lookahead >= source.length || /^exports\.[A-Za-z_$][\w$]*\s*=/.test(source.slice(lookahead))) {
        return { expression: source.slice(start, i), end: i + 1 }
      }
    }
    i++
  }

  return { expression: source.slice(start), end: source.length }
}

function parseLiteral(expression: string, label: string): Record<string, unknown> {
  const trimmed = expression.trim()
  if (!trimmed) throw new Error(`插件头部缺少 ${label}`)
  let value: unknown
  try {
    value = JSON5.parse(trimmed)
  } catch (error) {
    throw new Error(`无法解析插件头部 ${label}: ${(error as Error).message}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`插件头部 ${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function assertManifest(value: Record<string, unknown>): asserts value is PluginManifest & Record<string, unknown> {
  if (value.manifestVersion !== 2) throw new Error('仅支持 Ceru v2 插件（manifestVersion 必须为 2）')
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9._-]{2,128}$/.test(value.id)) {
    throw new Error('插件 ID 无效')
  }
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('插件缺少名称')
  if (typeof value.version !== 'string' || !value.version.trim()) throw new Error('插件缺少版本')
  if (!value.engines || typeof value.engines !== 'object') throw new Error('插件缺少 engines')
  const engines = value.engines as Record<string, unknown>
  if (typeof engines.hostApi !== 'string') throw new Error('插件缺少 engines.hostApi')
  if (engines.logicRuntime !== 'ceru-js@1') throw new Error('插件逻辑运行时必须是 ceru-js@1')
  if (!value.modules || typeof value.modules !== 'object') throw new Error('插件缺少 modules')
}

/**
 * Ceru v2 artifacts are a static `exports.manifest = {...}; exports.package = {...};`
 * header followed by the bundled logic. We parse only the metadata with JSON5 and
 * never execute the header in the application renderer.
 */
export function parsePluginArtifact(source: string): ParsedPluginArtifact {
  if (typeof source !== 'string' || source.length > 10 * 1024 * 1024) {
    throw new Error('插件文件为空或超过 10 MiB')
  }
  const manifestAssignment = extractAssignment(source, 'manifest')
  if (!manifestAssignment) throw new Error('不是有效的 Ceru v2 插件：缺少 exports.manifest')
  if (manifestAssignment.expression.length > 256 * 1024) {
    throw new Error('插件头部超过 256 KiB')
  }

  const manifest = parseLiteral(manifestAssignment.expression, 'manifest')
  assertManifest(manifest)

  const packageAssignment = extractAssignment(source, 'package', manifestAssignment.end)
  const metadata = packageAssignment
    ? parseLiteral(packageAssignment.expression, 'package')
    : { formatVersion: 2, syntax: 'js', signature: null }

  if (metadata.formatVersion !== undefined && metadata.formatVersion !== 2) {
    throw new Error('不支持的插件格式版本')
  }
  if (metadata.syntax !== undefined && metadata.syntax !== 'js') {
    throw new Error('不支持的插件语法')
  }

  const bodyStart = packageAssignment?.end ?? manifestAssignment.end
  const body = source.slice(bodyStart).trim()
  if (!body) throw new Error('插件没有可执行的逻辑代码')

  return {
    manifest: manifest as unknown as PluginManifest,
    body,
    metadata,
    signatureStatus: metadata.signature ? 'signature-present' : 'unsigned'
  }
}

export function pluginDisplayName(manifest: PluginManifest): string {
  return manifest.name || manifest.id
}

export function pluginSupportsProvider(manifest: PluginManifest, providerId: string): boolean {
  return !!manifest.contributes?.providers?.some((provider) => provider.id === providerId)
}

export function pluginSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
