import type { RoomState } from '@shiqianjiang/ceru-plugin-sdk'
import type { RoomMeta, RoomRole } from '@/services/listenTogetherApi'
import type { Track } from '@/types/music'

export interface PluginRoomSnapshot {
  room: RoomMeta | null
  members: unknown[]
  role: RoomRole | null
}

export function pluginRoomState(snapshot: PluginRoomSnapshot): RoomState {
  if (!snapshot.room) return { joined: false }
  return {
    joined: true,
    id: snapshot.room.code,
    title: snapshot.room.name,
    role: snapshot.role === 'owner' ? 'owner' : 'member',
    members: snapshot.members.length
  }
}

export function sameTrackRef(left: any, right: any): boolean {
  return (
    left?.kind === 'track' &&
    right?.kind === 'track' &&
    String(left?.providerId ?? '') === String(right?.providerId ?? '') &&
    String(left?.id ?? '') === String(right?.id ?? '')
  )
}

export function findTrackByRef(ref: unknown, tracks: readonly Track[]): Track | undefined {
  return tracks.find((track) => sameTrackRef(track.ref, ref))
}
