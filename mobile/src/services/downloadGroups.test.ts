import { describe, expect, it } from 'vitest'
import { countByTab, selectDownloadTasks, taskMatchesTab, taskProgress } from './downloadGroups'

const task = (id: string, status: string, createdAt: number) => ({ id, status, createdAt })

describe('download tab membership', () => {
  it('groups running, queued and paused as active', () => {
    // 暂停的任务仍在「进行中」里——用户想看到自己停下来的那些。
    expect(taskMatchesTab('running', 'active')).toBe(true)
    expect(taskMatchesTab('queued', 'active')).toBe(true)
    expect(taskMatchesTab('paused', 'active')).toBe(true)
  })

  it('groups failed and cancelled together', () => {
    expect(taskMatchesTab('failed', 'failed')).toBe(true)
    expect(taskMatchesTab('cancelled', 'failed')).toBe(true)
  })

  it('keeps completed on its own', () => {
    expect(taskMatchesTab('completed', 'completed')).toBe(true)
    expect(taskMatchesTab('completed', 'active')).toBe(false)
  })

  it('counts each tab', () => {
    const counts = countByTab([
      task('a', 'running', 1),
      task('b', 'paused', 2),
      task('c', 'completed', 3),
      task('d', 'failed', 4),
      task('e', 'cancelled', 5)
    ])
    expect(counts).toEqual({ active: 2, completed: 1, failed: 2 })
  })
})

describe('download sorting', () => {
  it('orders active tasks by status then oldest first', () => {
    // 正在下载的排最前，否则暂停的任务会插在传输中的任务之间。
    const active = [
      task('paused-late', 'paused', 10),
      task('running-late', 'running', 9),
      task('queued', 'queued', 5),
      task('running-early', 'running', 1)
    ]
    expect(selectDownloadTasks(active, 'active').map((t) => t.id)).toEqual([
      'running-early',
      'running-late',
      'queued',
      'paused-late'
    ])
  })

  it('puts the most recent completed and failed tasks first', () => {
    const done = [task('old', 'completed', 1), task('new', 'completed', 9)]
    expect(selectDownloadTasks(done, 'completed').map((t) => t.id)).toEqual(['new', 'old'])
  })

  it('does not mutate the input array', () => {
    const input = [task('b', 'running', 2), task('a', 'running', 1)]
    selectDownloadTasks(input, 'active')
    expect(input.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('download progress', () => {
  it('computes a ratio when the total is known', () => {
    expect(taskProgress({ id: 'a', status: 'running', createdAt: 0, receivedBytes: 50, totalBytes: 200 })).toBe(0.25)
  })

  it('clamps to 0..1 for overshoot from a stale total', () => {
    expect(taskProgress({ id: 'a', status: 'running', createdAt: 0, receivedBytes: 300, totalBytes: 200 })).toBe(1)
  })

  it('shows a sliver when bytes arrived but the total is unknown', () => {
    // 0 会让进度条看起来像卡住；给一个极小的值表示仍有活动。
    expect(taskProgress({ id: 'a', status: 'running', createdAt: 0, receivedBytes: 10 })).toBe(0.02)
    expect(taskProgress({ id: 'a', status: 'queued', createdAt: 0 })).toBe(0)
  })
})
