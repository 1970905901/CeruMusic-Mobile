import { describe, expect, it } from 'vitest'
import { extractRoomCode } from './listenTogetherApi'

describe('extractRoomCode', () => {
  it('extracts the six-character code from share text', () => {
    expect(extractRoomCode('「一起听」今晚一起听歌 #A7K9MX# 加入')).toBe('A7K9MX')
  })

  it('normalizes a directly entered code', () => {
    expect(extractRoomCode('  a7k9mx ')).toBe('A7K9MX')
  })

  it('keeps an unrecognized input bounded for server-side validation', () => {
    expect(extractRoomCode('not a room code')).toBe('NOT A ROOM C')
  })
})
