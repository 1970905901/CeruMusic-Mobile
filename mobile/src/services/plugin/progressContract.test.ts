import { describe, expect, it } from 'vitest'
import { progressCardHandle } from './runtime'

/**
 * `ui.progress.create` 的契约是 `Promise<{ id }>`（SDK 与桌面宿主都如此）。
 *
 * 移动端此前把内部字符串 id 原样返回：插件写
 * `const { id } = await ctx.ui.progress.create(...)` 时拿到 undefined，之后每次
 * `update` / `close` 都因「没有 id」被宿主跳过——进度卡片永远挂在界面上，
 * 插件也永远等不到它关闭。
 */
describe('progress card handle', () => {
  it('wraps the id in the object the SDK declares', () => {
    expect(progressCardHandle('plugin-progress-123')).toEqual({ id: 'plugin-progress-123' })
  })

  it('keeps the id usable for the follow-up update and close calls', () => {
    const handle = progressCardHandle('abc')
    expect(handle.id).toBe('abc')
    // 插件随后把 handle.id 传回 update / close；这里只钉住它确实是个可用的字符串。
    expect(typeof handle.id).toBe('string')
    expect(handle.id.length).toBeGreaterThan(0)
  })
})
