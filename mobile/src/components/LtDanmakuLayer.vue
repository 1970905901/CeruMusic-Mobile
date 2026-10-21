<template>
  <div v-if="visible" class="lt-danmaku" aria-hidden="true">
    <div
      v-for="item in flying"
      :key="item.id"
      class="danmaku-item"
      :class="{ self: item.isSelf }"
      :style="{
        top: danmakuTopPercent(item.track) + '%',
        animationDuration: item.duration + 'ms',
        fontSize: item.fontSize + 'px'
      }"
    >
      <CoverImage v-if="item.avatar" :src="item.avatar" :size="16" round :alt="item.nickname" class="danmaku-avatar" />
      <span class="danmaku-name">{{ item.nickname }}</span>
      <span class="danmaku-sep">:</span>
      <span class="danmaku-text">{{ item.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CoverImage from '@/components/CoverImage.vue'
import { useListenTogetherStore } from '@/stores/listenTogether'
import { useSettingsStore } from '@/stores/settings'
import {
  DANMAKU_TRACK_COUNT,
  buildDanmaku,
  danmakuTopPercent,
  isDanmakuCandidate,
  pickDanmakuTrack,
  type DanmakuSpan
} from '@/services/ltDanmaku'

const lt = useListenTogetherStore()
const settings = useSettingsStore()

const flying = ref<DanmakuSpan[]>([])
/** 每条轨道上次发出弹幕的时间；选轨道时挑最早的几条里随机 */
const trackLastUsed = ref<number[]>(new Array(DANMAKU_TRACK_COUNT).fill(0))
/** 进房时已有的历史不重放，只处理之后新增的消息 */
const seenIds = ref<Set<string>>(new Set())
const cleanupTimers = new Set<ReturnType<typeof setTimeout>>()

const visible = computed(() => lt.inRoom && settings.settings.ltDanmakuEnabled)

function spawn(message: Parameters<typeof buildDanmaku>[0]) {
  if (!isDanmakuCandidate(message)) return
  const picked = pickDanmakuTrack(trackLastUsed.value, Date.now())
  trackLastUsed.value = picked.lastUsed
  const span = buildDanmaku(message, picked.track, {
    myUserId: lt.userId,
    speed: settings.settings.ltDanmakuSpeed,
    fontScale: settings.settings.ltDanmakuFontScale
  })
  if (!span) return
  flying.value = [...flying.value, span]
  const timer = setTimeout(() => {
    cleanupTimers.delete(timer)
    flying.value = flying.value.filter((item) => item.id !== span.id)
  }, span.duration + 500)
  cleanupTimers.add(timer)
}

function clearFlying() {
  flying.value = []
  cleanupTimers.forEach(clearTimeout)
  cleanupTimers.clear()
}

function primeSeen() {
  const next = new Set<string>(seenIds.value)
  for (const message of lt.chat) next.add(message.id)
  seenIds.value = next
}

watch(
  () => lt.chat.length,
  () => {
    const next = new Set(seenIds.value)
    for (const message of lt.chat) {
      if (next.has(message.id)) continue
      next.add(message.id)
      if (lt.inRoom && visible.value) spawn(message)
    }
    seenIds.value = next
  }
)

watch(
  () => lt.inRoom,
  (inRoom) => {
    if (!inRoom) {
      clearFlying()
      seenIds.value = new Set()
      trackLastUsed.value = new Array(DANMAKU_TRACK_COUNT).fill(0)
      return
    }
    primeSeen()
  },
  { immediate: true }
)

/** 关掉开关时清掉在飞的弹幕，否则会停在屏幕上等动画跑完 */
watch(visible, (enabled) => {
  if (!enabled) clearFlying()
})

onBeforeUnmount(() => {
  clearFlying()
})
</script>

<style scoped>
/* 只覆盖歌词所在的上半屏中部，避免挡住播放控制与底部操作栏 */
.lt-danmaku {
  position: absolute;
  top: 96px;
  left: 0;
  right: 0;
  bottom: 46%;
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
}
.danmaku-item {
  position: absolute;
  left: 100%;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 62%;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  animation-name: danmaku-fly;
  animation-timing-function: linear;
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}
.danmaku-item.self {
  background: rgba(64, 158, 255, 0.38);
  color: rgba(255, 255, 255, 0.95);
}
.danmaku-avatar {
  flex: 0 0 auto;
  opacity: 0.85;
}
.danmaku-name {
  font-weight: 500;
  opacity: 0.78;
}
.danmaku-sep {
  opacity: 0.5;
}
.danmaku-text {
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.95;
}
@keyframes danmaku-fly {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(calc(-100% - 100vw));
  }
}
</style>
