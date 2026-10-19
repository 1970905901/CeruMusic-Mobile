import { parsePluginArtifact } from '@/services/plugin/artifact'
import type { UISlotName } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'

export interface PluginStyleEntry {
  id: string
  key: string
  pluginKey: string
  css: string
  order: number
}

const STYLE_ATTRIBUTE = 'data-ceru-plugin-style'
const MAX_STYLE_BYTES = 256 * 1024
const MAX_TOTAL_BYTES = 512 * 1024

function cssResourceValue(resource: any): string {
  if (!resource || typeof resource !== 'object') return ''
  if (resource.type === 'text' && typeof resource.value === 'string') return resource.value
  if (resource.type === 'base64' && typeof resource.value === 'string') {
    if (!String(resource.mime || '').includes('css')) return ''
    const binary = atob(resource.value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return new TextDecoder().decode(bytes)
  }
  return ''
}

function serializeStyleRule(rule: CSSStyleRule, scopeSelector: string): string {
  const selectors = rule.selectorText
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => {
      if (selector === ':root') return scopeSelector
      if (selector.startsWith(':root')) return scopeSelector + selector.slice(':root'.length)
      return `${scopeSelector} ${selector}`
    })
    .join(', ')
  return `${selectors} { ${rule.style.cssText} }`
}

function serializeCssRule(rule: CSSRule, scopeSelector: string): string {
  if (rule instanceof CSSStyleRule) return serializeStyleRule(rule, scopeSelector)
  if (rule instanceof CSSMediaRule) {
    const body = [...rule.cssRules]
      .map((child) => serializeCssRule(child, scopeSelector))
      .join('\n  ')
    return `@media ${rule.conditionText} {\n  ${body}\n}`
  }
  if (rule instanceof CSSSupportsRule) {
    const body = [...rule.cssRules]
      .map((child) => serializeCssRule(child, scopeSelector))
      .join('\n  ')
    return `@supports ${rule.conditionText} {\n  ${body}\n}`
  }
  if (rule instanceof CSSKeyframesRule || rule instanceof CSSFontFaceRule) {
    return rule.cssText
  }
  return ''
}

/**
 * Prefixes host-rendered scoped CSS without loading remote imports. iOS 14
 * cannot rely on constructable stylesheets, so parsing uses a temporary style
 * element and CSSOM.
 */
export function scopeCss(css: string, scopeSelector: string): string {
  if (!css.trim()) return ''
  const element = document.createElement('style')
  element.textContent = css
  element.setAttribute('data-ceru-css-parser', '')
  document.head.appendChild(element)
  try {
    const rules = [...(element.sheet?.cssRules ?? [])]
    return rules
      .map((rule) => serializeCssRule(rule, scopeSelector))
      .filter(Boolean)
      .join('\n')
  } finally {
    element.remove()
  }
}

function collectScopedStyleEntries(
  records: readonly PluginRecord[],
  scope: 'slot' | 'surface',
  slot?: UISlotName
): PluginStyleEntry[] {
  const entries: PluginStyleEntry[] = []
  let totalBytes = 0
  for (const record of records) {
    if (!record.enabled || !record.artifactSource) continue
    let artifact
    try {
      artifact = parsePluginArtifact(record.artifactSource)
    } catch {
      continue
    }
    for (const style of artifact.manifest.contributes?.styles ?? []) {
      if (style.scope !== scope) continue
      if (scope === 'slot' && style.slots?.length && (!slot || !style.slots.includes(slot))) continue
      const css = cssResourceValue(artifact.resources[style.resource])
      if (!css.trim()) continue
      const bytes = new TextEncoder().encode(css).length
      if (bytes > MAX_STYLE_BYTES) continue
      if (totalBytes + bytes > MAX_TOTAL_BYTES) break
      totalBytes += bytes
      entries.push({
        id: style.id,
        key: record.key + ':' + style.id,
        pluginKey: record.key,
        css,
        order: Number(style.order || 0)
      })
    }
  }
  return entries.sort(
    (left, right) => left.order - right.order || left.key.localeCompare(right.key)
  )
}

export function collectSlotStyles(
  records: readonly PluginRecord[],
  slot: UISlotName
): PluginStyleEntry[] {
  return collectScopedStyleEntries(records, 'slot', slot)
}

export function collectSurfaceStyles(records: readonly PluginRecord[]): PluginStyleEntry[] {
  return collectScopedStyleEntries(records, 'surface')
}

/**
 * Application styles are global by design, so they require the plugin to
 * declare and receive `ui.styles.global`. Surface styles stay inside surfaces.
 */
export function collectApplicationStyles(
  records: readonly PluginRecord[],
  isGranted: (pluginKey: string, permissionKey: string) => boolean
): PluginStyleEntry[] {
  const entries: PluginStyleEntry[] = []
  let totalBytes = 0
  for (const record of records) {
    if (!record.enabled || !record.artifactSource) continue
    let artifact
    try {
      artifact = parsePluginArtifact(record.artifactSource)
    } catch {
      continue
    }
    const declarations = artifact.manifest.contributes?.styles ?? []
    for (const style of declarations) {
      if (style.scope !== 'application') continue
      const permission = (artifact.manifest.permissions ?? []).find(
        (item) => item.name === 'ui.styles.global'
      )
      if (!permission || !isGranted(record.key, permission.key)) continue
      const css = cssResourceValue(artifact.resources[style.resource])
      if (!css.trim()) continue
      const bytes = new TextEncoder().encode(css).length
      if (bytes > MAX_STYLE_BYTES) continue
      if (totalBytes + bytes > MAX_TOTAL_BYTES) break
      totalBytes += bytes
      entries.push({
        id: style.id,
        key: record.key + ':' + style.id,
        pluginKey: record.key,
        css,
        order: Number(style.order || 0)
      })
    }
  }
  return entries.sort(
    (left, right) => left.order - right.order || left.key.localeCompare(right.key)
  )
}

export function applyPluginApplicationStyles(entries: readonly PluginStyleEntry[]): void {
  for (const element of document.querySelectorAll('style[' + STYLE_ATTRIBUTE + ']')) {
    element.remove()
  }
  for (const entry of entries) {
    const element = document.createElement('style')
    element.setAttribute(STYLE_ATTRIBUTE, entry.key)
    element.setAttribute('data-plugin-key', entry.pluginKey)
    element.textContent = entry.css
    document.head.appendChild(element)
  }
}

export function clearPluginApplicationStyles(): void {
  for (const element of document.querySelectorAll('style[' + STYLE_ATTRIBUTE + ']')) {
    element.remove()
  }
}
