import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPreloadQueue, startRoutePreload } from './routePreload'

function routes() {
  const tabsComponent = () => Promise.resolve({})
  const discoverComponent = () => Promise.resolve({})
  const searchComponent = () => Promise.resolve({})
  const playerComponent = () => Promise.resolve({})
  return [
    {
      path: '/tabs',
      component: tabsComponent,
      children: [
        { path: 'discover', component: discoverComponent },
        { path: 'search', component: searchComponent }
      ]
    },
    { path: '/player', component: playerComponent },
    { path: '/redirect-only', redirect: '/tabs/discover' }
  ]
}

describe('route preload queue', () => {
  it('flattens nested routes and skips redirect-only entries', () => {
    const queue = buildPreloadQueue(routes())
    expect(queue.map((task) => task.path)).toEqual(['/tabs', 'discover', 'search', '/player'])
  })

  it('orders by the declared priority and keeps the rest in declaration order', () => {
    const queue = buildPreloadQueue(routes(), ['/player', 'discover'])
    expect(queue.map((task) => task.path)).toEqual(['/player', 'discover', '/tabs', 'search'])
  })

  it('exposes the original lazy loader per route', () => {
    const source = routes()
    const queue = buildPreloadQueue(source)
    expect(queue.every((task) => typeof task.load === 'function')).toBe(true)
    expect(queue[0].load).toBe(source[0].component)
  })

  it('returns an empty queue for routes without lazy components', () => {
    expect(buildPreloadQueue([{ path: '/x', component: {} }])).toEqual([])
  })
})

describe('route preload scheduling', () => {
  const lazyRoutes = [
    { path: '/a', component: () => Promise.resolve({}) },
    { path: '/b', component: () => Promise.resolve({}) }
  ]

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(overrides: Record<string, unknown> = {}) {
    const loaded: string[] = []
    const stop = startRoutePreload(lazyRoutes, {
      startDelayMs: 0,
      gapMs: 0,
      interactCooldownMs: 0,
      load: (path: string) => {
        loaded.push(path)
        return Promise.resolve({})
      },
      isBackground: () => false,
      ...overrides
    })
    return { loaded, stop }
  }

  it('loads every queued route when idle', async () => {
    const { loaded } = setup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(loaded).toEqual(['/a', '/b'])
  })

  it('does nothing when the user disabled the setting', async () => {
    const { loaded } = setup({ enabled: () => false })
    await vi.advanceTimersByTimeAsync(10)
    expect(loaded).toEqual([])
  })

  it('waits while the app is in the background', async () => {
    let background = true
    const { loaded } = setup({ isBackground: () => background })
    await vi.advanceTimersByTimeAsync(10)
    expect(loaded).toEqual([])
    background = false
    await vi.advanceTimersByTimeAsync(5000)
    expect(loaded).toEqual(['/a', '/b'])
  })

  it('stops scheduling after cancellation', async () => {
    const { loaded, stop } = setup()
    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(loaded).toEqual([])
  })
})
