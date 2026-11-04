import { describe, expect, it } from 'vitest'
import { planImportTarget } from './playlistImportTarget'

/**
 * 插件 `library.playlists.import` 的目标选择，对齐桌面
 * `components/PluginHostBridge.vue`：
 *
 * ```ts
 * const target = payload.target ?? (await choosePlaylist(payload.suggestedName))
 * if (!target) return { cancelled: true, added: 0, skipped: 0 }
 * ```
 *
 * 桌面在插件**没有指定目标**时会弹「选择歌单」（第一项「新建本地歌单」），
 * 用户取消就返回 `cancelled: true`，什么都不导入。移动端此前不问用户，
 * 直接建一张叫「导入歌单」的歌单把歌塞进去——插件顺手导入一次，
 * 用户歌单列表里就多出一张自己没要过的歌单，与用户本来想放进去的那张
 * 也毫无关系。
 */

const LOCAL = { id: 'p1', location: 'local' as const }
const CLOUD = { id: 'c9', location: 'cloud' as const }

const picked = (target: typeof LOCAL | typeof CLOUD) => ({ kind: 'picked' as const, target })
const CANCELLED = { kind: 'cancelled' as const }
const NEW = { kind: 'new' as const }

function deps(choice: any, created: any = LOCAL) {
  return { choice, createNew: () => created }
}

describe('planImportTarget', () => {
  it('uses the target the plugin named, without asking', () => {
    // 插件给了目标就不该再弹一次面板——用户刚从插件的界面里选过。
    expect(planImportTarget({ target: LOCAL }, { choice: CANCELLED, createNew: () => null })).toEqual({
      target: LOCAL
    })
  })

  it('uses what the user picked when the plugin named no target', () => {
    expect(planImportTarget({ suggestedName: '周杰伦精选' }, deps(picked(CLOUD)))).toEqual({
      target: CLOUD
    })
  })

  it('creates the playlist when the user chose "new"', () => {
    expect(planImportTarget({}, deps(NEW))).toEqual({ target: LOCAL })
  })

  it('reports cancellation instead of importing when the user backs out', () => {
    // 「取消」与「新建」是两种用户意图，不能混为一谈：把取消当成新建，
    // 等于用户按了取消却仍然多出一张歌单。
    expect(planImportTarget({}, deps(CANCELLED, LOCAL))).toEqual({ cancelled: true })
  })

  it('reports cancellation when the panel gave no result at all', () => {
    expect(planImportTarget({}, { choice: null, createNew: () => LOCAL })).toEqual({
      cancelled: true
    })
  })

  it('cancels when "new" was chosen but the playlist could not be created', () => {
    expect(planImportTarget({}, { choice: NEW, createNew: () => null })).toEqual({
      cancelled: true
    })
  })

  it('treats an unusable target shape as "no target" rather than importing blindly', () => {
    // 插件传 `{ id: 3 }`（缺 location）时，不能拿它去撞本地歌单。
    expect(planImportTarget({ target: { id: 3 } as any }, deps(picked(LOCAL)))).toEqual({
      target: LOCAL
    })
  })

  it('treats a target with an empty id as no target', () => {
    expect(
      planImportTarget({ target: { id: '  ', location: 'local' } }, deps(picked(LOCAL)))
    ).toEqual({ target: LOCAL })
  })
})
