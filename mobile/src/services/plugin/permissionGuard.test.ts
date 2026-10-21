import { describe, expect, it } from 'vitest'
import { resolvePermissionKey } from './runtime'

/**
 * permissionKey 来自插件进程，插件可以传任意值。
 * 缺省必须视为「未授权」，不能像旧实现那样直接放行。
 */
describe('plugin permission key guard', () => {
  it('treats missing, empty and whitespace-only keys as no permission', () => {
    expect(resolvePermissionKey(undefined)).toBeNull()
    expect(resolvePermissionKey(null)).toBeNull()
    expect(resolvePermissionKey('')).toBeNull()
    expect(resolvePermissionKey('   ')).toBeNull()
  })

  it('returns the trimmed key for real values', () => {
    expect(resolvePermissionKey('network')).toBe('network')
    expect(resolvePermissionKey('  ai  ')).toBe('ai')
    expect(resolvePermissionKey('libraryManage')).toBe('libraryManage')
  })

  it('ignores non-string values coming from the worker bridge', () => {
    expect(resolvePermissionKey(42 as unknown as string)).toBeNull()
    expect(resolvePermissionKey({} as unknown as string)).toBeNull()
  })
})
