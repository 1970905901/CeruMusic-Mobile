<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/search" text="" />
        </ion-buttons>
        <ion-title>听歌识曲</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="recognize-head ceru-pad">
        <p class="eyebrow">MUSIC RECOGNITION</p>
        <h1 class="ceru-title">听见，就找到</h1>
        <p class="head-sub">录制周围最多 12 秒声音，或上传一段音频，由当前音源插件识别。</p>
      </div>

      <div class="mic-wrap">
        <button class="mic-button" :class="{ active: recording }" type="button" @click="toggleRecord">
          <ion-spinner v-if="busy" name="crescent" />
          <ion-icon v-else :icon="recording ? stopCircleOutline : micOutline" />
        </button>
        <div class="mic-caption">
          <strong>{{ recording ? '正在聆听' : busy ? '正在处理…' : '点击开始识别' }}</strong>
          <span>{{ statusText }}</span>
        </div>
      </div>
      <div class="tool-row">
        <ion-button fill="outline" :disabled="recording || busy" @click="pickFile">
          <ion-icon slot="start" :icon="cloudUploadOutline" />
          上传音频
        </ion-button>
        <ion-button v-if="results.length" fill="clear" @click="results = []">清除结果</ion-button>
      </div>
      <input ref="fileInput" class="file-input" type="file" accept="audio/*" @change="onFilePicked" />

      <div v-if="results.length" class="result-list ceru-pad">
        <div v-for="item in results" :key="item.title + item.artist" class="result-card ceru-card">
          <CoverImage :src="item.cover" :size="58" :radius="12" :alt="item.title" />
          <div class="result-copy">
            <div class="result-title ceru-truncate">{{ item.title }}</div>
            <div class="result-artist ceru-truncate">{{ item.artist }}</div>
          </div>
          <button type="button" class="result-play" aria-label="播放识别结果" @click="playResult(item)">
            <ion-icon :icon="playCircleOutline" />
          </button>
        </div>
      </div>

      <div v-if="!recognizeAction" class="notice ceru-pad">
        当前插件没有提供 recognize 命令，请安装支持听歌识曲的插件。
      </div>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  cloudUploadOutline,
  micOutline,
  playCircleOutline,
  stopCircleOutline
} from 'ionicons/icons'
import CoverImage from '@/components/CoverImage.vue'
import { usePluginStore } from '@/stores/plugins'
import { usePlayerStore } from '@/stores/player'

interface RecognitionResult {
  title: string
  artist: string
  cover?: string
  raw: Record<string, unknown>
}

const router = useIonRouter()
const plugins = usePluginStore()
const player = usePlayerStore()
const recording = ref(false)
const busy = ref(false)
const elapsed = ref(0)
const statusText = ref('等待开始')
const results = ref<RecognitionResult[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let chunks: Blob[] = []
let timer: ReturnType<typeof setInterval> | null = null
let startedAt = 0

const recognizeAction = computed(() =>
  plugins.actions.find((item) =>
    /recognize|识别|听歌识曲/i.test(item.id + ' ' + item.title + ' ' + item.action)
  )
)

const provider = computed(() => {
  const action = recognizeAction.value
  return (
    plugins.providers.find((item) => item.pluginKey === action?.pluginKey) ||
    plugins.providers[0] ||
    null
  )
})
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('加载 ' + src + ' 失败'))
    document.head.appendChild(script)
  })
}

async function ensureFingerprintRuntime(): Promise<void> {
  const global = window as any
  if (typeof global.GenerateFP === 'function') return
  if (!global.__afp_wasm_loaded__) {
    await loadScript('/afp.wasm.js').catch(() => undefined)
    global.__afp_wasm_loaded__ = true
  }
  if (!global.__afp_runtime_loaded__) {
    await loadScript('/afp.js')
    global.__afp_runtime_loaded__ = true
  }
  if (typeof global.GenerateFP !== 'function') throw new Error('音频指纹模块加载失败')
}

async function resampleTo8kMono(buffer: AudioBuffer): Promise<Float32Array> {
  const Offline = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
  const context = new Offline(1, Math.max(1, Math.floor(buffer.duration * 8000)), 8000)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  return (await context.startRendering()).getChannelData(0)
}

function normalizeResults(value: any): RecognitionResult[] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : Array.isArray(value?.songs)
        ? value.songs
        : []
  return list.map((item: any) => ({
    title: String(item?.name ?? item?.title ?? item?.songName ?? '未知歌曲'),
    artist: String(item?.singer ?? item?.artist ?? item?.subtitle ?? '未知艺术家'),
    cover: item?.img ?? item?.artworkUrl ?? item?.cover,
    raw: item && typeof item === 'object' ? item : { value: item }
  }))
}
async function recognizeBlob(blob: Blob): Promise<void> {
  const action = recognizeAction.value
  const source = provider.value
  if (!action || !source) throw new Error('当前没有可用的识别插件')
  busy.value = true
  statusText.value = '正在生成音频指纹…'
  const context = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const channel = decoded.getChannelData(0)
    let audible = false
    for (let index = 0; index < channel.length; index += 100) {
      if (Math.abs(channel[index]) > 0.01) {
        audible = true
        break
      }
    }
    if (!audible) throw new Error('没有检测到可识别的声音')
    const pcm = await resampleTo8kMono(decoded)
    const maxSamples = 12 * 8000
    const slice = pcm.length > maxSamples ? pcm.slice(0, maxSamples) : pcm
    await ensureFingerprintRuntime()
    const fingerprint = await (window as any).GenerateFP(slice)
    if (!fingerprint) throw new Error('无法生成音频指纹')
    statusText.value = '正在向音源识别…'
    const response = await plugins.invokeAction(action.pluginKey, action.id, {
      source: source.providerId,
      fp: fingerprint,
      duration: slice.length / 8000
    })
    results.value = normalizeResults(response)
    if (!results.value.length) throw new Error('没有识别到歌曲，请靠近声源或换一段音频')
    statusText.value = '识别到 ' + results.value.length + ' 个可能结果'
  } finally {
    await context.close().catch(() => undefined)
    busy.value = false
  }
}
async function toggleRecord(): Promise<void> {
  if (recording.value) {
    stopRecording()
    return
  }
  if (busy.value) return
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    await toast('当前系统不支持录音，请使用上传音频')
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeCandidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', '']
    const mime = mimeCandidates.find((value) => !value || MediaRecorder.isTypeSupported(value)) || ''
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || mime || 'audio/mp4' })
      chunks = []
      if (blob.size) {
        statusText.value = '正在识别录音…'
        void recognizeBlob(blob).catch((error) => {
          statusText.value = error instanceof Error ? error.message : String(error)
          void toast(statusText.value, 'danger')
        })
      }
    }
    startedAt = Date.now()
    elapsed.value = 0
    recording.value = true
    statusText.value = '请让音乐靠近麦克风'
    recorder.start(1000)
    timer = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
      if (elapsed.value >= 12) stopRecording()
    }, 250)
  } catch (error) {
    releaseStream()
    recording.value = false
    await toast(error instanceof Error ? error.message : '无法启动麦克风', 'danger')
  }
}

function stopRecording(): void {
  if (timer) clearInterval(timer)
  timer = null
  if (recorder && recorder.state !== 'inactive') recorder.stop()
  recorder = null
  releaseStream()
  recording.value = false
}

function releaseStream(): void {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}
function pickFile(): void {
  fileInput.value?.click()
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    statusText.value = '正在处理音频文件…'
    await recognizeBlob(file)
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '识别失败'
    await toast(statusText.value, 'danger')
  }
}

async function playResult(item: RecognitionResult): Promise<void> {
  const source = provider.value
  if (!source) {
    await toast('没有可用的音源插件', 'danger')
    return
  }
  try {
    const page = await plugins.searchTracks(source.providerId, item.title + ' ' + item.artist)
    const track = page.items[0]
    if (!track) {
      await toast('没有找到可播放的匹配歌曲')
      return
    }
    await player.playTrack(track)
    router.push('/player')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '播放失败', 'danger')
  }
}

async function toast(message: string, color = 'medium'): Promise<void> {
  const element = await toastController.create({ message, duration: 2400, color })
  await element.present()
}

onBeforeUnmount(() => {
  stopRecording()
  releaseStream()
})
</script>
<style scoped>
.recognize-head {
  padding-top: 18px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.head-sub {
  margin: 10px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.mic-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 42px 20px 26px;
}
.mic-button {
  width: 112px;
  height: 112px;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--ceru-brand-bright), var(--ceru-brand));
  color: #032b26;
  font-size: 48px;
  display: grid;
  place-items: center;
  box-shadow: 0 24px 60px rgba(0, 179, 155, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.mic-button.active {
  transform: scale(1.08);
  box-shadow: 0 0 0 12px rgba(0, 179, 155, 0.12), 0 24px 60px rgba(0, 179, 155, 0.36);
}
.mic-button:active {
  transform: scale(0.96);
}
.mic-caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  font-size: 13px;
  color: var(--ceru-text);
}
.mic-caption span {
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.tool-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.file-input {
  display: none;
}
.result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 28px;
}
.result-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.result-copy {
  min-width: 0;
  flex: 1;
}
.result-title {
  font-size: 15px;
  font-weight: 650;
}
.result-artist {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.result-play {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 30px;
  display: grid;
  place-items: center;
  padding: 6px;
}
.notice {
  padding-top: 24px;
  text-align: center;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.bottom-space {
  height: 120px;
}
</style>