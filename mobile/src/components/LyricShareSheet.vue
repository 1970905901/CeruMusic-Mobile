<template>
  <ion-modal
    class="lyric-share-modal"
    :is-open="open"
    :initial-breakpoint="0.88"
    :breakpoints="[0, 0.55, 0.88, 1]"
    @didDismiss="$emit('close')"
  >
    <div class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title>分享与复制歌词</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">关闭</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
        <div class="sheet-body ceru-pad">
          <div v-if="track" class="track-header-card">
            <CoverImage :src="track.artworkUrl" :size="54" :radius="12" :alt="track.title" />
            <div class="track-info">
              <strong class="ceru-truncate">{{ track.title }}</strong>
              <span class="ceru-truncate">{{ track.artists.join(' / ') || '未知艺术家' }}</span>
              <small v-if="track.album" class="ceru-truncate">{{ track.album }}</small>
            </div>
          </div>

          <div class="options-bar">
            <div class="options-group">
              <button
                v-if="hasTranslation"
                type="button"
                class="option-chip"
                :class="{ active: includeTranslation }"
                @click="includeTranslation = !includeTranslation"
              >
                翻译
              </button>
              <button
                v-if="hasRomanization"
                type="button"
                class="option-chip"
                :class="{ active: includeRomanization }"
                @click="includeRomanization = !includeRomanization"
              >
                音译
              </button>
              <button
                type="button"
                class="option-chip"
                :class="{ active: includeTimestamp }"
                @click="includeTimestamp = !includeTimestamp"
              >
                时间戳
              </button>
            </div>

            <div class="selection-actions">
              <span class="count-badge">已选 {{ selectedCount }} 行</span>
              <button type="button" class="text-action-btn" @click="selectAll">全选</button>
              <button type="button" class="text-action-btn" @click="invertSelection">反选</button>
              <button type="button" class="text-action-btn" @click="clearSelection">清空</button>
            </div>
          </div>

          <div v-if="lines.length" class="lines-container">
            <div
              v-for="(line, idx) in lines"
              :key="idx"
              class="lyric-row"
              :class="{ selected: isSelected(idx) }"
              @click="toggleLine(idx)"
            >
              <div class="check-box">
                <ion-icon :icon="isSelected(idx) ? checkmarkCircle : ellipseOutline" />
              </div>
              <div class="line-content">
                <div class="main-text">
                  <span v-if="includeTimestamp" class="time-tag">{{ formatLyricTimestamp(line.startMs) }}</span>
                  <span>{{ line.text }}</span>
                </div>
                <div v-if="includeTranslation && line.translation" class="sub-text translation">
                  {{ line.translation }}
                </div>
                <div v-if="includeRomanization && line.romanization" class="sub-text romanization">
                  {{ line.romanization }}
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="document.plainText" class="plain-container">
            <p class="plain-body">{{ document.plainText }}</p>
          </div>

          <div v-else class="empty-lyrics">
            <p>暂无歌词可供选择与分享</p>
          </div>

          <div v-if="previewText" class="preview-card">
            <div class="preview-title">预览文本</div>
            <pre class="preview-content">{{ previewText }}</pre>
          </div>
        </div>
      </ion-content>

      <ion-footer class="sheet-footer">
        <div class="action-buttons-row">
          <ion-button expand="block" fill="outline" class="footer-btn" :disabled="!hasContentToExport" @click="handleCopy">
            <ion-icon slot="start" :icon="copyOutline" />
            复制歌词
          </ion-button>
          <ion-button expand="block" class="footer-btn" :disabled="!hasContentToExport" @click="handleShare">
            <ion-icon slot="start" :icon="shareOutline" />
            系统分享
          </ion-button>
        </div>
      </ion-footer>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  toastController
} from '@ionic/vue'
import {
  checkmarkCircle,
  ellipseOutline,
  copyOutline,
  shareOutline
} from 'ionicons/icons'
import CoverImage from '@/components/CoverImage.vue'
import type { LyricDocument, LyricLine, Track } from '@/types/music'
import {
  buildLyricShareText,
  copyLyricText,
  formatLyricTimestamp,
  shareLyricText
} from '@/services/lyricShare'

const props = defineProps<{
  open: boolean
  track?: Track | null
  document: LyricDocument
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const selected = ref<Set<number>>(new Set())
const includeTranslation = ref(true)
const includeRomanization = ref(false)
const includeTimestamp = ref(false)

const lines = computed<LyricLine[]>(() => props.document?.lines ?? [])

const hasTranslation = computed(() => lines.value.some((l) => Boolean(l.translation?.trim())))
const hasRomanization = computed(() => lines.value.some((l) => Boolean(l.romanization?.trim())))

const selectableIndices = computed(() =>
  lines.value
    .map((l, idx) => (l.text && l.text.trim().length > 0 ? idx : -1))
    .filter((idx) => idx >= 0)
)

const selectedCount = computed(() =>
  lines.value.length ? Array.from(selected.value).filter((idx) => selectableIndices.value.includes(idx)).length : (props.document?.plainText ? 1 : 0)
)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (lines.value.length > 0) {
        selected.value = new Set(selectableIndices.value)
      } else {
        selected.value = new Set()
      }
    }
  },
  { immediate: true }
)

function isSelected(idx: number): boolean {
  return selected.value.has(idx)
}

function toggleLine(idx: number) {
  const next = new Set(selected.value)
  if (next.has(idx)) {
    next.delete(idx)
  } else {
    next.add(idx)
  }
  selected.value = next
}

function selectAll() {
  selected.value = new Set(selectableIndices.value)
}

function invertSelection() {
  const next = new Set<number>()
  for (const idx of selectableIndices.value) {
    if (!selected.value.has(idx)) {
      next.add(idx)
    }
  }
  selected.value = next
}

function clearSelection() {
  selected.value = new Set()
}

const previewText = computed(() => {
  return buildLyricShareText({
    track: props.track,
    lines: lines.value,
    selectedIndices: selected.value,
    includeTranslation: includeTranslation.value,
    includeRomanization: includeRomanization.value,
    includeTimestamp: includeTimestamp.value,
    plainTextFallback: props.document?.plainText || ''
  })
})

const hasContentToExport = computed(() => previewText.value.trim().length > 0)

async function showToast(message: string, color = 'medium') {
  const toast = await toastController.create({
    message,
    duration: 2000,
    color
  })
  await toast.present()
}

async function handleCopy() {
  if (!hasContentToExport.value) return
  const success = await copyLyricText(previewText.value)
  if (success) {
    void showToast(`已复制 ${selectedCount.value} 行歌词`)
    emit('close')
  } else {
    void showToast('复制失败，请检查剪贴板权限', 'danger')
  }
}

async function handleShare() {
  if (!hasContentToExport.value) return
  const title = props.track?.title ? `《${props.track.title}》歌词` : '分享歌词'
  const success = await shareLyricText(title, previewText.value)
  if (success) {
    emit('close')
  }
}
</script>

<style scoped>
.lyric-share-modal {
  --border-radius: 20px 20px 0 0;
}

.modal-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sheet-body {
  padding-bottom: 24px;
}

.track-header-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.06));
  border-radius: 14px;
  margin-bottom: 12px;
}

.track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.track-info strong {
  font-size: 15px;
  color: var(--ion-text-color);
}

.track-info span {
  font-size: 13px;
  color: var(--ion-color-step-600, #999);
}

.track-info small {
  font-size: 12px;
  color: var(--ion-color-step-450, #bbb);
}

.options-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.options-group {
  display: flex;
  gap: 6px;
}

.option-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.08));
  border: 1px solid transparent;
  color: var(--ion-text-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-chip.active {
  background: rgba(var(--ion-color-primary-rgb, 0, 218, 192), 0.18);
  border-color: var(--ion-color-primary);
  color: var(--ion-color-primary);
  font-weight: 600;
}

.selection-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  font-size: 12px;
  color: var(--ion-color-step-600, #888);
}

.text-action-btn {
  background: none;
  border: none;
  font-size: 12px;
  color: var(--ion-color-primary);
  padding: 2px 4px;
  cursor: pointer;
}

.lines-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  max-height: 380px;
  overflow-y: auto;
  border-radius: 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.03));
  padding: 8px;
}

.lyric-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.lyric-row:active,
.lyric-row.selected {
  background: rgba(var(--ion-color-primary-rgb, 0, 218, 192), 0.08);
}

.check-box {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--ion-color-step-400, #aaa);
  margin-top: 1px;
}

.lyric-row.selected .check-box {
  color: var(--ion-color-primary);
}

.line-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.main-text {
  font-size: 14px;
  line-height: 1.4;
  color: var(--ion-text-color);
  word-break: break-word;
}

.time-tag {
  font-size: 11px;
  font-family: monospace;
  color: var(--ion-color-primary);
  margin-right: 6px;
  opacity: 0.85;
}

.sub-text {
  font-size: 12px;
  line-height: 1.35;
  color: var(--ion-color-step-600, #888);
  word-break: break-word;
}

.plain-container {
  padding: 14px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.05));
  border-radius: 12px;
  margin-bottom: 14px;
}

.plain-body {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--ion-text-color);
  margin: 0;
}

.empty-lyrics {
  text-align: center;
  padding: 30px 0;
  color: var(--ion-color-step-500, #777);
  font-size: 14px;
}

.preview-card {
  padding: 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.04));
  border-radius: 12px;
  margin-top: 10px;
}

.preview-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ion-color-step-600, #999);
  margin-bottom: 6px;
}

.preview-content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ion-text-color);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
  margin: 0;
  font-family: inherit;
}

.sheet-footer {
  padding: 10px 16px calc(10px + var(--ion-safe-area-bottom, 0px));
  background: var(--ion-background-color, #121212);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.action-buttons-row {
  display: flex;
  gap: 12px;
}

.footer-btn {
  flex: 1;
  margin: 0;
  --border-radius: 12px;
  font-weight: 600;
}
</style>