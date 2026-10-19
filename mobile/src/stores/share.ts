import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Track } from '@/types/music'

export const useShareStore = defineStore('share', () => {
  const open = ref(false)
  const track = ref<Track | null>(null)

  function show(item: Track) {
    track.value = item
    open.value = true
  }

  function close() {
    open.value = false
  }

  return { open, track, show, close }
})
