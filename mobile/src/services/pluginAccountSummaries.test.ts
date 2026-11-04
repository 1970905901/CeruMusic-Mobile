import { describe, expect, it } from 'vitest'
import {
  applyAccountSummary,
  createAccountRevisionTracker,
  pruneAccountSummaries
} from './pluginAccountSummaries'

/**
 * 插件账号摘要的合并规则，对齐桌面 `services/pluginAccounts.ts`：
 *
 * ```ts
 * pluginAccountSummaries.value = Object.fromEntries(
 *   Object.entries(...).filter(([key]) => keys.has(key))
 * )
 * ...
 * } catch {
 *   const next = { ...pluginAccountSummaries.value }
 *   delete next[item.key]          // 失败 → 当作未登录
 *   pluginAccountSummaries.value = next
 * }
 * ```
 *
 * 移动端 `AccountPage` 的 `refreshPluginAccounts` 只做合并、从不清除：插件被停用
 * 或账号菜单项被删掉之后，那份摘要还挂在账号页上（显示一个已经不存在入口的昵称与
 * 会员标签）；取摘要失败时也保留上一次的「已登录」状态——用户明明在插件里退出了，
 * 手机上仍显示已登录。
 *
 * 桌面还用一个按条目递增的 revision 丢弃过期响应；移动端没有，快速刷新（切回前台、
 * 登录状态变化都会触发）时晚到的旧响应会覆盖新结果。
 */

type Summary = Record<string, unknown>

describe('pruneAccountSummaries', () => {
  it('drops summaries whose account item no longer exists', () => {
    // 插件被停用 / 卸载 / 新版本删掉了账号菜单项。
    const current: Record<string, Summary> = {
      'p1:netease': { signedIn: true },
      'p1:uninstalled': { signedIn: true }
    }
    expect(pruneAccountSummaries(current, ['p1:netease'])).toEqual({
      'p1:netease': { signedIn: true }
    })
  })

  it('keeps the same object when nothing was dropped', () => {
    // 每次刷新都造一个新对象会让账号页整页重渲染。
    const current: Record<string, Summary> = { 'p1:a': { signedIn: true } }
    expect(pruneAccountSummaries(current, ['p1:a'])).toBe(current)
  })

  it('treats an empty item list as "no plugin account items"', () => {
    const current: Record<string, Summary> = { 'p1:a': { signedIn: true } }
    expect(pruneAccountSummaries(current, [])).toEqual({})
  })
})

describe('applyAccountSummary', () => {
  function setup() {
    const tracker = createAccountRevisionTracker()
    return { tracker }
  }

  it('stores a summary that came back for the current request', () => {
    const { tracker } = setup()
    const revision = tracker.begin('p1:a')
    const next = applyAccountSummary(
      {},
      { key: 'p1:a', summary: { signedIn: true, displayName: '小明' }, revision },
      tracker
    )
    expect(next).toEqual({ 'p1:a': { signedIn: true, displayName: '小明' } })
  })

  it('removes the summary when the plugin fails to answer', () => {
    // 桌面在 catch 里 delete：插件报错时不能继续显示上一次的「已登录」。
    const { tracker } = setup()
    const current: Record<string, Summary> = { 'p1:a': { signedIn: true } }
    const revision = tracker.begin('p1:a')
    expect(
      applyAccountSummary(current, { key: 'p1:a', summary: null, revision }, tracker)
    ).toEqual({})
  })

  it('ignores a response that a newer request already superseded', () => {
    // 快速刷新时旧请求晚到：不能把新结果盖回去。
    const { tracker } = setup()
    const stale = tracker.begin('p1:a')
    const fresh = tracker.begin('p1:a')
    const afterFresh = applyAccountSummary(
      {},
      { key: 'p1:a', summary: { signedIn: true, displayName: '新' }, revision: fresh },
      tracker
    )
    const afterStale = applyAccountSummary(
      afterFresh,
      { key: 'p1:a', summary: { signedIn: false, displayName: '旧' }, revision: stale },
      tracker
    )
    expect(afterStale).toEqual({ 'p1:a': { signedIn: true, displayName: '新' } })
  })

  it('ignores a response for an item that disappeared mid-flight', () => {
    const { tracker } = setup()
    const revision = tracker.begin('p1:gone')
    tracker.forget(['p1:a'])
    expect(
      applyAccountSummary({}, { key: 'p1:gone', summary: { signedIn: true }, revision }, tracker)
    ).toEqual({})
  })

  it('keeps the map identical when a stale response is discarded', () => {
    const { tracker } = setup()
    const current: Record<string, Summary> = { 'p1:a': { signedIn: true } }
    const stale = tracker.begin('p1:a')
    tracker.begin('p1:a')
    expect(applyAccountSummary(current, { key: 'p1:a', summary: null, revision: stale }, tracker)).toBe(
      current
    )
  })
})
