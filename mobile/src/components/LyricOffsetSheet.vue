<template>
  <ion-modal
    class="lyric-offset-modal"
    :is-open="open"
    :initial-breakpoint="0.5"
    :breakpoints="[0, 0.5, 0.75]"
    @didDismiss="$emit('close')"
  >
    <div class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title>歌词时间微调</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">完成</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
        <div class="sheet-body ceru-pad">
          <div v-if="track" class="track-header-card">
            <CoverImage :src="track.artworkUrl" :size="50" :radius="10" :alt="track.title" />
            <div class="track-info">
              <strong class="ceru-truncate">{{ track.title }}</strong>
              <span class="ceru-truncate">{{ track.artists.join(' / ') || '未知艺术家' }}</span>
            </div>
          </div>

          <div class="offset-display-card">
            <div class="offset-label">当前时间轴偏移</div>
            <div class="offset-value" :class="{ positive: offsetMs > 0, negative: offsetMs < 0 }">
              {{ formattedOffset }}
            </div>
            <p class="offset-hint">
              正值歌词提前出现（赶上人声），负值歌词延后出现（等待人声）。微调仅针对当前歌曲持久保存。
            </p>
          </div>

          <div class="stepper-row">
            <button type="button" class="step-btn" @click="bump(-500)">-0.5s</button>
            <button type="button" class="step-btn" @click="bump(-100)">-0.1s</button>
            <button type="button" class="step-btn reset" :disabled="offsetMs === 0" @click="reset">复位</button>
            <button type="button" class="step-btn" @click="bump(100)">+0.1s</button>
            <button type="button" class="step-btn" @click="bump(500)">+0.5s</button>
          </div>

          <div class="range-wrap">
            <div class="range-labels">
              <span>-5.0s (延后)</span>
              <span>0s</span>
              <span>+5.0s (提前)</span>
            </div>
            <ion-range
              :value="offsetMs"
              :min="-5000"
              :max="5000"
              :step="50"
              :pin="true"
              class="offset-slider"
              aria-label="歌词时间轴偏移调节"
              @ionChange="setOffset($event.detail.value)"
            />
          </div>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonRange
} from '@ionic/vue'
import CoverImage from '@/components/CoverImage.vue'
import type { Track } from '@/types/music'
import { useLyricExtrasStore } from '@/stores/lyricExtras'

const props = defineProps<{
  open: boolean
  track?: Track | null
}>()

defineEmits<{
  (e: 'close'): void
}>()

const lyricExtras = useLyricExtrasStore()

const offsetMs = computed(() => {
  if (!props.track?.key) return 0
  return lyricExtras.getOffset(props.track.key)
})

const formattedOffset = computed(() => {
  const ms = offsetMs.value
  if (ms === 0) return '0.00 秒 (原速对齐)'
  const sign = ms > 0 ? '+' : ''
  const sec = (ms / 1000).toFixed(2)
  return `${sign}${sec} 秒 (${ms > 0 ? '提前' : '延后'})`
})

function setOffset(val: any) {
  if (!props.track?.key) return
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isFinite(num)) {
    lyricExtras.setOffset(props.track.key, num)
  }
}

function bump(deltaMs: number) {
  if (!props.track?.key) return
  lyricExtras.bumpOffset(props.track.key, deltaMs)
}

function reset() {
  if (!props.track?.key) return
  lyricExtras.resetOffset(props.track.key)
}
</script>

<style scoped>
.lyric-offset-modal {
  --border-radius: 20px 20px 0 0;
}

.modal-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sheet-body {
  padding-bottom: 28px;
}

.track-header-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  margin-bottom: 14px;
}

.track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.track-info strong {
  font-size: 14px;
  color: var(--ion-text-color);
}

.track-info span {
  font-size: 12px;
  color: var(--ion-color-step-600, #999);
}

.offset-display-card {
  text-align: center;
  padding: 16px 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.04));
  border-radius: 14px;
  margin-bottom: 16px;
}

.offset-label {
  font-size: 12px;
  color: var(--ion-color-step-600, #888);
  margin-bottom: 6px;
}

.offset-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--ion-text-color);
  font-family: monospace;
}

.offset-value.positive {
  color: var(--ion-color-primary, #00dac0);
}

.offset-value.negative {
  color: var(--ion-color-warning, #ffb300);
}

.offset-hint {
  font-size: 12px;
  line-height: 1.45;
  color: var(--ion-color-step-500, #777);
  margin: 8px 0 0;
}

.stepper-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 18px;
}

.step-btn {
  flex: 1;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.08));
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: var(--ion-text-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.step-btn:active {
  background: rgba(var(--ion-color-primary-rgb, 0, 218, 192), 0.2);
  color: var(--ion-color-primary);
}

.step-btn.reset {
  color: var(--ion-color-primary);
}

.step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.range-wrap {
  padding: 0 4px;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ion-color-step-500, #777);
  margin-bottom: 2px;
}

.offset-slider {
  --bar-height: 4px;
  --knob-size: 20px;
}
</style>