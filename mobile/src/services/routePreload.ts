import { isAppInactive } from './appVisibility'

/**
 * 路由预加载（桌面端 `router/index.ts` 的 `startPreload` 移动端等价实现）。
 *
 * 目标：首屏稳定后，利用空闲时间把尚未访问的页面分包拉进缓存，
 * 让后续切换更快；同时绝不与用户操作、后台播放抢主线程与电量。
 *
 * 与桌面端的差异：
 * - 不在 router 模块加载时立刻执行，避免拖慢首屏；
 * - 移动端切后台会停表，回前台再续，避免后台空耗流量。
 */
export interface PreloadOptions {
  /** 按此顺序预加载，越靠前越可能是用户下一步要去的页面。 */
  priorityOrder?: readonly string[]
  /** 首个分包开始前的静默期。 */
  startDelayMs?: number
  /** 两个分包之间的间隔，给输入与绘制让路。 */
  gapMs?: number
  /** 用户最近交互后的冷却时间。 */
  interactCooldownMs?: number
  /** 单轮空闲回调要求的最小剩余时间。 */
  minIdleMs?: number
  /** 是否启用；默认读取调用方传入的开关。 */
  enabled?: () => boolean
  /** 复用的 loading 函数，便于测试注入。 */
  load?: (path: string) => Promise<unknown>
  /** 测试注入：当前是否处于后台。 */
  isBackground?: () => boolean
  now?: () => number
  setTimeoutImpl?: (handler: () => void, timeout: number) => unknown
}

export interface PreloadTask {
  path: string
  load: () => Promise<unknown>
}

/**
 * 把路由表摊平为预加载任务，并按优先级排序。
 * 未列出的路径排在已列出的之后，保持原始声明顺序。
 */
export function buildPreloadQueue(
  routes: readonly any[],
  priorityOrder: readonly string[] = []
): PreloadTask[] {
  const tasks: PreloadTask[] = []
  const walk = (list: readonly any[]) => {
    for (const route of list ?? []) {
      if (route?.component && typeof route.component === 'function' && route.path) {
        tasks.push({ path: route.path, load: route.component })
      }
      if (route?.children) walk(route.children)
    }
  }
  walk(routes)

  const rank = (path: string) => {
    const index = priorityOrder.indexOf(path)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => rank(a.task.path) - rank(b.task.path) || a.index - b.index)
    .map((entry) => entry.task)
}

const INTERACT_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const

/**
 * 启动预加载。返回取消函数，便于页面卸载或开关变化时停止。
 * 已开始的任务会自然结束，但不会再排新的分包。
 */
export function startRoutePreload(
  routes: readonly any[],
  options: PreloadOptions = {}
): () => void {
  const priorityOrder = options.priorityOrder ?? []
  const startDelayMs = options.startDelayMs ?? 2000
  const gapMs = options.gapMs ?? 150
  const interactCooldownMs = options.interactCooldownMs ?? 600
  const minIdleMs = options.minIdleMs ?? 8
  const enabled = options.enabled ?? (() => true)
  const isBackground = options.isBackground ?? (() => isAppInactive.value)
  const now = options.now ?? (() => performance.now())
  const schedule = options.setTimeoutImpl ?? ((handler, timeout) => setTimeout(handler, timeout))

  let cancelled = false
  let lastInteract = 0
  let timer: unknown = null

  const queue = buildPreloadQueue(routes, priorityOrder).map((task) => ({
    path: task.path,
    run: () => (options.load ? options.load(task.path) : task.load())
  }))

  const cleanupListeners = () => {
    if (typeof window === 'undefined') return
    for (const event of INTERACT_EVENTS) {
      window.removeEventListener(event, markInteract, { capture: true } as any)
    }
  }

  function markInteract(): void {
    lastInteract = now()
  }

  /** 空闲回调：优先 requestIdleCallback，缺失时退化为定时器。 */
  function idle(handler: () => void): void {
    // 注入了调度器时一律走 schedule，否则测试/自定义调度会被浏览器空闲队列绕过。
    const useIdle =
      !options.setTimeoutImpl &&
      typeof window !== 'undefined' &&
      typeof window.requestIdleCallback === 'function'
    if (useIdle) {
      window.requestIdleCallback(() => handler(), { timeout: 1000 })
    } else {
      schedule(handler, 200)
    }
  }

  function stop(): void {
    cancelled = true
    cleanupListeners()
  }

  function tick(): void {
    if (cancelled || !enabled()) return stop()
    if (isBackground()) {
      // 后台不排队，回到前台由调用方重新启动；这里保留监听以免泄漏。
      timer = schedule(tick, 1000)
      return
    }
    if (now() - lastInteract < interactCooldownMs) {
      timer = schedule(tick, interactCooldownMs)
      return
    }
    const next = queue.shift()
    if (!next) return stop()
    try {
      void Promise.resolve(next.run()).catch(() => undefined)
    } catch {
      // 单个分包失败不影响其余页面。
    }
    timer = schedule(() => idle(tick), gapMs)
  }

  if (typeof window !== 'undefined') {
    for (const event of INTERACT_EVENTS) {
      window.addEventListener(event, markInteract, { passive: true, capture: true })
    }
  }

  const begin = () => {
    if (cancelled || !enabled()) return
    if (typeof document !== 'undefined' && document.readyState === 'complete') {
      timer = schedule(() => idle(tick), startDelayMs)
      return
    }
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'load',
        () => {
          if (!cancelled) timer = schedule(() => idle(tick), startDelayMs)
        },
        { once: true }
      )
    }
  }

  begin()
  return stop
}

/** 移动端最可能跳转的顺序，与底部标签栏一致。 */
export const MOBILE_ROUTE_PRIORITY = [
  '/tabs/discover',
  '/tabs/search',
  '/tabs/library',
  '/player',
  '/tabs/settings',
  '/tabs/plugins',
  '/playlist/:id',
  '/downloads',
  '/account'
] as const
