<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>AI 音乐助手</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" aria-label="清空对话" :disabled="!messages.length || sending" @click="clearChat">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
          <ion-button fill="clear" aria-label="AI 设置" @click="openSettings">
            <ion-icon slot="icon-only" :icon="settingsOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="scrollContent" :fullscreen="true" class="ai-content">
      <div v-if="!configured" class="setup-card ceru-pad">
        <div class="ai-orb"><ion-icon :icon="sparklesOutline" /></div>
        <h1 class="ceru-title">连接你的 AI</h1>
        <p>使用自己的 DeepSeek、OpenAI、硅基流动或任意 OpenAI 兼容服务。密钥只保存在本机。</p>
        <ion-button expand="block" @click="openSettings">配置 AI 服务</ion-button>
      </div>

      <div v-else-if="!messages.length" class="welcome ceru-pad">
        <div class="ai-orb"><ion-icon :icon="sparklesOutline" /></div>
        <h1 class="ceru-title">今天想聊什么音乐？</h1>
        <p>可以让我推荐歌曲、分析歌词、解释编曲，或按心情和场景生成歌单。</p>
        <button
          v-if="player.currentTrack"
          type="button"
          class="now-playing-prompt"
          @click="askAboutCurrent"
        >
          <CoverImage :src="player.currentTrack.artworkUrl" :size="44" :radius="10" :alt="player.currentTrack.title" />
          <span class="ceru-truncate">分析正在播放：{{ player.currentTrack.title }}</span>
          <ion-icon :icon="chevronForward" />
        </button>
        <div class="suggestions">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="suggestion"
            @click="sendText(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>

      <div v-else class="messages ceru-pad">
        <article
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="message.role"
        >
          <div class="message-avatar">
            <ion-icon :icon="message.role === 'user' ? personOutline : sparklesOutline" />
          </div>
          <div class="message-body">
            <div class="message-text">{{ message.content }}</div>
            <div class="message-meta">
              <span>{{ formatTime(message.at) }}</span>
              <button
                v-if="message.role === 'assistant'"
                type="button"
                @click="copyMessage(message.content)"
              >
                复制
              </button>
            </div>
          </div>
        </article>

        <div v-if="sending" class="message assistant">
          <div class="message-avatar"><ion-icon :icon="sparklesOutline" /></div>
          <div class="message-body">
            <div class="typing"><span /><span /><span /></div>
          </div>
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>
      </div>
      <div class="bottom-space" />
    </ion-content>

    <ion-footer class="composer-footer">
      <div v-if="player.currentTrack && messages.length" class="context-chip">
        <ion-icon :icon="musicalNotesOutline" />
        <span class="ceru-truncate">{{ player.currentTrack.title }}</span>
        <button type="button" @click="askAboutCurrent">分析</button>
      </div>
      <div class="composer">
        <ion-textarea
          v-model="draft"
          auto-grow
          :maxlength="2000"
          placeholder="聊聊音乐…"
          class="composer-input"
          @keydown.enter.exact.prevent="send"
        />
        <ion-button :disabled="sending || !draft.trim()" @click="send">
          <ion-spinner v-if="sending" name="crescent" />
          <ion-icon v-else :icon="sendOutline" />
        </ion-button>
      </div>
    </ion-footer>

    <ion-modal :is-open="settingsOpen" @didDismiss="settingsOpen = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-button @click="settingsOpen = false">取消</ion-button></ion-buttons>
          <ion-title>AI 服务配置</ion-title>
          <ion-buttons slot="end"><ion-button @click="saveConfig">保存</ion-button></ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="settings-content">
        <ion-list>
          <ion-item>
            <ion-label position="stacked">服务商</ion-label>
            <ion-select v-model="form.provider" interface="action-sheet" cancel-text="取消" @ionChange="applyPreset">
              <ion-select-option v-for="provider in providers" :key="provider.value" :value="provider.value">
                {{ provider.label }}
              </ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">API Key</ion-label>
            <ion-input v-model="form.apiKey" type="password" autocomplete="off" placeholder="sk-…" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Base URL</ion-label>
            <ion-input v-model="form.baseURL" type="url" autocomplete="off" placeholder="https://api.example.com/v1" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">模型</ion-label>
            <ion-input v-model="form.model" autocomplete="off" placeholder="deepseek-chat" />
          </ion-item>
        </ion-list>
        <p class="settings-tip">
          API Key 会保存在本机应用存储中，不会上传到 Ceru 服务器。使用第三方服务时，请阅读对应服务的隐私政策。
        </p>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import {
  chevronForward,
  musicalNotesOutline,
  personOutline,
  sendOutline,
  settingsOutline,
  sparklesOutline,
  trashOutline
} from 'ionicons/icons'
import { Clipboard } from '@capacitor/clipboard'
import CoverImage from '@/components/CoverImage.vue'
import { useSettingsStore } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import {
  AI_PROVIDERS,
  AI_SYSTEM_PROMPT,
  askAI,
  type AIProvider,
  type AIChatMessage
} from '@/services/aiService'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
}

const STORAGE_KEY = 'ceru-ai-chat-v1'
const settings = useSettingsStore()
const player = usePlayerStore()
const messages = ref<ChatMessage[]>(loadMessages())
const draft = ref('')
const sending = ref(false)
const error = ref('')
const settingsOpen = ref(false)
const scrollContent = ref<any>()
const providers = AI_PROVIDERS
const suggestions = [
  '推荐 10 首适合雨天通勤的歌',
  '解释一下爵士乐里的即兴是怎么回事',
  '按“深夜写代码”的场景生成一份歌单',
  '帮我分析一首歌的编曲层次'
]
let abortController: AbortController | undefined

const form = reactive({
  provider: settings.settings.aiProvider as AIProvider,
  apiKey: settings.settings.aiApiKey,
  baseURL: settings.settings.aiBaseURL,
  model: settings.settings.aiModel
})

const configured = computed(() => !!settings.settings.aiApiKey.trim())

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && item.content)
      .slice(-100)
      .map((item) => ({
        id: String(item.id || uid()),
        role: item.role,
        content: String(item.content),
        at: Number(item.at || Date.now())
      }))
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-100)))
  } catch {
    // A full WebView storage does not break the current conversation.
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function openSettings() {
  form.provider = settings.settings.aiProvider as AIProvider
  form.apiKey = settings.settings.aiApiKey
  form.baseURL = settings.settings.aiBaseURL
  form.model = settings.settings.aiModel
  settingsOpen.value = true
}

function applyPreset(event: any) {
  const provider = providers.find((item) => item.value === event?.detail?.value)
  if (!provider || provider.value === 'custom') return
  form.baseURL = provider.baseURL
  form.model = provider.model
}

async function saveConfig() {
  if (!form.apiKey.trim()) {
    await toast('请填写 API Key', 'warning')
    return
  }
  if (!form.baseURL.trim() || !form.model.trim()) {
    await toast('请填写 Base URL 和模型', 'warning')
    return
  }
  settings.settings.aiProvider = form.provider
  settings.settings.aiApiKey = form.apiKey.trim()
  settings.settings.aiBaseURL = form.baseURL.trim()
  settings.settings.aiModel = form.model.trim()
  settingsOpen.value = false
  await toast('AI 配置已保存')
}

function buildContext(): AIChatMessage[] {
  return [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    ...messages.value.slice(-20).map((message) => ({
      role: message.role,
      content: message.content
    }))
  ]
}

async function scrollToBottom() {
  await nextTick()
  const element = scrollContent.value?.$el || scrollContent.value
  if (element?.scrollToBottom) element.scrollToBottom(250)
  else if (element) element.scrollTop = element.scrollHeight
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  await sendText(text)
  draft.value = ''
}

async function sendText(text: string) {
  if (sending.value) return
  if (!configured.value) {
    openSettings()
    return
  }
  const value = text.trim()
  if (!value) return
  error.value = ''
  messages.value.push({ id: uid(), role: 'user', content: value, at: Date.now() })
  persist()
  await scrollToBottom()
  sending.value = true
  abortController = new AbortController()
  try {
    const answer = await askAI(
      buildContext(),
      {
        provider: settings.settings.aiProvider,
        apiKey: settings.settings.aiApiKey,
        baseURL: settings.settings.aiBaseURL,
        model: settings.settings.aiModel
      },
      abortController.signal
    )
    messages.value.push({ id: uid(), role: 'assistant', content: answer, at: Date.now() })
    persist()
    await scrollToBottom()
  } catch (cause) {
    if ((cause as any)?.name !== 'AbortError') {
      error.value = cause instanceof Error ? cause.message : 'AI 请求失败'
    }
  } finally {
    sending.value = false
    abortController = undefined
  }
}

function askAboutCurrent() {
  const track = player.currentTrack
  if (!track) return
  void sendText(
    '请分析《' + track.title + '》' +
      (track.artists.length ? '（' + track.artists.join(' / ') + '）' : '') +
      '，并推荐 5 首风格相近的歌曲。'
  )
}

async function copyMessage(content: string) {
  try {
    await Clipboard.write({ string: content })
    await toast('已复制')
  } catch {
    await toast('复制失败', 'danger')
  }
}

async function clearChat() {
  messages.value = []
  error.value = ''
  persist()
  await toast('对话已清空')
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 1800, color })
  await element.present()
}

onBeforeUnmount(() => {
  abortController?.abort()
})
</script>

<style scoped>
.ai-content {
  --background: var(--ceru-bg);
}
.setup-card,
.welcome {
  padding-top: 60px;
  text-align: center;
}
.ai-orb {
  width: 78px;
  height: 78px;
  margin: 0 auto 20px;
  border-radius: 26px;
  display: grid;
  place-items: center;
  font-size: 37px;
  color: var(--ceru-brand);
  background: linear-gradient(135deg, rgba(0, 218, 192, 0.2), rgba(80, 120, 255, 0.16));
  box-shadow: 0 18px 48px rgba(0, 180, 160, 0.14);
}
.setup-card p,
.welcome > p {
  margin: 14px auto 22px;
  max-width: 420px;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.setup-card ion-button {
  max-width: 360px;
  margin: 0 auto;
}
.now-playing-prompt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 20px;
  padding: 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  font-size: 13px;
  text-align: left;
}
.now-playing-prompt span {
  flex: 1;
  min-width: 0;
}
.now-playing-prompt ion-icon {
  color: var(--ceru-text-secondary);
}
.suggestions {
  display: grid;
  gap: 9px;
  margin-top: 18px;
  text-align: left;
}
.suggestion {
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  padding: 13px 15px;
  font-size: 13px;
  text-align: left;
}
.messages {
  padding-top: 16px;
}
.message {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 18px;
}
.message.user {
  flex-direction: row-reverse;
}
.message-avatar {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  background: var(--ceru-bg-soft);
  color: var(--ceru-brand);
  font-size: 16px;
}
.message.user .message-avatar {
  color: var(--ceru-text-secondary);
}
.message-body {
  max-width: 82%;
  min-width: 0;
}
.message.user .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.message-text {
  padding: 11px 13px;
  border-radius: 15px;
  background: var(--ceru-bg-elevated);
  border: 1px solid var(--ceru-border);
  font-size: 14px;
  line-height: 1.68;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.message.user .message-text {
  background: var(--ceru-brand);
  border-color: transparent;
  color: var(--ceru-brand-contrast);
}
.message-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 4px;
  color: var(--ceru-text-secondary);
  font-size: 9px;
}
.message-meta button {
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  padding: 0;
  font-size: 9px;
}
.typing {
  display: inline-flex;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 15px;
  background: var(--ceru-bg-elevated);
  border: 1px solid var(--ceru-border);
}
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ceru-text-secondary);
  animation: typing 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-4px); opacity: 1; }
}
.error-text {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
}
.bottom-space {
  height: 150px;
}
.composer-footer {
  background: var(--ceru-bg);
  border-top: 1px solid var(--ceru-border);
}
.context-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px 0;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.context-chip span {
  flex: 1;
  min-width: 0;
}
.context-chip button {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 10px;
}
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
}
.composer-input {
  flex: 1;
  max-height: 130px;
  --background: var(--ceru-bg-elevated);
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 10px;
  --padding-bottom: 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 18px;
  font-size: 14px;
}
.composer ion-button {
  --border-radius: 50%;
  width: 42px;
  height: 42px;
  margin: 0;
}
.settings-content {
  --background: var(--ceru-bg);
}
.settings-tip {
  padding: 16px 20px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.65;
}
</style>
