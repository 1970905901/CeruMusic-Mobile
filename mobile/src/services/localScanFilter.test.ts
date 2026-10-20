import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

const mockDbStore: Record<string, any[]> = {
  favorites: [],
  playlists: [],
  history: [],
  localTracks: [],
  tracks: []
}

vi.mock('@/services/db', () => ({
  toPlain: (val: any) => JSON.parse(JSON.stringify(val)),
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async (name: string) => mockDbStore[name] || []),
    put: vi.fn(async (name: string, val: any) => {
      mockDbStore[name] = mockDbStore[name] || []
      const existingIdx = mockDbStore[name].findIndex((x: any) => (x.key && x.key === val.key) || (x.id && x.id === val.id))
      if (existingIdx >= 0) mockDbStore[name][existingIdx] = val
      else mockDbStore[name].push(val)
    }),
    transaction: vi.fn(() => ({
      store: {
        put: vi.fn()
      },
      done: Promise.resolve()
    }))
  }))
}))

const mockFilesystemFiles: Record<string, string> = {}
let readdirFiles: any[] = []

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS', External: 'EXTERNAL', Data: 'DATA' },
  Filesystem: {
    readdir: vi.fn(async () => ({ files: readdirFiles })),
    readFile: vi.fn(async ({ path }: { path: string }) => ({
      data: mockFilesystemFiles[path] || 'AQIDBA=='
    })),
    writeFile: vi.fn(async () => ({ uri: 'file:///mock/data' })),
    getUri: vi.fn(async ({ path }: { path: string }) => ({ uri: `file:///data/${path}` })),
    deleteFile: vi.fn(async () => {})
  }
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'ios'),
    isNativePlatform: vi.fn(() => true),
    convertFileSrc: vi.fn((src: string) => src)
  },
  registerPlugin: vi.fn(() => ({}))
}))

vi.mock('music-metadata-browser', () => ({
  parseBlob: vi.fn(async (blob: Blob) => {
    const name = (blob as any).name || ''
    if (name.includes('short')) {
      return {
        format: { duration: 12 },
        common: { title: 'Short Sound', artist: 'Effect', artists: ['Effect'] }
      }
    }
    if (name.includes('normal')) {
      return {
        format: { duration: 215 },
        common: { title: 'Normal Song', artist: 'Artist', artists: ['Artist'] }
      }
    }
    return {
      format: { duration: 180 },
      common: { title: 'Test Song', artist: 'Artist', artists: ['Artist'] }
    }
  })
}))

describe('Local Music Scan & Filter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    for (const key of Object.keys(mockDbStore)) {
      mockDbStore[key] = []
    }
  })

  it('provides default scan filter values in settings store', () => {
    const settings = useSettingsStore()
    expect(settings.settings.localScanFilterMinSizeKb).toBe(100)
    expect(settings.settings.localScanFilterMinDurationSec).toBe(30)

    settings.settings.localScanFilterMinSizeKb = 300
    settings.settings.localScanFilterMinDurationSec = 60
    expect(settings.settings.localScanFilterMinSizeKb).toBe(300)
    expect(settings.settings.localScanFilterMinDurationSec).toBe(60)

    settings.settings.localScanFilterMinSizeKb = 0
    settings.settings.localScanFilterMinDurationSec = 0
    expect(settings.settings.localScanFilterMinSizeKb).toBe(0)
    expect(settings.settings.localScanFilterMinDurationSec).toBe(0)
  })

  it('filters out small and short files during scanLocalMusic', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    await library.init()

    readdirFiles = [
      { name: 'tiny_sound.mp3', size: 40 * 1024, type: 'file' },
      { name: 'short_notice.mp3', size: 1024 * 1024, type: 'file' },
      { name: 'normal_track.mp3', size: 6 * 1024 * 1024, type: 'file' }
    ]

    const result = await library.scanLocalMusic({ minSizeKb: 100, minDurationSec: 30 })

    expect(result.filteredSizeCount).toBe(1)
    expect(result.filteredDurationCount).toBe(1)
    expect(result.imported).toHaveLength(1)
    expect(result.imported[0].title).toBe('Normal Song')
    expect(result.skippedCount).toBe(2)

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('Normal Song')
  })

  it('imports all files when filters are disabled (set to 0)', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    await library.init()

    readdirFiles = [
      { name: 'short_clip.mp3', size: 50 * 1024, type: 'file' },
      { name: 'normal_music.mp3', size: 4 * 1024 * 1024, type: 'file' }
    ]

    const result = await library.scanLocalMusic({ minSizeKb: 0, minDurationSec: 0 })

    expect(result.filteredSizeCount).toBe(0)
    expect(result.filteredDurationCount).toBe(0)
    expect(result.imported).toHaveLength(2)
  })

  it('enforces size and duration options in importLocalFile', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    await library.init()

    const smallBlob = new Blob([new Uint8Array(20 * 1024)])
    const smallFile = new File([smallBlob], 'small.mp3', { type: 'audio/mpeg' })
    const smallResult = await library.importLocalFile(smallFile, { minSizeKb: 100 })
    expect(smallResult).toBeNull()

    const shortBlob = new Blob([new Uint8Array(2 * 1024 * 1024)])
    const shortFile = new File([shortBlob], 'short.mp3', { type: 'audio/mpeg' })
    const shortResult = await library.importLocalFile(shortFile, { minDurationSec: 30 })
    expect(shortResult).toBeNull()

    const normalBlob = new Blob([new Uint8Array(3 * 1024 * 1024)])
    const normalFile = new File([normalBlob], 'normal.mp3', { type: 'audio/mpeg' })
    const normalResult = await library.importLocalFile(normalFile, { minSizeKb: 100, minDurationSec: 30 })
    expect(normalResult).toBeTruthy()
    expect(normalResult?.title).toBe('Normal Song')
  })
})