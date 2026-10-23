import { describe, expect, it } from 'vitest'
import {
  PLAYLIST_EMPTY_DESCRIPTION,
  formatPlaylistTime,
  playlistDescriptionText,
  playlistSyncLabel,
  playlistSyncState,
  playlistTimeLine
} from './playlistCardMeta'

describe('playlist card metadata', () => {
  it('marks a playlist as synced only when it has a cloud copy', () => {
    expect(playlistSyncState({ cloudId: 'abc' })).toBe('synced')
    expect(playlistSyncState({ cloudId: '' })).toBeNull()
    expect(playlistSyncState({})).toBeNull()
    expect(playlistSyncState(null)).toBeNull()
  })

  it('has no label for an unsynced playlist', () => {
    expect(playlistSyncLabel('synced')).toBe('已同步')
    expect(playlistSyncLabel(null)).toBe('')
  })

  it('uses the desktop placeholder when the description is blank', () => {
    expect(playlistDescriptionText('   ')).toBe(PLAYLIST_EMPTY_DESCRIPTION)
    expect(playlistDescriptionText(undefined)).toBe(PLAYLIST_EMPTY_DESCRIPTION)
    expect(playlistDescriptionText(' 夜里的歌 ')).toBe('夜里的歌')
  })

  it('formats a readable minute-precision timestamp', () => {
    expect(formatPlaylistTime(new Date(2026, 0, 5, 9, 4))).toBe('2026-01-05 09:04')
  })

  it('hides the line instead of printing Invalid Date', () => {
    expect(formatPlaylistTime('not a date')).toBe('')
    expect(formatPlaylistTime(null)).toBe('')
    expect(formatPlaylistTime('')).toBe('')
  })

  it('prefers the cloud timestamp, then local update, then creation', () => {
    const cloud = new Date(2026, 4, 1, 12, 0)
    const updated = new Date(2026, 3, 1, 12, 0)
    const created = new Date(2026, 2, 1, 12, 0)
    // 云端时间优先：别的设备改过之后，卡片该显示最近一次真正变化的时刻。
    expect(playlistTimeLine({ cloudUpdatedAt: cloud, updatedAt: updated })).toBe(
      '更新于 2026-05-01 12:00'
    )
    expect(playlistTimeLine({ cloudUpdatedAt: null, updatedAt: updated, createdAt: created })).toBe(
      '更新于 2026-04-01 12:00'
    )
    expect(playlistTimeLine({ updatedAt: null, createdAt: created })).toBe('创建于 2026-03-01 12:00')
  })

  it('returns an empty line when no timestamp is usable', () => {
    expect(playlistTimeLine({})).toBe('')
    expect(playlistTimeLine({ cloudUpdatedAt: 'x', updatedAt: 'y', createdAt: 'z' })).toBe('')
  })
})
