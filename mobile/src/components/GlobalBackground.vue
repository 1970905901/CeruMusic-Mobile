<template>
  <div v-if="active" class="global-background" aria-hidden="true">
    <div
      class="global-background-media"
      :style="{ opacity: background.opacity, filter: mediaFilter }"
    >
      <video
        v-if="background.type === 'video'"
        ref="videoRef"
        class="global-background-asset"
        :src="mediaUrl"
        loop
        muted
        autoplay
        playsinline
      />
      <img v-else class="global-background-asset" :src="mediaUrl" alt="" draggable="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import {
  buildGlobalBackgroundFilter,
  isGlobalBackgroundActive,
  resolveGlobalBackgroundUrl
} from '@/services/globalBackground'
import { useAppBackground } from '@/services/appVisibility'

const settings = useSettingsStore()
const videoRef = ref<HTMLVideoElement | null>(null)

const background = computed(() => settings.settings.globalBackground)
const active = computed(() => isGlobalBackgroundActive(background.value))
const mediaUrl = computed(() => resolveGlobalBackgroundUrl(background.value.url))
const mediaFilter = computed(() => buildGlobalBackgroundFilter(background.value))
/** 切后台时停掉视频解码，图片壁纸不受影响。 */
const { isAppBackground } = useAppBackground()

/** Browsers may reject autoplay; the still frame stays visible either way. */
function startVideo() {
  const video = videoRef.value
  if (!video) return
  video.load()
  void video.play().catch(() => undefined)
}

watch(
  [active, mediaUrl, () => isAppBackground.value],
  async ([enabled]) => {
    if (!enabled) return
    await nextTick()
    const video = videoRef.value
    if (!video) return
    // 后台不排队解码；回到前台后恢复播放（仍由浏览器决定是否允许自动播放）。
    if (isAppBackground.value) {
      video.pause()
      return
    }
    startVideo()
  },
  { flush: 'post' }
)

// Desktop parity: the wallpaper class owns page-level transparency rules.
watch(
  active,
  (enabled) => document.documentElement.classList.toggle('has-global-background', enabled),
  { immediate: true }
)

onBeforeUnmount(() => {
  document.documentElement.classList.remove('has-global-background')
})
</script>

<style scoped>
.global-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  background: var(--ceru-bg);
}

.global-background-media {
  position: absolute;
  top: -10%;
  left: -10%;
  width: 120%;
  height: 120%;
  transition: opacity 0.3s ease, filter 0.3s ease;
}

.global-background-asset {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
</style>
