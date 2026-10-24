import { describe, expect, it } from 'vitest'
import { planMemberActions } from './listenTogetherMembers'

const plan = (myRole: 'owner' | 'admin' | 'member', role: 'owner' | 'admin' | 'member', self = false) =>
  planMemberActions({
    myUserId: 'me',
    myRole,
    member: { userId: self ? 'me' : 'other', role }
  })

describe('listen together member actions', () => {
  it('lets the owner promote and kick a plain member', () => {
    expect(plan('owner', 'member')).toEqual(['promote', 'kick'])
  })

  it('lets the owner demote and kick an admin', () => {
    expect(plan('owner', 'admin')).toEqual(['demote', 'kick'])
  })

  it('gives the owner no action on another owner', () => {
    // 房主不能移除/降级另一位房主；服务端也不会允许。
    expect(plan('owner', 'owner')).toEqual([])
  })

  it('lets an admin kick a plain member but not a peer or the owner', () => {
    // 桌面端 `actionsFor` 对管理员只开放『踢出普通成员』。
    expect(plan('admin', 'member')).toEqual(['kick'])
    expect(plan('admin', 'admin')).toEqual([])
    expect(plan('admin', 'owner')).toEqual([])
  })

  it('gives plain members no actions at all', () => {
    expect(plan('member', 'member')).toEqual([])
    expect(plan('member', 'owner')).toEqual([])
  })

  it('never offers actions on yourself, whatever the role', () => {
    expect(plan('owner', 'owner', true)).toEqual([])
    expect(plan('admin', 'admin', true)).toEqual([])
    expect(plan('owner', 'member', true)).toEqual([])
  })
})
