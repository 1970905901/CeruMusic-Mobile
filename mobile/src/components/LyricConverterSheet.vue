<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.85"
    :breakpoints="[0, 0.5, 0.75, 0.85, 1]"
    @didDismiss="$emit('close')"
  >
    <div class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title>歌词导出</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="busy" @click="$emit('close')">关闭</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
        <div class="body">
          <template v-if="converters.length">
            <div class="field">
              <ion-label position="stacked">转换器</ion-label>
              <ion-select
                v-model="selectedKey"
                interface="action-sheet"
                cancel-text="取消"
                :disabled="busy"
              >
                <ion-select-option
                  v-for="converter in converters"
                  :key="converter.key"
                  :value="converter.key"
                >
                  {{ converter.title }} · {{ converter.pluginName }}
                </ion-select-option>
              </ion-select>
            </div>

            <div class="field">
              <ion-label position="stacked">导出格式</ion-label>
              <ion-select
                v-model="format"
                interface="action-sheet"
                cancel-text="取消"
                :disabled="busy"
              >
                <ion-select-option
                  v-for="item in exportFormats"
                  :key="item.value"
                  :value="item.value"
                >
                  {{ item.label }}
                </ion-select-option>
              </ion-select>
            </div>

            <ion-button expand="block" :disabled="busy || !hasLyrics" @click="exportLyrics">
              <ion-spinner v-if="busy" name="crescent" />
              <span>{{ busy ? '正在转换…' : '导出歌词' }}</span>
            </ion-button>

            <div class="parse-head">
              <span>从文本解析</span>
            </div>
            <div class="field">
              <ion-label position="stacked">输入格式</ion-label>
              <ion-select
                v-model="parseFormat"
                interface="action-sheet"
                cancel-text="取消"
                :disabled="busy"
              >
                <ion-select-option v-for="item in parseFormats" :key="item" :value="item">
                  {{ item.toUpperCase() }}
                </ion-select-option>
              </ion-select>
            </div>
            <div class="field">
              <ion-label position="stacked">歌词文本</ion-label>
              <ion-textarea
                v-model="parseText"
                placeholder="粘贴 LRC / QRC / KRC / TTML 等歌词"
                :auto-grow="true"
                :rows="4"
                :disabled="busy"
              />
            </div>
            <ion-button expand="block" fill="outline" :disabled="busy" @click="parseAndExport">
              <ion-spinner v-if="busy" name="crescent" />
              <span>{{ busy ? '正在转换…' : '解析并导出' }}</span>
            </ion-button>

            <template v-if="result">
              <div class="result-head">
                <span>导出结果</span>
                <div class="result-actions">
                  <ion-button size="small" fill="outline" @click="copyResult">复制</ion-button>
                  <ion-button size="small" fill="outline" @click="shareResult">分享</ion-button>
                </div>
              </div>
              <ion-textarea :value="result" :readonly="true" :auto-grow="true" :rows="8" />
            </template>

            <p v-if="error" class="error">{{ error }}</p>
          </template>

          <EmptyState
            v-else
            title="没有可用转换器"
            description="启用提供歌词转换能力的插件后，这里可以导出歌词。"
            :icon="textOutline"
          />
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonLabel,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import { Share } from '@capacitor/share'
import { Clipboard } from '@capacitor/clipboard'
import { textOutline } from 'ionicons/icons'
import EmptyState from '@/components/EmptyState.vue'
import {
  collectLyricConverters,
  toCrLyricDocument,
  LYRIC_EXPORT_FORMATS,
  LYRIC_PARSE_FORMATS,
  type LyricConverterEntry
} from '@/services/lyricConverters'
import { pluginRuntimeManager } from '@/services/plugin/runtime'
import type { LyricInputFormat } from '@shiqianjiang/ceru-plugin-sdk'
import type { LyricDocument, Track } from '@/types/music'
import { useSettingsStore } from '@/stores/settings'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  open?: boolean
  track?: Track | null
  document?: LyricDocument | null
}>()

defineEmits<{
  close: []
}>()

const pluginStore = usePluginStore()
const settings = useSettingsStore()
const selectedKey = ref('')
const format = ref<'lrc' | 'enhanced-lrc' | 'yrc' | 'ttml'>('lrc')
const parseText = ref('')
const parseFormat = ref<LyricInputFormat>('auto')
const result = ref('')
const error = ref('')
const busy = ref(false)

const converters = computed(() =>
  collectLyricConverters(pluginStore.enabledPlugins, {
    runtimeInfo: pluginStore.runtimeInfo
  })
)

const exportFormats = LYRIC_EXPORT_FORMATS.map((value) => ({
  value,
  label:
    value === 'lrc'
      ? 'LRC'
      : value === 'enhanced-lrc'
        ? 'Enhanced LRC'
        : value === 'yrc'
          ? 'YRC'
          : 'TTML'
}))

const selectedConverter = computed(() => converters.value.find((item) => item.key === selectedKey.value))
const parseFormats = computed(() => {
  const declared = selectedConverter.value?.inputFormats ?? []
  return declared.length ? declared : LYRIC_PARSE_FORMATS
})
const hasLyrics = computed(() =>
  !!props.document && (props.document.lines.length > 0 || !!props.document.plainText)
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    result.value = ''
    error.value = ''
    format.value = 'lrc'
    if (!converters.value.some((item) => item.key === selectedKey.value)) {
      selectedKey.value = converters.value[0]?.key ?? ''
    }
  }
)

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2400, color })
  await element.present()
}

async function exportLyrics() {
  if (!props.track || !props.document || !selectedConverter.value || busy.value) return
  const converter = selectedConverter.value
  busy.value = true
  error.value = ''
  try {
    const runtime = pluginRuntimeManager.get(converter.pluginKey)
    if (!runtime) throw new Error('插件未启用')
    const response = await runtime.invokeConverter(converter.converterId, 'export', {
      document: toCrLyricDocument(props.document, props.track, settings.settings.lyricOffsetMs || 0),
      format: format.value
    })
    if (!response?.text) throw new Error('转换器没有返回歌词')
    result.value = String(response.text)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function parseAndExport() {
  if (!props.track || !selectedConverter.value || busy.value) return
  const converter = selectedConverter.value
  const text = parseText.value.trim()
  if (!text) {
    error.value = '请输入歌词文本'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const runtime = pluginRuntimeManager.get(converter.pluginKey)
    if (!runtime) throw new Error('插件未启用')
    const ref = JSON.parse(JSON.stringify(props.track.ref))
    const document = await runtime.invokeConverter(converter.converterId, 'parse', {
      track: ref,
      format: parseFormat.value,
      text
    })
    if (!document || (!Array.isArray(document.lines) && !document.plainText)) {
      throw new Error('转换器没有返回有效歌词')
    }
    const exported = await runtime.invokeConverter(converter.converterId, 'export', {
      document,
      format: format.value
    })
    if (!exported?.text) throw new Error('转换器没有返回导出结果')
    result.value = String(exported.text)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function copyResult() {
  if (!result.value) return
  try {
    await Clipboard.write({ string: result.value })
    await toast('已复制')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '复制失败', 'danger')
  }
}

async function shareResult() {
  if (!result.value) return
  try {
    await Share.share({ text: result.value, dialogTitle: '分享歌词' })
  } catch {
    // Closing the system share sheet is not an error.
  }
}
</script>

<style scoped>
.modal-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.body {
  padding: 16px 14px calc(24px + env(safe-area-inset-bottom));
}
.field {
  margin-bottom: 14px;
}
.field ion-label {
  display: block;
  margin-bottom: 7px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
ion-button ion-spinner {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}
.parse-head {
  display: flex;
  align-items: center;
  margin: 18px 0 10px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  font-weight: 650;
}
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.result-actions {
  display: flex;
  gap: 8px;
}
.error {
  margin: 12px 0 0;
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
}
</style>
