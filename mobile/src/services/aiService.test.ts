import { describe, expect, it } from 'vitest'
import { extractSseDeltas } from './aiService'

describe('sse delta extraction', () => {
  it('collects content deltas from complete data events', () => {
    const chunk = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      ''
    ].join('\n')
    expect(extractSseDeltas(chunk)).toEqual({ deltas: ['你', '好'], done: false })
  })

  it('recognizes the DONE sentinel', () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"!"}}]}\r\ndata: [DONE]\r\n'
    expect(extractSseDeltas(chunk)).toEqual({ deltas: ['!'], done: true })
  })

  it('skips comments, empty lines and role-only deltas', () => {
    const chunk = [
      ': keep-alive comment',
      'data: {"choices":[{"delta":{"role":"assistant"}}]}',
      'data: {"choices":[{"delta":{}}]}'
    ].join('\n')
    expect(extractSseDeltas(chunk).deltas).toEqual([])
  })

  it('tolerates a half event split across chunks', () => {
    // ReadableStream 的 chunk 边界落在 JSON 中间：第一段解析失败必须跳过而不是抛错，
    // 拼接后的第二段由调用方重新送入（carry 机制），这里只保证不会炸。
    const half = 'data: {"choices":[{"delta":{"con'
    expect(() => extractSseDeltas(half)).not.toThrow()
    expect(extractSseDeltas(half).deltas).toEqual([])
  })

  it('handles reasoning-style chunks without content gracefully', () => {
    const chunk = 'data: {"choices":[{"delta":{"reasoning_content":"..."}}]}'
    expect(extractSseDeltas(chunk).deltas).toEqual([])
  })
})
