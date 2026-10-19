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