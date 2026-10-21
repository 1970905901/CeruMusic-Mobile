import { describe, expect, it } from 'vitest'
import { PLUGIN_SURFACE_CSP, dataScript, escapeSurfaceCss } from './pluginSurface'

describe('plugin surface isolation', () => {
  it('forbids network, frames and inline handlers', () => {
    expect(PLUGIN_SURFACE_CSP).toContain("connect-src 'none'")
    expect(PLUGIN_SURFACE_CSP).toContain("object-src 'none'")
    expect(PLUGIN_SURFACE_CSP).toContain("frame-src 'none'")
    expect(PLUGIN_SURFACE_CSP).toContain("form-action 'none'")
    expect(PLUGIN_SURFACE_CSP).toContain("base-uri 'none'")
    expect(PLUGIN_SURFACE_CSP).toContain("default-src 'none'")
    expect(PLUGIN_SURFACE_CSP).toContain('script-src data:')
    expect(PLUGIN_SURFACE_CSP).not.toContain("'unsafe-eval'")
    expect(PLUGIN_SURFACE_CSP).not.toContain('http')
  })

  it('inlines plugin code as a data: script so no external origin is needed', () => {
    const tag = dataScript('globalThis.x = 1')
    expect(tag.startsWith('<script src="data:text/javascript;base64,')).toBe(true)
    expect(tag.endsWith('"></script>')).toBe(true)
    expect(tag).not.toContain('http')
  })

  it('base64 encodes non-ascii plugin code without corrupting it', () => {
    const source = 'const name = "中文 🎵"'
    const tag = dataScript(source)
    const base64 = tag.slice('<script src="data:text/javascript;base64,'.length, -'"></script>'.length)
    const decoded = Buffer.from(base64, 'base64').toString('utf8')
    expect(decoded).toBe(source)
  })

  it('escapes closing style tags inside plugin css', () => {
    const escaped = escapeSurfaceCss('a{color:red}</style><script>alert(1)</script>')
    expect(escaped).not.toContain('</style')
    expect(escaped).toContain('<\\/style')
  })

  it('is case-insensitive about the closing style tag', () => {
    expect(escapeSurfaceCss('</STYLE>')).not.toMatch(/<\/style/i)
  })
})
