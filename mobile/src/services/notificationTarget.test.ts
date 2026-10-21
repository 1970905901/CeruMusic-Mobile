import { describe, expect, it } from 'vitest'
import { resolveNotificationTarget } from './notificationTarget'

describe('resolveNotificationTarget', () => {
  it('opens the post for plain interaction notifications', () => {
    expect(
      resolveNotificationTarget({ kind: 'like', postId: 'p1', commentId: null })
    ).toEqual({ path: '/community/p1', reply: false })
  })

  it('deep-links to the comment and pre-fills the reply for replies', () => {
    expect(
      resolveNotificationTarget({
        kind: 'reply',
        postId: 'p1',
        commentId: 'c9',
        actorName: '小林'
      })
    ).toEqual({
      path: '/community/p1?comment=c9',
      reply: true,
      replyToName: '小林'
    })
  })

  it('treats comment notifications the same way', () => {
    expect(
      resolveNotificationTarget({ kind: 'comment', postId: 'p1', commentId: 'c9' })
    ).toMatchObject({ path: '/community/p1?comment=c9', reply: true })
  })

  it('does not pre-fill for likes that happen to carry a commentId', () => {
    const target = resolveNotificationTarget({ kind: 'like', postId: 'p1', commentId: 'c9' })
    expect(target).toEqual({ path: '/community/p1', reply: false })
  })

  it('encodes ids and falls back to a generic reply name', () => {
    const target = resolveNotificationTarget({
      kind: 'reply',
      postId: 'p/1',
      commentId: 'c 9',
      actorName: null
    })
    expect(target?.path).toBe('/community/p%2F1?comment=c%209')
    expect(target?.replyToName).toBe('音乐同好')
  })

  it('returns null without a post id', () => {
    expect(resolveNotificationTarget({ kind: 'notice', postId: null, commentId: null })).toBeNull()
    expect(resolveNotificationTarget({ kind: 'notice', postId: '   ', commentId: 'c1' })).toBeNull()
  })
})