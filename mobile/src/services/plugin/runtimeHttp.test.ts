import { describe, expect, it } from 'vitest'
import { assertDownloadIds, buildUrl, jsonHeaders, safeExportName } from './runtime'

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

describe('export file names', () => {
  it('strips directory components so a plugin cannot escape exports/', () => {
    // `exports/../../library.json` 会写到 exports 之外，覆盖用户文件。
    expect(safeExportName('../../library.json')).toBe('library.json')
    expect(safeExportName('a/b/c.txt')).toBe('c.txt')
    expect(safeExportName('..\..\win.ini')).toBe('win.ini')
  })

  it('rejects illegal characters and leading dots', () => {
    expect(safeExportName('..hidden')).toBe('hidden')
    expect(safeExportName('a<b>c.txt')).toBe('abc.txt')
    expect(safeExportName('a\u0000b.txt')).toBe('ab.txt')
  })

  it('falls back for empty or unusable names', () => {
    expect(safeExportName('')).toBe('ceru-export.txt')
    expect(safeExportName('   ')).toBe('ceru-export.txt')
    expect(safeExportName('...')).toBe('ceru-export.txt')
    expect(safeExportName(undefined)).toBe('ceru-export.txt')
  })

  it('caps very long names', () => {
    expect(safeExportName('x'.repeat(400)).length).toBeLessThanOrEqual(120)
  })
})

describe('download task ids', () => {
  const tasks = [{ id: 'dl-1' }, { id: 'dl-2' }]

  it('accepts ids that exist', () => {
    expect(assertDownloadIds(tasks, ['dl-1'])).toEqual(['dl-1'])
    expect(assertDownloadIds(tasks, ['dl-1', 'dl-2'])).toEqual(['dl-1', 'dl-2'])
  })

  it('rejects unknown ids instead of silently skipping them', () => {
    // 静默跳过会让插件以为自己操作成功了。
    expect(() => assertDownloadIds(tasks, ['dl-9'])).toThrow('下载任务不存在')
  })

  it('rejects an empty or malformed list', () => {
    expect(() => assertDownloadIds(tasks, [])).toThrow('下载任务列表无效')
    expect(() => assertDownloadIds(tasks, 'dl-1')).toThrow('下载任务列表无效')
    expect(() => assertDownloadIds(tasks, [42])).toThrow('下载任务不存在')
  })

  it('caps a single batch', () => {
    const many = Array.from({ length: 201 }, () => 'dl-1')
    expect(() => assertDownloadIds(tasks, many)).toThrow('一次最多操作 200 个下载任务')
  })
})
