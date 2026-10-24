import type { RoomRole } from '@/services/listenTogetherApi'

/**
 * 一起听的成员管理动作，对齐桌面端 `ListenTogether/parts/MemberStrip.vue`
 * 的 `actionsFor`。
 *
 * 桌面版把规则写在组件里：房主可以提升/撤销管理员并踢出任何人（房主除外），
 * 管理员只能踢普通成员，自己那一行没有操作。移动端此前把所有成员操作都
 * 锁在房主身上——成员行只对房主显示「管理」按钮，store 的 `kick` 也要求
 * `isOwner`。于是在群里，管理员既看不到入口，即便通过其它途径触发也会
 * 静默失效，与桌面版的权限模型对不上。
 *
 * 这里把判定抽成纯函数，页面只负责把结果渲染成按钮。
 */
export type MemberAction = 'promote' | 'demote' | 'kick'

export interface MemberActionInput {
  /** 当前登录用户（房内 id）。 */
  myUserId: string
  /** 当前用户在房间里的角色。 */
  myRole: RoomRole
  member: { userId: string; role: RoomRole }
}

/** 返回该成员可执行的动作，顺序即菜单顺序；空数组表示不显示入口。 */
export function planMemberActions(input: MemberActionInput): MemberAction[] {
  const member = input?.member
  // 没有 id 的条目（脏数据）不提供操作；自己那一行也不提供。
  if (!member?.userId || member.userId === input.myUserId) return []

  if (input.myRole === 'owner') {
    if (member.role === 'admin') return ['demote', 'kick']
    if (member.role === 'member') return ['promote', 'kick']
    // 房主不能对自己或另一位房主操作。
    return []
  }
  // 管理员只能踢普通成员：踢不动房主，也踢不动同级管理员。
  if (input.myRole === 'admin' && member.role === 'member') return ['kick']
  return []
}
