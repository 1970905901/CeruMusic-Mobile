import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_PAYLOAD_BYTES,
  MAX_QUEUE_MUTATION_ITEMS,
  MAX_SOCKET_PAYLOAD_BYTES,
  assertDownloadIds,
  assertFilePayloadBytes,
  assertQueueSize,
  assertSocketPayload,
  buildUrl,
  jsonHeaders,
  safeExportName,
  utf8ByteLength
} from './runtime'

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

describe('queue mutation size', () => {
  it('accepts a reasonable queue operation', () => {
    expect(() => assertQueueSize([{ ref: {} }])).not.toThrow()
    expect(() => assertQueueSize(undefined)).not.toThrow()
  })

  it('rejects an oversized batch before it reaches the player', () => {
    // 上万条引用会让 queue.replace 整队重建、界面卡死。
    const huge = Array.from({ length: MAX_QUEUE_MUTATION_ITEMS + 1 }, () => 'k')
    expect(() => assertQueueSize(huge)).toThrow('一次最多操作')
  })

  it('rejects a non-array argument', () => {
    expect(() => assertQueueSize('not-a-list')).toThrow('队列操作参数无效')
  })
})

describe('plugin file payload limits', () => {
  it('uses the same 16 MiB cap as the desktop file service', () => {
    expect(MAX_FILE_PAYLOAD_BYTES).toBe(16 * 1024 * 1024)
  })

  it('accepts files at or below the cap', () => {
    expect(() => assertFilePayloadBytes(0)).not.toThrow()
    expect(() => assertFilePayloadBytes(MAX_FILE_PAYLOAD_BYTES)).not.toThrow()
  })

  it('rejects oversized files before they are read into memory', () => {
    // 读取会把整份内容读进 data URL / 字符串，峰值约为文件的三倍；
    // 桌面 `handleFileService` 同样在读取前挡住超过 16 MiB 的文件。
    expect(() => assertFilePayloadBytes(MAX_FILE_PAYLOAD_BYTES + 1)).toThrow('文件超过 16 MiB 限制')
  })

  it('labels write payloads so the error says what was too large', () => {
    expect(() =>
      assertFilePayloadBytes(MAX_FILE_PAYLOAD_BYTES + 1, '写入内容')
    ).toThrow('写入内容超过 16 MiB 限制')
  })

  it('refuses to guess when the size is unusable', () => {
    expect(() => assertFilePayloadBytes(Number.NaN)).toThrow('大小无法确定')
    expect(() => assertFilePayloadBytes(-1)).toThrow('大小无法确定')
    expect(() => assertFilePayloadBytes(Number.POSITIVE_INFINITY)).toThrow('大小无法确定')
  })

  it('measures text by UTF-8 bytes rather than character count', () => {
    // 中文一个字符占 3 字节，按字符数算会严重低估上限。
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('中文')).toBe(6)
    expect(utf8ByteLength(undefined)).toBe(0)
  })
})

describe('socket payload limits', () => {
  it('accepts a normal payload and undefined', () => {
    expect(() => assertSocketPayload({ type: 'ping' })).not.toThrow()
    expect(() => assertSocketPayload(undefined)).not.toThrow()
  })

  it('rejects an oversized payload before it reaches the socket', () => {
    const big = { data: 'x'.repeat(MAX_SOCKET_PAYLOAD_BYTES + 10) }
    expect(() => assertSocketPayload(big)).toThrow('超过 1 MiB')
  })

  it('rejects a payload that cannot be serialised', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => assertSocketPayload(circular)).toThrow('无法序列化')
  })
})
