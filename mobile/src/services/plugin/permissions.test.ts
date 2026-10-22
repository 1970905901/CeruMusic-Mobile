import { describe, expect, it } from 'vitest'
import {
  checkPermissionDeclaration,
  permissionLabel,
  reconcilePermissionNames
} from './permissions'

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

describe('reconciling stored permissions after an update', () => {
  const declarations = [
    { key: 'p-read', name: 'settings.read' },
    { key: 'p-write', name: 'settings.write' }
  ]

  it('keeps a grant whose stored name still matches', () => {
    const tables = { granted: { 'p-read': 'settings.read' }, denied: {} }
    expect(reconcilePermissionNames(tables, declarations)).toEqual(tables)
  })

  it('revokes a grant whose key now names a different permission', () => {
    // 用户当初同意的是「读设置」，新版本把同一个 key 改成「控制播放」——必须重新问。
    const tables = { granted: { 'p-read': 'player.control' }, denied: {} }
    expect(reconcilePermissionNames(tables, declarations).granted).toEqual({})
  })

  it('revokes a grant for a key the update no longer declares', () => {
    const tables = { granted: { gone: 'network.request' }, denied: {} }
    expect(reconcilePermissionNames(tables, declarations).granted).toEqual({})
  })

  it('upgrades a legacy boolean grant by recording the declared name', () => {
    // 旧存档只有 `true`；补上名字后，下次升级才有得比对。
    const tables = { granted: { 'p-read': true }, denied: { 'p-write': true } }
    expect(reconcilePermissionNames(tables, declarations)).toEqual({
      granted: { 'p-read': 'settings.read' },
      denied: { 'p-write': 'settings.write' }
    })
  })

  it('treats a manifest with no declarations as revoking everything', () => {
    const tables = { granted: { 'p-read': 'settings.read' }, denied: {} }
    expect(reconcilePermissionNames(tables, undefined).granted).toEqual({})
    expect(reconcilePermissionNames(tables, []).denied).toEqual({})
  })

  it('returns the same object when nothing changed, so callers can skip writes', () => {
    const granted = { 'p-read': 'settings.read' }
    const result = reconcilePermissionNames({ granted, denied: {} }, declarations)
    expect(result.granted).toBe(granted)
  })
})
