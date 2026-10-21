import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { isAppInactive, reduceVisibility, setNativeActive } from './appVisibility'

describe('app visibility', () => {
  it('is foreground only when both signals agree', () => {
    expect(reduceVisibility({ nativeActive: true, documentHidden: false })).toBe(false)
    expect(reduceVisibility({ nativeActive: false, documentHidden: false })).toBe(true)
    expect(reduceVisibility({ nativeActive: true, documentHidden: true })).toBe(true)
    expect(reduceVisibility({ nativeActive: false, documentHidden: true })).toBe(true)
  })

  it('keeps the shared ref in sync with native lifecycle events', () => {
    const derived = computed(() => isAppInactive.value)
    expect(derived.value).toBe(false)
    setNativeActive(false)
    expect(isAppInactive.value).toBe(true)
    expect(derived.value).toBe(true)
    setNativeActive(true)
    expect(isAppInactive.value).toBe(false)
    expect(derived.value).toBe(false)
  })
})
