import { describe, expect, it } from 'vitest'
import { roomQueueEditable } from '@/stores/listenTogether'
import type { RoomMember, RoomMeta } from '@/services/listenTogetherApi'

/**
 * 一起听房间里的共享播放队列由服务端广播。桌面宿主在整段
 * `services.queue.*` 前挡了一句「请先退出一起听，再修改本地播放队列」，
 * 移动端此前只在界面上禁了拖拽与移除，插件走 RPC 仍能替换/重排/清空队列。
 *
 * 判定必须只看**这一帧**的房间快照：`SERVER.STATE` 先写 `room` 再写 `members`，
 * 中途读 store 的计算属性拿到的是上一帧的成员表。
 */

const member = (userId: string, role: RoomMember['role']): RoomMember => ({
  userId,
  nickname: userId,
  role
})

const room = (overrides: Partial<RoomMeta> = {}): RoomMeta => ({
  code: 'ABC123',
  mode: 'group',
  ownerId: 'owner',
  name: 'Night room',
  maxMembers: 10,
  createdAt: 0,
  ...overrides
})

describe('listen-together queue editability', () => {
  it('is false outside a room', () => {
    expect(roomQueueEditable(null, [], 'u1')).toBe(false)
  })

  it('lets the owner and admins edit a group room', () => {
    expect(roomQueueEditable(room(), [member('owner', 'owner')], 'owner')).toBe(true)
    expect(roomQueueEditable(room(), [member('admin', 'admin')], 'admin')).toBe(true)
  })

  it('treats the room creator as owner even without a member row yet', () => {
    // 刚加入时 `members` 可能还没广播到本机，房主仍应能改队列。
    expect(roomQueueEditable(room(), [], 'owner')).toBe(true)
  })

  it('keeps ordinary members of a group room read-only', () => {
    expect(roomQueueEditable(room(), [member('u2', 'member')], 'u2')).toBe(false)
    expect(roomQueueEditable(room(), [], 'stranger')).toBe(false)
  })

  it('lets everyone edit an intimate room', () => {
    expect(roomQueueEditable(room({ mode: 'intimate' }), [member('u2', 'member')], 'u2')).toBe(true)
  })
})
