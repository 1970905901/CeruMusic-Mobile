import { describe, expect, it } from 'vitest'
import { createOperationRequests } from './operationRequests'

/**
 * 进行中的插件请求要按 `operation.id` 记着，宿主才能在中止时真的停掉它们。
 *
 * 桌面 `PluginHost` 对 `http.request` 用 `data.operation?.id` 建 `AbortController`
 * 集合，收到 `operations.cancel` 就把这一组的全部 abort。移动端此前既没有这张表、
 * 也没有 `operations.cancel` 分支：插件超时或被放弃之后，网络请求照样跑到结束，
 * 手机上白白耗流量，插件却已经收到「操作超时」。
 */
describe('operation request registry', () => {
  it('aborts every in-flight request for an operation', () => {
    const registry = createOperationRequests()
    const first = new AbortController()
    const second = new AbortController()
    registry.track('op-1', first)
    registry.track('op-1', second)
    expect(registry.cancel('op-1')).toBe(2)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
  })

  it('leaves other operations alone', () => {
    const registry = createOperationRequests()
    const mine = new AbortController()
    const theirs = new AbortController()
    registry.track('op-1', mine)
    registry.track('op-2', theirs)
    registry.cancel('op-1')
    expect(mine.signal.aborted).toBe(true)
    expect(theirs.signal.aborted).toBe(false)
  })

  it('reports nothing to cancel for an unknown operation', () => {
    // 桌面同样返回 null，迟到的取消不该报错。
    const registry = createOperationRequests()
    expect(registry.cancel('op-9')).toBe(0)
  })

  it('forgets a request once it settles', () => {
    const registry = createOperationRequests()
    const controller = new AbortController()
    const release = registry.track('op-1', controller)
    release()
    expect(registry.cancel('op-1')).toBe(0)
  })

  it('does not abort a request that already returned', () => {
    // 请求返回后再来的取消是迟到的，不该报错也不该有任何副作用。
    const registry = createOperationRequests()
    const controller = new AbortController()
    const release = registry.track('op-1', controller)
    release()
    registry.cancel('op-1')
    expect(controller.signal.aborted).toBe(false)
  })

  it('cancels everything on dispose', () => {
    const registry = createOperationRequests()
    const first = new AbortController()
    const second = new AbortController()
    registry.track('op-1', first)
    registry.track('op-2', second)
    expect(registry.cancelAll()).toBe(2)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
    expect(registry.cancel('op-1')).toBe(0)
  })

  it('tracks without an id as a no-op release', () => {
    // 没有 operation 的调用也要能安全走一遍。
    const registry = createOperationRequests()
    const controller = new AbortController()
    registry.track('', controller)
    expect(registry.cancel('')).toBe(0)
  })
})
