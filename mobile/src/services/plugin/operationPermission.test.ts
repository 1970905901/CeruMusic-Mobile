import { describe, expect, it } from 'vitest'
import { declaredPermissionKey } from './permissions'

/**
 * `OperationContext` 形状的调用（`files.saveText`、`account.openLogin`）在 SDK 里
 * 的最后一个参数是 `OperationContext`——里面有 `id` / `deadlineAt` / `signal` /
 * `userIntent`，**没有 `permissionKey`**。
 *
 * 移动端这两个方法却按 `params.operation.permissionKey` 校验，拿到的永远是
 * undefined，`requirePermission` 于是以「缺少权限标识」失败。结果是插件
 * 导出歌词、导出日志、保存文本、拉起点登录**全部不可用**，而错误信息看起来
 * 像插件自己没声明权限——没人会去怀疑宿主。
 *
 * 授权改按 manifest 里声明的权限名查 key。
 */
describe('declared permission lookup', () => {
  const declarations = [
    { key: 'p-file-write', name: 'files.write' },
    { key: 'p-profile', name: 'account.profile' },
    { key: '', name: 'files.read' }
  ]

  it('finds the key the manifest declared for a permission name', () => {
    expect(declaredPermissionKey(declarations, 'files.write')).toBe('p-file-write')
    expect(declaredPermissionKey(declarations, 'account.profile')).toBe('p-profile')
  })

  it('returns null when the plugin never declared the permission', () => {
    // 没有声明 → 不能凭空调出授权框，也不能假装已授权。
    expect(declaredPermissionKey(declarations, 'localMusic.write')).toBeNull()
    expect(declaredPermissionKey(undefined, 'files.write')).toBeNull()
    expect(declaredPermissionKey(null, 'files.write')).toBeNull()
  })

  it('ignores declarations with an unusable key', () => {
    expect(declaredPermissionKey(declarations, 'files.read')).toBeNull()
    expect(declaredPermissionKey([null as any], 'files.write')).toBeNull()
  })

  it('no host RPC reads a permission key out of an OperationContext', async () => {
    // `OperationContext` 上没有 `permissionKey`；再有人写 `operation.permissionKey`
    // 就等于把这个方法做成「永远失败」。这条扫描防止回归。
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/services/plugin/runtime.ts', 'utf8')
    expect(source).not.toMatch(/requirePermission\([^)]*operation[^)]*permissionKey/)
  })
})
