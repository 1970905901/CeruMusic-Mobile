import { describe, expect, it } from 'vitest'
import { checkPermissionDeclaration, permissionLabel } from './permissions'

const declarations = [
  { key: 'p-net', name: 'network.request' },
  { key: 'p-control', name: 'player.control' }
]

describe('permission declaration check', () => {
  it('accepts a key the plugin declared with the matching name', () => {
    expect(checkPermissionDeclaration(declarations, 'p-net', 'network.request')).toBeNull()
  })

  it('rejects a key the plugin never declared', () => {
    // 否则插件可以随手造一个 key，用户会看到一个没有理由的授权框。
    expect(checkPermissionDeclaration(declarations, 'p-made-up', 'network.request')).toContain(
      '未声明权限'
    )
  })

  it('rejects a declared key used for a different permission', () => {
    // 声明的是读权限却拿它要控制权限，必须拒绝。
    expect(checkPermissionDeclaration(declarations, 'p-control', 'player.read')).not.toBeNull()
    expect(checkPermissionDeclaration(declarations, 'p-net', 'player.control')).not.toBeNull()
  })

  it('rejects a missing key outright', () => {
    expect(checkPermissionDeclaration(declarations, '', 'network.request')).toContain('权限标识')
  })

  it('treats missing or malformed declarations as nothing-declared', () => {
    expect(checkPermissionDeclaration(undefined, 'p-net', 'network.request')).not.toBeNull()
    expect(checkPermissionDeclaration(null, 'p-net', 'network.request')).not.toBeNull()
    expect(checkPermissionDeclaration([null as any], 'p-net', 'network.request')).not.toBeNull()
  })

  it('labels known permissions and falls back for unknown ones', () => {
    expect(permissionLabel('player.control')).toBe('播放控制')
    expect(permissionLabel('something.new')).toBe('相关功能')
  })
})
