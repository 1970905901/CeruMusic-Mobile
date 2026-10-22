import { describe, expect, it } from 'vitest'
import { selectTasksToRequeue, selectTasksToStart } from './downloadPump'

const queued = (id: string) => ({ id, status: 'queued' })
const running = (id: string) => ({ id, status: 'running' })
const done = (id: string) => ({ id, status: 'completed' })

describe('download pump', () => {
  it('starts queued tasks up to the free slots', () => {
    expect(selectTasksToStart([running('a'), queued('b'), queued('c')], 2)).toEqual(['b'])
  })

  it('starts nothing when every slot is busy', () => {
    expect(selectTasksToStart([running('a'), running('b'), queued('c')], 2)).toEqual([])
  })

  it('fills a slot freed by pausing a running task', () => {
    // 暂停后该任务不再是 running，队列里下一个必须被拉起，否则会一直卡住。
    const tasks = [queued('a'), running('b'), queued('c')]
    expect(selectTasksToStart(tasks, 2)).toEqual(['a'])
  })

  it('keeps queue order so the oldest request goes first', () => {
    expect(selectTasksToStart([queued('z'), queued('a'), queued('m')], 2)).toEqual(['z', 'a'])
  })

  it('ignores finished, failed and paused tasks when counting', () => {
    const tasks = [done('a'), { id: 'b', status: 'failed' }, { id: 'c', status: 'paused' }]
    expect(selectTasksToStart(tasks, 2)).toEqual([])
  })

  it('treats a zero or invalid limit as one slot', () => {
    expect(selectTasksToStart([queued('a'), queued('b')], 0)).toEqual(['a'])
    expect(selectTasksToStart([queued('a'), queued('b')], Number.NaN)).toEqual(['a'])
  })

  it('returns nothing for an empty queue', () => {
    expect(selectTasksToStart([], 3)).toEqual([])
  })
})

describe('download pump after removal', () => {
  it('fills the slot freed by deleting a running task', () => {
    // 删除正在下载的任务同样中止了传输并空出一个并发位。
    const afterRemoval = [queued('a'), queued('b'), running('c')]
    expect(selectTasksToStart(afterRemoval, 2)).toEqual(['a'])
  })
})

describe('lowering the concurrency limit', () => {
  it('requeues the newest tasks rather than the oldest', () => {
    // tasks 按创建时间倒序；调小上限时停掉最后开始的，别把用户最先点的砍掉。
    const tasks = [running('newest'), running('middle'), running('oldest')]
    expect(selectTasksToRequeue(tasks, 1)).toEqual(['newest', 'middle'])
  })

  it('requeues nothing when the running count fits', () => {
    expect(selectTasksToRequeue([running('a'), running('b')], 2)).toEqual([])
    expect(selectTasksToRequeue([running('a'), running('b')], 5)).toEqual([])
  })

  it('treats an invalid limit as one slot', () => {
    expect(selectTasksToRequeue([running('a'), running('b')], 0)).toEqual(['a'])
  })

  it('ignores tasks that are not running', () => {
    expect(selectTasksToRequeue([queued('a'), done('b'), running('c')], 1)).toEqual([])
  })
})
