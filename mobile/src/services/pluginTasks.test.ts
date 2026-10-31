import { describe, expect, it } from 'vitest'
import { TASK_ID_PATTERN, validateScheduledTask } from '@/services/pluginTasks'

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

  it('exports the same id rule cancel has to enforce', () => {
    // `tasks.cancel` 此前一项授权都不校验，也不校验 id；现在与 schedule
    // 共用同一条规则（桌面 `handleTaskService` 对两者都要求 background.run）。
    expect(TASK_ID_PATTERN.test('refresh-cache')).toBe(true)
    expect(TASK_ID_PATTERN.test('bad id')).toBe(false)
    expect(TASK_ID_PATTERN.test('')).toBe(false)
    expect(TASK_ID_PATTERN.test('x'.repeat(81))).toBe(false)
  })
})
