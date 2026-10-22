import { describe, expect, it } from 'vitest'
import { buildDownloadFilename, renderFilenameTemplate, sanitizeFilenamePart } from './filename'

describe('filename helpers', () => {
  it('sanitizes characters that are invalid on mobile filesystems', () => {
    expect(sanitizeFilenamePart('A/B:C*?"<>|\\')).toBe('A B C')
    expect(sanitizeFilenamePart('   ')).toBe('未知')
  })

  it('renders supported placeholders and falls back for unknown placeholders', () => {
    expect(
      renderFilenameTemplate('{artist} - {title} ({unknown})', {
        title: '夜曲',
        artist: '周杰伦',
        ext: 'mp3'
      })
    ).toBe('周杰伦 - 夜曲 ({unknown})')
  })

  it('appends exactly one extension', () => {
    expect(
      buildDownloadFilename('{artist} - {title}.{ext}', {
        title: '夜曲',
        artist: '周杰伦',
        ext: 'MP3'
      })
    ).toBe('周杰伦 - 夜曲.mp3')
  })
})
describe('desktop %-style filename templates', () => {
  const context = {
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    quality: 'flac',
    platform: '网易云',
    date: new Date(2026, 9, 22),
    ext: 'mp3'
  }

  it('renders every desktop placeholder', () => {
    // 桌面版用 %t/%s/%a/%u/%d/%q，从桌面迁移过来的模板必须照样可用。
    expect(renderFilenameTemplate('%t - %s - %a - %u - %q', context)).toBe(
      '夜曲 - 周杰伦 - 十一月的萧邦 - 网易云 - flac'
    )
  })

  it('renders the date placeholder as YYYY-MM-DD', () => {
    expect(renderFilenameTemplate('%d %t', context)).toBe('2026-10-22 夜曲')
  })

  it('accepts the mobile brace style for the same fields', () => {
    expect(renderFilenameTemplate('{artist} - {title}', context)).toBe('周杰伦 - 夜曲')
    expect(renderFilenameTemplate('{platform}', context)).toBe('网易云')
  })

  it('keeps unknown percent tokens untouched', () => {
    expect(renderFilenameTemplate('%x %t', context)).toBe('%x 夜曲')
  })

  it('falls back for a missing platform instead of leaving the token', () => {
    expect(renderFilenameTemplate('%u', { ...context, platform: undefined })).toBe('未知平台')
  })

  it('builds a filename with the right extension for a percent template', () => {
    expect(buildDownloadFilename('%s - %t', context)).toBe('周杰伦 - 夜曲.mp3')
  })
})
