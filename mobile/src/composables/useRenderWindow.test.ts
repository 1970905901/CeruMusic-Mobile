import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { nextRenderCount, RENDER_BATCH, useRenderWindow } from './useRenderWindow'

const range = (count: number) => Array.from({ length: count }, (_, index) => index)

describe('next render count', () => {
  it('advances by one batch', () => {
    expect(nextRenderCount(150)).toBe(300)
    expect(nextRenderCount(300)).toBe(450)
  })

  it('uses the default batch for a missing or invalid current count', () => {
    // 计数被重置成 0/NaN 时不能把窗口卡死在空列表上。
    expect(nextRenderCount(0)).toBe(RENDER_BATCH * 2)
    expect(nextRenderCount(Number.NaN)).toBe(RENDER_BATCH * 2)
  })

  it('falls back to the default batch when the caller passes an invalid one', () => {
    expect(nextRenderCount(150, 0)).toBe(150 + RENDER_BATCH)
    expect(nextRenderCount(150, -10)).toBe(150 + RENDER_BATCH)
  })

  it('honours a custom batch size', () => {
    expect(nextRenderCount(20, 20)).toBe(40)
  })
})

describe('render window', () => {
  it('starts with one batch and exposes the rest through hasMore', () => {
    const list = ref(range(500))
    const window = useRenderWindow(() => list.value, 100)
    expect(window.visible.value).toHaveLength(100)
    expect(window.hasMore.value).toBe(true)
    window.more()
    expect(window.visible.value).toHaveLength(200)
  })

  it('reports no more once the whole list is rendered', () => {
    const list = ref(range(30))
    const window = useRenderWindow(() => list.value, 100)
    expect(window.hasMore.value).toBe(false)
  })

  it('reveals a row that sits beyond the current window', () => {
    // 桌面版「定位到当前播放」同理：目标行没挂载时 scrollIntoView 会静默失败。
    const list = ref(range(1000))
    const window = useRenderWindow(() => list.value, 100)
    window.revealAt(742)
    expect(window.count.value).toBeGreaterThan(742)
    expect(window.visible.value.length).toBeGreaterThan(742)
  })

  it('keeps the window when the list merely loses a few entries', () => {
    const list = ref(range(1000))
    const window = useRenderWindow(() => list.value, 100)
    window.revealAt(800)
    list.value = range(999).map((i) => i)
    // 取消收藏一首不该把滚动位置夹断回首批。
    expect(window.count.value).toBeGreaterThan(800)
  })

  it('collapses back to one batch when the list becomes shorter than the window', async () => {
    const list = ref(range(1000))
    const window = useRenderWindow(() => list.value, 100)
    window.revealAt(800)
    list.value = range(20)
    // 切筛选把上千条缩成二十条：停在 900 的窗口会留下空白。
    // 判定在 post flush 里做，需要等一个 tick。
    await nextTick()
    expect(window.count.value).toBe(100)
    expect(window.visible.value).toHaveLength(20)
  })
})
