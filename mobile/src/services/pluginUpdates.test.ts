import { describe, expect, it } from 'vitest'
import { comparePluginVersions } from './pluginUpdates'

describe('comparePluginVersions', () => {
  it('compares numeric version segments', () => {
    expect(comparePluginVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(comparePluginVersions('v2.0.0', '2.0')).toBe(0)
    expect(comparePluginVersions('1.0.0-beta', '1.0.1')).toBeLessThan(0)
  })
})
