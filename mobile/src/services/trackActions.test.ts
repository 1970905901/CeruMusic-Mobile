import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Track } from '@/types/music'
import { openTrackActions, addTracksToPlaylistDialog } from '@/services/trackActions'

let createdSheetOptions: any = null

vi.mock('@ionic/vue', () => ({
  actionSheetController: {
    create: vi.fn(async (options: any) => {
      createdSheetOptions = options
      return {
        present: vi.fn(async () => {})
      }
    })
  },
  alertController: {
    create: vi.fn(async () => ({ present: vi.fn(), onDidDismiss: vi.fn() }))
  },
  toastController: {
    create: vi.fn(async () => ({ present: vi.fn() }))
  }
}))

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: { write: vi.fn() }
}))

vi.mock('@/stores/player', () => ({
  usePlayerStore: () => ({ insertNext: vi.fn() })
}))

vi.mock('@/stores/library', () => ({
  useLibraryStore: () => ({
    isFavorite: vi.fn(() => false),
    toggleFavorite: vi.fn(),
    playlists: []
  })
}))

vi.mock('@/stores/downloads', () => ({
  useDownloadStore: () => ({ createDownload: vi.fn() })
}))

vi.mock('@/stores/plugins', () => ({
  usePluginStore: () => ({ menus: [] })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ authenticated: false })
}))

vi.mock('@/stores/share', () => ({
  useShareStore: () => ({ show: vi.fn() })
}))

const sampleTrack: Track = {
  key: 'plugin-test:track:1',
  ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
  title: 'Test Song',
  artists: ['Test Artist'],
  album: 'Test Album',
  albumId: 'album-1',
  durationMs: 180000,
  qualities: ['128k'],
  playable: true,
  raw: {},
  source: 'plugin'
}

describe('trackActions', () => {
  beforeEach(() => {
    createdSheetOptions = null
  })

  it('creates action sheet with standard buttons', async () => {
    await openTrackActions(sampleTrack)
    expect(createdSheetOptions).toBeTruthy()
    expect(createdSheetOptions.header).toBe('Test Song')
    const buttonTexts = createdSheetOptions.buttons.map((b: any) => b.text)
    expect(buttonTexts).toContain('下一首播放')
    expect(buttonTexts).toContain('添加到歌单')
    expect(buttonTexts).toContain('收藏')
    expect(buttonTexts).toContain('下载')
    expect(buttonTexts).toContain('分享链接')
    expect(buttonTexts).toContain('复制歌曲信息')
    expect(buttonTexts).toContain('取消')
  })

  it('includes extra buttons when supplied in options', async () => {
    const customHandler = vi.fn()
    await openTrackActions(sampleTrack, {
      extraButtons: [
        {
          text: '从记录中移除',
          role: 'destructive',
          handler: customHandler
        }
      ]
    })
    expect(createdSheetOptions).toBeTruthy()
    const extraBtn = createdSheetOptions.buttons.find((b: any) => b.text === '从记录中移除')
    expect(extraBtn).toBeTruthy()
    expect(extraBtn.role).toBe('destructive')
    extraBtn.handler()
    expect(customHandler).toHaveBeenCalled()
  })

  it('creates action sheet for batch adding to playlist', async () => {
    await addTracksToPlaylistDialog([sampleTrack])
    expect(createdSheetOptions).toBeTruthy()
    expect(createdSheetOptions.header).toBe('将 1 首歌曲添加到歌单')
    const buttonTexts = createdSheetOptions.buttons.map((b: any) => b.text)
    expect(buttonTexts).toContain('新建歌单…')
    expect(buttonTexts).toContain('取消')
  })
})
