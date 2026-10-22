<template>
  <div
    class="cover"
    :class="{ round }"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: round ? '50%' : `${radius}px` }"
  >
    <img v-if="resolvedSrc && !failed" :src="resolvedSrc" :alt="alt" loading="lazy" @error="failed = true" />
    <div v-else class="fallback">
      <ion-icon :icon="musicalNotes" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IonIcon } from '@ionic/vue'
import { musicalNotes } from 'ionicons/icons'
import {
  fetchAndCacheCover,
  getCachedCover,
  isCacheableCoverUrl
} from '@/services/coverCache'

const props = withDefaults(
  defineProps<{
    src?: string
    alt?: string
    size?: number
    radius?: number
    round?: boolean
  }>(),
  {
    alt: '',
    size: 52,
    radius: 12,
    round: false
  }
)
const failed = ref(false)
/** 命中本地封面缓存时改用 data URL，避开图片 CDN 的短期缓存过期。 */
const cachedSrc = ref<string | undefined>()
const resolvedSrc = computed(() => cachedSrc.value ?? props.src)

let requestId = 0
watch(
  () => props.src,
  async (src) => {
    failed.value = false
    cachedSrc.value = undefined
    // 换图后旧结果不得回填（列表滚动时同一个组件会复用来渲染不同歌曲）。
    const current = ++requestId
    if (!isCacheableCoverUrl(src)) return
    const hit = await getCachedCover(src)
    if (current !== requestId) return
    if (hit) {
      cachedSrc.value = hit
      return
    }
    // 未命中就先显示网络地址，再补一份到本地，下次直接读缓存。
    void fetchAndCacheCover(src)
  },
  { immediate: true }
)
</script>

<style scoped>
.cover {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  background: linear-gradient(135deg, rgba(0, 218, 192, 0.26), rgba(80, 120, 255, 0.18));
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.88);
  font-size: 22px;
}
</style>
