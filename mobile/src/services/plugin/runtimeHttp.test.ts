import { describe, expect, it } from 'vitest'
import { buildUrl, jsonHeaders } from './runtime'

describe('plugin http url building', () => {
  it('only allows http and https, normalising case and host', () => {
    expect(buildUrl({ url: 'HTTPS://EXAMPLE.COM/a' })).toBe('https://example.com/a')
    expect(buildUrl({ url: 'http://example.com/a' })).toBe('http://example.com/a')
  })

  it('rejects non-http protocols', () => {
    expect(() => buildUrl({ url: 'file:///etc/passwd' })).toThrow('只支持 HTTP/HTTPS 请求')
    expect(() => buildUrl({ url: 'ftp://example.com/a' })).toThrow('只支持 HTTP/HTTPS 请求')
    expect(() => buildUrl({ url: 'javascript:alert(1)' })).toThrow('只支持 HTTP/HTTPS 请求')
  })

  it('rejects urls carrying credentials', () => {
    expect(() => buildUrl({ url: 'https://user:pw@example.com/a' })).toThrow(
      'HTTP URL 不能包含账号密码'
    )
  })

  it('appends query values, repeating arrays and skipping nullish entries', () => {
    const url = buildUrl({
      url: 'https://example.com/search',
      query: { q: 'a b', tag: ['x', 'y'], skip: null, also: undefined, zero: 0 }
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('q')).toBe('a b')
    expect(parsed.searchParams.getAll('tag')).toEqual(['x', 'y'])
    expect(parsed.searchParams.has('skip')).toBe(false)
    expect(parsed.searchParams.has('also')).toBe(false)
    expect(parsed.searchParams.get('zero')).toBe('0')
  })

  it('keeps existing query parameters', () => {
    const parsed = new URL(buildUrl({ url: 'https://example.com/a?x=1', query: { y: 2 } }))
    expect(parsed.searchParams.get('x')).toBe('1')
    expect(parsed.searchParams.get('y')).toBe('2')
  })

  it('rejects unparsable urls', () => {
    expect(() => buildUrl({ url: 'not a url' })).toThrow()
  })
})

describe('plugin http headers', () => {
  it('lowercases names so plugin casing cannot bypass downstream checks', () => {
    expect(jsonHeaders({ 'Content-Type': 'application/json', Authorization: 'x' })).toEqual({
      'content-type': 'application/json',
      authorization: 'x'
    })
  })

  it('stringifies values and tolerates missing headers', () => {
    expect(jsonHeaders(undefined)).toEqual({})
    expect(jsonHeaders({ 'x-count': 3 as unknown as string })).toEqual({ 'x-count': '3' })
  })
})
