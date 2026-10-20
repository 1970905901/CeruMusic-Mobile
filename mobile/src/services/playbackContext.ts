/**
 * Shared flags that must be readable without importing the player or room stores.
 * Kept dependency-free so player.ts can consult them without a circular import.
 */
let listenTogetherActive = false

export function setListenTogetherPlaybackActive(active: boolean): void {
  listenTogetherActive = active
}

export function isListenTogetherPlaybackActive(): boolean {
  return listenTogetherActive
}
