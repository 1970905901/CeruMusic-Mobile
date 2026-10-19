import { describe, expect, it } from 'vitest'
import { validateScheduledTask } from '@/services/pluginTasks'

describe('plugin task validation', () => {
  it('accepts declared commands inside the supported interval', () => {
    expect(validateScheduledTask(
      { id: 'refresh-cache', commandId: 'refresh', intervalMs: 60_000 },
      ['refresh']
    )).toEqual({ id: 'refresh-cache', commandId: 'refresh', intervalMs: 60_000 })
  })

  it('rejects undeclared actions and invalid IDs', () => {
    expect(() =>
      validateScheduledTask({ id: 'bad id', commandId: 'refresh', intervalMs: 60_000 }, ['refresh'])
    ).toThrow('任务 ID 无效')
    expect(() =>
      validateScheduledTask({ id: 'task', commandId: 'missing', intervalMs: 60_000 }, ['refresh'])
    ).toThrow('后台任务引用了未注册操作')
  })

  it('enforces interval bounds', () => {
    expect(() =>
      validateScheduledTask({ id: 'task', commandId: 'refresh', intervalMs: 59_999 }, ['refresh'])
    ).toThrow('后台任务间隔必须在 1 分钟到 24 小时之间')
    expect(() =>
      validateScheduledTask({ id: 'task', commandId: 'refresh', intervalMs: 86_400_001 }, ['refresh'])
    ).toThrow('后台任务间隔必须在 1 分钟到 24 小时之间')
    expect(() =>
      validateScheduledTask({ id: 'task', commandId: 'refresh', intervalMs: Number.NaN }, ['refresh'])
    ).toThrow('后台任务间隔必须在 1 分钟到 24 小时之间')
  })
})
