import { describe, expect, it } from 'vitest'
import { findTrackByRef, pluginRoomState, sameTrackRef } from '@/services/pluginRooms'
import type { Track } from '@/types/music'

const track = {
  key: 'plugin-a:wy:42',
  ref: { pluginId: 'plugin.a', providerId: 'wy', kind: 'track', id: '42' }
} as unknown as Track

describe('plugin rooms', () => {
  it('maps active and inactive room state', () => {
    expect(pluginRoomState({ room: null, members: [], role: null })).toEqual({ joined: false })
    expect(
      pluginRoomState({
        room: {
          code: 'ABC123',
          mode: 'group',
          ownerId: 'u1',
          name: 'Night room',
          maxMembers: 10,
          createdAt: 0
        },
        members: [1, 2],
        role: 'owner'
      })
    ).toEqual({
      joined: true,
      id: 'ABC123',
      title: 'Night room',
      role: 'owner',
      members: 2
    })
  })

  it('matches track refs safely', () => {
    expect(sameTrackRef(track.ref, { providerId: 'wy', kind: 'track', id: 42 })).toBe(true)
    expect(sameTrackRef(track.ref, { providerId: 'wy', kind: 'track', id: '43' })).toBe(false)
    expect(findTrackByRef({ providerId: 'wy', kind: 'track', id: '42' }, [track])).toBe(track)
    expect(findTrackByRef({ providerId: 'wy', kind: 'track', id: '43' }, [track])).toBeUndefined()
  })
})
