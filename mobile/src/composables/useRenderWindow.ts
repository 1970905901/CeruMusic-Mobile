/**
 * 长列表渐进渲染窗口（桌面版 `SongVirtualList` 窗口化的移动端等价）。
 *
 * 移动端没有虚拟滚动组件，整单一次性 `v-for` 会在上千条时同时挂起上千个
 * `TrackRow`（每个都含封面图、波形指示与多个事件），进页与滚动都明显卡顿。
 * 这里只做「先渲染一批、滚到底再放一批」的增量渲染：实现简单、不改变
 * 任何列表语义（排序、搜索、队列上下文仍基于完整列表）。
 */
import { computed, ref, watch, type Ref } from 'vue'

/** 单批渲染条数：150 行约等于两屏，滚动时不会出现明显空档。 */
export const RENDER_BATCH = 150

/** 下一批的渲染条数：单调递增的最小步长推进。 */
export function nextRenderCount(current: number, batch = RENDER_BATCH): number {
  const base = Number.isFinite(current) && current > 0 ? current : RENDER_BATCH
  const step = Number.isFinite(batch) && batch > 0 ? batch : RENDER_BATCH
  return base + step
}

export interface RenderWindow<T> {
  /** 当前应渲染的条数。 */
  count: Ref<number>
  /** 截断后的可见列表。 */
  visible: Ref<T[]>
  /** 是否还有未渲染的条目（有则显示「继续展开」哨兵）。 */
  hasMore: Ref<boolean>
  /** 放下一批。 */
  more: () => void
  /** 跳过窗口，直接把某下标所在批次渲染出来（用于「定位到当前播放」）。 */
  revealAt: (index: number) => void
  /** 回到首批（列表内容或筛选变化时）。 */
  reset: () => void
}

export function useRenderWindow<T>(
  source: () => readonly T[],
  batch = RENDER_BATCH
): RenderWindow<T> {
  const count = ref(batch)
  const visible = computed(() => source().slice(0, count.value) as T[])
  const hasMore = computed(() => source().length > count.value)

  function more(): void {
    count.value = nextRenderCount(count.value, batch)
  }

  function revealAt(index: number): void {
    if (index >= 0 && index >= count.value) count.value = index + batch
  }

  function reset(): void {
    count.value = batch
  }

  /**
   * 列表变化时只在**窗口失效**时回到首批（新列表比当前窗口还短，如切筛选把
   * 上千条缩成二十条），否则保持当前窗口。
   *
   * 不能无条件 reset：用户滚到第 800 行、取消收藏一首（长度 1000→999）时，
   * 塌回 150 行会让滚动位置被直接夹断，比多渲染几百行难用得多。
   */
  watch(
    source,
    (list) => {
      if (list.length < count.value) count.value = batch
    },
    { flush: 'post' }
  )

  return { count, visible, hasMore, more, revealAt, reset }
}
