/**
 * 睡眠定时的时间换算，从播放 store 里抽出来以便单测。
 *
 * 关键决定：**存绝对截止时间**，而不是「还剩多少分钟」。
 * 应用切后台、或进程被系统回收后重建时，如果按剩余时长重新计时，
 * 截止时间会一路往后推——用户设的 15 分钟可以变成 30、45 分钟。
 */

export interface SleepTimerPlan {
  /** 绝对截止时间（毫秒时间戳）；0 表示没有定时。 */
  deadline: number
  /** 到期的剩余毫秒数；<= 0 表示已到期。 */
  remainingMs: number
  /** 到期时应当立即暂停，而不是再挂一个定时器。 */
  expired: boolean
}

/** 设置定时：换算成绝对截止时间。`minutes <= 0` 表示关闭。 */
export function planSleepTimer(minutes: number | null | undefined, now: number): SleepTimerPlan {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) {
    return { deadline: 0, remainingMs: 0, expired: false }
  }
  const deadline = now + value * 60_000
  return { deadline, remainingMs: deadline - now, expired: false }
}

/**
 * 从持久化的截止时间恢复：仍然有效则继续等待，已过期则要求调用方立即暂停。
 * 非法值（旧版本没有这个字段、时钟被改过）按「没有定时」处理。
 */
export function resumeSleepTimer(
  deadline: unknown,
  now: number
): { active: boolean; deadline: number; remainingMs: number; expired: boolean } {
  const value = Number(deadline)
  if (!Number.isFinite(value) || value <= 0) {
    return { active: false, deadline: 0, remainingMs: 0, expired: false }
  }
  const remainingMs = value - now
  if (remainingMs <= 0) return { active: false, deadline: value, remainingMs: 0, expired: true }
  return { active: true, deadline: value, remainingMs, expired: false }
}

/** 倒计时展示用的分钟数：向上取整，至少 1 分钟。 */
export function displayMinutes(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0
  return Math.max(1, Math.ceil(remainingMs / 60_000))
}
