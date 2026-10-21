import { describe, expect, it } from 'vitest'
import { COMMENT_HIGHLIGHT_MS, locateComment } from './commentLocate'

const tree = [
  { id: 'c1', replies: [{ id: 'r1' }, { id: 'r2' }] },
  { id: 'c2', replies: [] }
]

describe('locateComment', () => {
  it('locates a root comment', () => {
    expect(locateComment(tree, 'c2')).toEqual({
      rootId: 'c2',
      targetId: 'c2',
      needsReplies: false
    })
  })

  it('maps a reply to its root and asks to expand replies', () => {
    expect(locateComment(tree, 'r2')).toEqual({
      rootId: 'c1',
      targetId: 'r2',
      needsReplies: true
    })
  })

  it('returns null for unknown, blank or missing ids', () => {
    expect(locateComment(tree, 'gone')).toBeNull()
    expect(locateComment(tree, '')).toBeNull()
    expect(locateComment(tree, null)).toBeNull()
    expect(locateComment(tree, undefined)).toBeNull()
    expect(locateComment([], 'c1')).toBeNull()
  })

  it('tolerates comments without a replies array', () => {
    expect(locateComment([{ id: 'c3' }], 'c3')).toEqual({
      rootId: 'c3',
      targetId: 'c3',
      needsReplies: false
    })
  })

  it('exposes a highlight duration in the same range as the desktop flash', () => {
    expect(COMMENT_HIGHLIGHT_MS).toBe(1600)
  })
})