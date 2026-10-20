/**
 * 通用的「异步结果是否仍然有效」判定。
 *
 * 播放页歌词与歌曲评论都存在同一类竞态：上下文（当前歌曲）变化后，旧请求的响应可能
 * 晚于新请求返回，覆盖新数据或残留加载态。这里把「世代（epoch）+ 身份（identity）」
 * 两重判定集中成一个小工具，避免同一规则在多个组件里各写一遍。
 *
 * 身份不保存在守卫内部：`begin`/`capture` 把当时的身份快照写进 token，调用方在判定时
 * 再传入**当前**身份。这样不会出现「守卫里存的还是旧身份」的隐蔽错误。
 *
 * - `capture`：只取快照，不推进世代。用于同一上下文允许多个请求并存的场景，
 *   例如评论页「热点」「最新」两个分类各自分页加载。
 * - `beginLatest`：先作废在途请求再取快照。用于只关心最后一次结果的场景，
 *   例如同一首歌的歌词只会展示最新一次加载。
 * - `invalidate`：上下文切换（换歌、清空列表）时作废所有在途请求。
 * - `dispose`：宿主销毁后，既有 token 一律失效。
 */

export interface RequestToken {
  /** 取快照时的世代；`beginLatest`/`invalidate`/`dispose` 都会推进世代。 */
  readonly epoch: number
  /** 取快照时的身份标记，例如歌曲 key。 */
  readonly identity: string
}

export interface RequestGuard {
  /** 取快照但不推进世代，因此不会作废并存的其它请求。 */
  capture(identity?: string): RequestToken
  /** 作废在途请求后取快照，保证此后只有这一次调用的 token 有效。 */
  beginLatest(identity?: string): RequestToken
  /**
   * token 是否仍然有效：世代与身份都必须与**当前**状态一致。
   * 身份由调用方现取（而不是由守卫缓存），避免守卫里残留旧身份。
   */
  isCurrent(token: RequestToken | null | undefined, identity: string): boolean
  /** 作废当前所有在途请求。 */
  invalidate(): void
  /** 标记宿主已销毁，此后任何 token 都不再有效。 */
  dispose(): void
  readonly disposed: boolean
}

export function createRequestGuard(): RequestGuard {
  let epoch = 0
  let disposed = false

  return {
    capture(identity = ''): RequestToken {
      return { epoch, identity }
    },
    beginLatest(identity = ''): RequestToken {
      epoch += 1
      return { epoch, identity }
    },
    isCurrent(token: RequestToken | null | undefined, identity: string): boolean {
      if (disposed || !token) return false
      return token.epoch === epoch && token.identity === identity
    },
    invalidate(): void {
      epoch += 1
    },
    dispose(): void {
      disposed = true
      epoch += 1
    },
    get disposed(): boolean {
      return disposed
    }
  }
}
