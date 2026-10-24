import { describe, expect, it, vi } from 'vitest'
import type { PermissionDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import { createPermissionApi } from './permissionApi'

const declarations = (items: Array<{ key: string; name: string }>): PermissionDeclaration[] =>
  items.map((item) => ({ ...item, reason: '测试' }) as PermissionDeclaration)

const setup = (
  items: Array<{ key: string; name: string }>,
  grantedKeys: string[] = [],
  deniedKeys: string[] = []
) => {
  const granted = new Set(grantedKeys)
  const denied = new Set(deniedKeys)
  const request = vi.fn(async (key: string) => {
    if (denied.has(key)) return 'denied' as const
    granted.add(key)
    return 'granted' as const
  })
  const api = createPermissionApi({
    declarations: () => declarations(items),
    isGranted: (key) => granted.has(key),
    isDenied: (key) => denied.has(key),
    request
  })
  return { api, request, granted, denied }
}

describe('plugin permission api', () => {
  it('returns full grants with the declared name, scope and SDK group', () => {
    // 插件按 `PermissionGrant` 读 name / scope / group；此前只有 key 和 status。
    const { api } = setup(
      [
        { key: 'p-read', name: 'library.read' },
        { key: 'p-net', name: 'network.request' }
      ],
      ['p-read']
    )
    return api.getGranted().then((grants) => {
      expect(grants).toEqual([
        { key: 'p-read', name: 'library.read', group: 'libraryRead', scope: {}, status: 'granted' }
      ])
      // 声明的 reason 等字段不泄露给插件，只回报契约里的字段。
      expect(Object.keys(grants[0]).sort()).toEqual(['group', 'key', 'name', 'scope', 'status'])
    })
  })

  it('reports undeclared keys instead of calling them "prompt"', () => {
    // 桌面 `status()` 对未声明的 key 回 undeclared；回 prompt 会让插件以为申请一下就行。
    const { api, request } = setup([{ key: 'p-read', name: 'library.read' }])
    return Promise.all([
      api.query({ key: 'p-typo' }),
      api.request({ key: 'p-typo' })
    ]).then(([queried, requested]) => {
      expect(queried).toEqual({ status: 'undeclared' })
      expect(requested).toEqual({ status: 'undeclared' })
      expect(request).not.toHaveBeenCalled()
    })
  })

  it('distinguishes prompt, granted and denied for declared keys', () => {
    const { api } = setup(
      [
        { key: 'a', name: 'library.read' },
        { key: 'b', name: 'library.write' }
      ],
      ['a'],
      ['b']
    )
    return Promise.all([api.query({ key: 'a' }), api.query({ key: 'b' })]).then(([a, b]) => {
      expect(a.status).toBe('granted')
      expect(b.status).toBe('denied')
    })
  })

  it('requests the whole group when keys are omitted', () => {
    // SDK 里 keys 是可选的；旧实现直接 `for (const key of undefined)` 抛 TypeError。
    const { api, request } = setup([
      { key: 'r1', name: 'library.read' },
      { key: 'w1', name: 'library.write' },
      { key: 'n1', name: 'network.request' }
    ])
    return api.requestGroup({ group: 'libraryRead' }).then((result) => {
      expect(request.mock.calls.map(([key]) => key)).toEqual(['r1'])
      expect(result.group).toBe('libraryRead')
      expect(result.status).toBe('granted')
    })
  })

  it('returns the group and the full grant list, not just the requested keys', () => {
    const { api } = setup(
      [
        { key: 'r1', name: 'library.read' },
        { key: 'w1', name: 'library.write' },
        { key: 'n1', name: 'network.request' }
      ],
      ['n1']
    )
    return api.requestGroup({ group: 'libraryRead', keys: ['r1'] }).then((result) => {
      expect(result.group).toBe('libraryRead')
      expect(result.grants.map((grant) => grant.key).sort()).toEqual(['n1', 'r1'])
    })
  })

  it('marks the group denied when the user declines any member', () => {
    const { api } = setup(
      [
        { key: 'r1', name: 'library.read' },
        { key: 'w1', name: 'library.write' }
      ],
      [],
      ['w1']
    )
    return api.requestGroup({ group: 'libraryManage' }).then((result) => {
      expect(result.status).toBe('denied')
    })
  })

  it('treats an explicitly empty key list as matching nothing, like the desktop host', () => {
    const { api, request } = setup([{ key: 'r1', name: 'library.read' }])
    return api.requestGroup({ group: 'libraryRead', keys: [] }).then((result) => {
      expect(request).not.toHaveBeenCalled()
      expect(result.status).toBe('denied')
    })
  })
})
