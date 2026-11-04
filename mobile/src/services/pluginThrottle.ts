/**
 * 插件限流，对齐桌面 `PluginHost.getMusicUrl` → `onThrottle` → 主进程
 * `setThrottleHandler` → 渲染进程 `globaPlayList._throttledPlugins` 这条链路。
 *
 * 插件解析播放地址失败时，`error.recovery.mode` 会告诉宿主「现在该怎么做」：
 * `await-user`（要用户登录/操作）、`stop-current`（别再试了）、`retry-later`
 * （过一会儿再来）。桌面把这三种视为**限流**：暂停全部下载、提示用户，并在
 * 窗口期内不再自动换源——继续一首接一首地请求只会让平台把风控时间越拖越长。
 *
 * 移动端此前完全没有这层：插件被风控后仍会逐首重试、换源、继续下载，用户只
 * 看到「所有歌都播不了」，而且不知道是插件在受限。
 *
 * 判定与状态都收在这里（纯逻辑、时间可注入），播放器与下载 store 只消费结论。
 */

/** 与桌面 `getMusicUrl` 里触发 `onThrottle` 的三种恢复模式一致。 */
const THROTTLE_RECOVERY_MODES = new Set(['await-user', 'stop-current', 'retry-later'])

export interface ThrottleSignal {
  pluginKey: string
  reason: string
  /** 自动恢复的等待时间；0 表示一直持续到用户手动恢复（桌面无 duration 的语义）。 */
  durationMs: number
}

interface FaultLike {
  code?: unknown
  message?: unknown
  retryAfterMs?: unknown
  recovery?: { mode?: unknown } | null
}

/**
 * 从插件的 `ResolveResult.error`（`MusicFault`）判断是否需要限流。
 *
 * 只认 `recovery.mode`：`NOT_FOUND`、`NETWORK_ERROR` 这类「这一首歌不行」的
 * 失败不该停掉整个音源，否则一次坏数据就让用户以为插件坏了。
 */
export function throttleSignalOf(pluginKey: string, fault: FaultLike | null | undefined): ThrottleSignal | null {
  const mode = fault?.recovery?.mode
  if (typeof mode !== 'string' || !THROTTLE_RECOVERY_MODES.has(mode)) return null
  const retryAfterMs = Number(fault?.retryAfterMs)
  return {
    pluginKey: String(pluginKey || ''),
    reason: String(fault?.message || '插件请求受限'),
    durationMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0
  }
}

/** 提示文案，与桌面 `globaPlayList` 的 MessagePlugin.warning 逐字一致。 */
export function describeThrottle(signal: ThrottleSignal): string {
  const seconds = signal.durationMs > 0 ? `，${Math.ceil(signal.durationMs / 1000)}秒后自动恢复` : '，已暂停换源'
  return `插件请求受限：${signal.reason}${seconds}`
}

export interface ThrottleRegistry {
  /** 记录一次限流：暂停下载并提示用户，同一插件重复触发会顺延窗口。 */
  throttle(signal: ThrottleSignal): void
  isThrottled(pluginKey: string | null | undefined): boolean
  /** 手动恢复（用户重新操作、或插件被停用/卸载时）。 */
  clear(pluginKey: string): void
  clearAll(): void
}

export interface ThrottleRegistryOptions {
  /** 暂停全部下载任务；由下载 store 注入，避免本模块反向依赖 store。 */
  pauseDownloads: () => void
  /** 向用户提示 `describeThrottle` 的文案。 */
  notify: (signal: ThrottleSignal) => void
  /** 可注入的时钟，便于测试过期语义。 */
  now?: () => number
}

export function createThrottleRegistry(options: ThrottleRegistryOptions): ThrottleRegistry {
  const now = options.now ?? (() => Date.now())
  /** pluginKey → 到期时间；0 表示「没有自动恢复」。 */
  const until = new Map<string, number>()

  function isThrottled(pluginKey: string | null | undefined): boolean {
    const key = String(pluginKey ?? '')
    if (!key) return false
    const expiresAt = until.get(key)
    if (expiresAt === undefined) return false
    if (expiresAt !== 0 && now() >= expiresAt) {
      until.delete(key)
      return false
    }
    return true
  }

  return {
    throttle(signal) {
      const key = signal.pluginKey
      if (!key) return
      until.set(key, signal.durationMs > 0 ? now() + signal.durationMs : 0)
      options.pauseDownloads()
      options.notify(signal)
    },
    isThrottled,
    clear(pluginKey) {
      until.delete(String(pluginKey))
    },
    clearAll() {
      until.clear()
    }
  }
}
