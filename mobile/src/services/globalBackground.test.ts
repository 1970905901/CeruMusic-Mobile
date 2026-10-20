import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    convertFileSrc: vi.fn((src: string) => 'converted:' + src)
  }
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    writeFile: vi.fn(async () => ({ uri: 'file:///data/wallpapers/a.jpg' })),
    getUri: vi.fn(async ({ path }: { path: string }) => ({ uri: 'file:///data/' + path })),
    deleteFile: vi.fn(async () => undefined)
  }
}))

import { Capacitor } from '@capacitor/core'
import {
  DEFAULT_GLOBAL_BACKGROUND,
  MAX_WEB_WALLPAPER_BYTES,
  buildGlobalBackgroundFilter,
  deleteGlobalBackgroundFile,
  isGlobalBackgroundActive,
  mediaTypeForFile,
  normalizeGlobalBackground,
  persistGlobalBackground,
  resolveGlobalBackgroundUrl
} from './globalBackground'

describe('global background settings', () => {
  it('falls back to desktop defaults when nothing is stored', () => {
    expect(normalizeGlobalBackground(null)).toEqual(DEFAULT_GLOBAL_BACKGROUND)
    expect(normalizeGlobalBackground('bad')).toEqual(DEFAULT_GLOBAL_BACKGROUND)
  })

  it('clamps opacity, blur and brightness into the desktop ranges', () => {
    const normalized = normalizeGlobalBackground({
      enable: true,
      type: 'image',
      url: 'file:///wall.jpg',
      opacity: 4,
      blur: -8,
      brightness: 9
    })
    expect(normalized.opacity).toBe(1)
    expect(normalized.blur).toBe(0)
    expect(normalized.brightness).toBe(2)

    const invalid = normalizeGlobalBackground({
      type: 'image',
      url: 'file:///wall.jpg',
      opacity: 'x',
      blur: Number.NaN,
      brightness: undefined
    })
    expect(invalid.opacity).toBe(DEFAULT_GLOBAL_BACKGROUND.opacity)
    expect(invalid.blur).toBe(DEFAULT_GLOBAL_BACKGROUND.blur)
    expect(invalid.brightness).toBe(DEFAULT_GLOBAL_BACKGROUND.brightness)
  })

  it('derives the media type from the URL when it is missing', () => {
    expect(normalizeGlobalBackground({ url: 'file:///a/b/cover.JPG' }).type).toBe('image')
    expect(normalizeGlobalBackground({ url: 'file:///a/b/clip.webm' }).type).toBe('video')
    expect(normalizeGlobalBackground({ url: 'file:///a/b/notes.txt' }).type).toBe('none')
    expect(normalizeGlobalBackground({ type: 'video', url: '' }).type).toBe('none')
  })

  it('classifies picked files by MIME type first, then by extension', () => {
    expect(mediaTypeForFile('a.bin', 'video/mp4')).toBe('video')
    expect(mediaTypeForFile('a.bin', 'image/png')).toBe('image')
    expect(mediaTypeForFile('loop.MP4')).toBe('video')
    expect(mediaTypeForFile('cover.jpeg?raw=1')).toBe('image')
    expect(mediaTypeForFile('song.mp3')).toBeNull()
  })

  it('requires an enabled wallpaper with a known kind', () => {
    expect(isGlobalBackgroundActive(null)).toBe(false)
    expect(isGlobalBackgroundActive({ enable: true, type: 'none', url: 'file:///a.jpg' })).toBe(false)
    expect(isGlobalBackgroundActive({ enable: false, type: 'image', url: 'file:///a.jpg' })).toBe(false)
    expect(isGlobalBackgroundActive({ enable: true, type: 'image', url: 'file:///a.jpg' })).toBe(true)
  })

  it('builds the same CSS filter as the desktop renderer', () => {
    expect(buildGlobalBackgroundFilter({ blur: 10, brightness: 0.8 })).toBe(
      'blur(10px) brightness(0.8)'
    )
  })

  it('only rewrites native file paths', () => {
    expect(resolveGlobalBackgroundUrl('')).toBe('')
    expect(resolveGlobalBackgroundUrl('https://cdn/a.jpg')).toBe('https://cdn/a.jpg')
    expect(resolveGlobalBackgroundUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(resolveGlobalBackgroundUrl('file:///a.jpg')).toBe('file:///a.jpg')

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    expect(resolveGlobalBackgroundUrl('file:///a.jpg')).toBe('converted:file:///a.jpg')
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  it('rejects unsupported and oversized web picks', async () => {
    await expect(
      persistGlobalBackground(new File(['x'], 'song.mp3', { type: 'audio/mpeg' }))
    ).rejects.toThrow('仅支持图片或视频文件')

    await expect(
      persistGlobalBackground(
        new File([new Uint8Array(MAX_WEB_WALLPAPER_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' })
      )
    ).rejects.toThrow('文件过大')

    await expect(
      persistGlobalBackground(new File(['v'], 'clip.mp4', { type: 'video/mp4' }))
    ).rejects.toThrow('浏览器预览暂不支持视频壁纸')
  })

  it('ignores cleanup for non-wallpaper paths', async () => {
    const { Filesystem } = await import('@capacitor/filesystem')
    await deleteGlobalBackgroundFile('')
    await deleteGlobalBackgroundFile('https://cdn/a.jpg')
    expect(Filesystem.deleteFile).not.toHaveBeenCalled()
  })
})
