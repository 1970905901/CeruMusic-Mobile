<template>
  <ion-modal
    class="share-modal"
    :is-open="share.open"
    :initial-breakpoint="0.9"
    :breakpoints="[0, 0.65, 0.9]"
    @didDismiss="handleDismiss"
  >
    <ion-content class="share-content">
      <div class="share-head">
        <div class="grabber" aria-hidden="true" />
        <div class="head-row">
          <div>
            <p class="eyebrow">CERU CLOUD SHARE</p>
            <h2>分享歌曲</h2>
          </div>
          <button type="button" class="close-btn" aria-label="关闭分享" @click="share.close()">
            <ion-icon :icon="closeOutline" />
          </button>
        </div>
      </div>

      <div class="share-body">
        <div v-if="track" class="song-card">
          <CoverImage :src="track.artworkUrl" :size="78" :radius="16" :alt="track.title" />
          <div class="song-copy">
            <strong class="ceru-truncate">{{ track.title }}</strong>
            <span class="ceru-truncate">{{ track.artists.join(' / ') || '未知艺术家' }}</span>
            <small v-if="track.album" class="ceru-truncate">{{ track.album }}</small>
          </div>
        </div>

        <div v-if="!track" class="state-box">没有可分享的歌曲。</div>

        <div v-else-if="track.localUri || track.downloadedPath" class="state-box error">
          <ion-icon :icon="alertCircleOutline" />
          <strong>本地歌曲不能创建云分享</strong>
          <span>请从已启用音源插件的在线歌曲创建分享链接。</span>
        </div>

        <div v-else-if="!auth.authenticated" class="auth-box">
          <ion-icon :icon="cloudUploadOutline" />
          <strong>登录后创建分享链接</strong>
          <span>云分享需要澜音账号。解析模块和分享内容只用于生成你主动创建的有效期链接。</span>
          <ion-button expand="block" :disabled="auth.loading" @click="login">
            <ion-spinner v-if="auth.loading" name="crescent" />
            <span v-else>登录澜音</span>
          </ion-button>
          <p v-if="auth.error" class="error-text">{{ auth.error }}</p>
        </div>

        <template v-else>
          <div v-if="phase !== 'success'" class="form-card">
            <div class="form-title">
              <span>链接有效期</span>
              <strong>{{ ttlDays }} 天</strong>
            </div>
            <ion-range
              :value="ttlDays"
              :min="1"
              :max="7"
              :step="1"
              :pin="true"
              :ticks="true"
              :snaps="true"
              aria-label="分享链接有效期"
              @ionChange="setTtl($event.detail.value)"
            />
            <p class="expiry">预计 {{ expiryText }} 失效，最多 7 天。</p>

            <!-- 合规承诺（桌面版 ShareConsentBar）：三项逐条确认并持久化 -->
            <ShareConsent v-model="consented" />

            <div v-if="statusText" class="status-row" role="status">
              <ion-spinner name="crescent" />
              <span>{{ statusText }}</span>
            </div>

            <div v-if="error" class="error-box">
              <ion-icon :icon="alertCircleOutline" />
              <div>
                <strong>分享失败</strong>
                <span>{{ error }}</span>
              </div>
            </div>

            <ion-button
              expand="block"
              class="create-btn"
              :disabled="phase === 'loading' || !consented"
              @click="createShare"
            >
              <ion-spinner v-if="phase === 'loading'" name="crescent" />
              <template v-else>
                <ion-icon slot="start" :icon="linkOutline" />
                生成分享链接
              </template>
            </ion-button>
            <p class="fine-print">首次使用某个音源时，服务器可能还需要该音源的解析模块；上传前会再次确认。</p>
          </div>

          <div v-else class="success-card">
            <ion-icon :icon="checkmarkCircleOutline" class="success-icon" />
            <h3>分享链接已生成</h3>
            <p>链接包含歌曲信息、可选歌词与热门评论，服务器会在到期后停止解析。</p>
            <div class="link-box">{{ shareUrl }}</div>

            <!-- 分享海报（桌面版 ShareSongDialog 的 poster-templates + 预览） -->
            <div class="poster-section" role="group" aria-label="海报模板">
              <button
                v-for="tpl in availableTemplates"
                :key="tpl.id"
                type="button"
                class="tpl-tab"
                :class="{ active: posterTemplate === tpl.id }"
                :disabled="tpl.id === 'lyric' && !hasLyric"
                @click="pickTemplate(tpl.id)"
              >
                {{ tpl.label }}
              </button>
            </div>
            <div class="poster-preview" :class="{ loading: posterLoading }">
              <img
                v-if="posterDataUrl"
                :src="posterDataUrl"
                alt="分享海报"
                @click="posterPreviewOpen = true"
              />
              <div v-else-if="posterLoading" class="poster-placeholder">
                <ion-spinner name="crescent" />
                <span>正在生成海报…</span>
              </div>
              <div v-else-if="posterError" class="poster-placeholder error">
                <span>{{ posterError }}</span>
              </div>
            </div>

            <div class="success-actions">
              <ion-button expand="block" @click="copyLink">
                <ion-icon slot="start" :icon="copyOutline" />
                复制链接
              </ion-button>
              <ion-button expand="block" fill="outline" @click="systemShare">
                <ion-icon slot="start" :icon="shareOutline" />
                系统分享
              </ion-button>
              <ion-button expand="block" fill="outline" :disabled="!posterDataUrl" @click="savePoster">
                <ion-icon slot="start" :icon="imageOutline" />
                分享海报
              </ion-button>
            </div>
            <div v-if="warnings.length" class="warnings">
              <strong>提示</strong>
              <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
            </div>
          </div>
        </template>

        <div class="bottom-safe" />
      </div>
    </ion-content>

    <!-- 海报放大预览（桌面版 poster-preview 全屏层） -->
    <ion-modal
      class="poster-zoom-modal"
      :is-open="posterPreviewOpen"
      @didDismiss="posterPreviewOpen = false"
    >
      <div class="poster-zoom-backdrop" @click="posterPreviewOpen = false">
        <img v-if="posterDataUrl" :src="posterDataUrl" alt="分享海报预览" @click.stop />
      </div>
    </ion-modal>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IonButton,
  IonContent,
  IonIcon,
  IonModal,
  IonRange,
  IonSpinner,
  IonToggle,
  alertController,
  toastController
} from '@ionic/vue'
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  closeOutline,
  cloudUploadOutline,
  copyOutline,
  imageOutline,
  linkOutline,
  shareOutline
} from 'ionicons/icons'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import CoverImage from '@/components/CoverImage.vue'
import ShareConsent from '@/components/ShareConsent.vue'
import {
  getAvailableTemplates,
  parseLrcToLines,
  posterFileName,
  renderSharePoster,
  sharePosterImage,
  type SongPosterTemplate
} from '@/services/posterRenderer'
import { useShareStore } from '@/stores/share'
import { usePluginStore } from '@/stores/plugins'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { guestStoreFor } from '@/services/plugin/guests'
import { createSongShareResolver, type ShareResolverGuest } from '@/services/shareResolver'
import { lyricValueToLrc } from '@/services/lyrics'
import shareApi, { type ShareComment, type ShareLyric, type ShareSongInfo } from '@/services/shareApi'
import type { PluginRecord } from '@/types/plugin'
import type { Track } from '@/types/music'

const share = useShareStore()
const pluginStore = usePluginStore()
const settings = useSettingsStore()
const auth = useAuthStore()

const ttlDays = ref(3)
const consented = ref(false)
const phase = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const statusText = ref('')
const error = ref('')
const warnings = ref<string[]>([])
const shareUrl = ref('')
// 分享海报状态（对齐桌面版 ShareSongDialog）
const posterDataUrl = ref('')
const posterLoading = ref(false)
const posterError = ref('')
const posterTemplate = ref<SongPosterTemplate>('classic')
const posterPreviewOpen = ref(false)
const posterLrc = ref('')
const track = computed(() => share.track)

const expiryText = computed(() => {
  const date = new Date(Date.now() + ttlDays.value * 86_400_000)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
})

watch(
  () => share.open,
  (open) => {
    if (!open) return
    ttlDays.value = 3
    // 不再每次打开强制重置：ShareConsent 会在挂载时读回已完成的合规承诺。
    // 未承诺时它自己把 consented 置回 false。
    phase.value = 'idle'
    statusText.value = ''
    error.value = ''
    warnings.value = []
    shareUrl.value = ''
    posterDataUrl.value = ''
    posterLoading.value = false
    posterError.value = ''
    posterTemplate.value = 'classic'
    posterPreviewOpen.value = false
    posterLrc.value = ''
  }
)

function setTtl(value: number | { lower: number; upper: number }) {
  const number = typeof value === 'number' ? value : value.lower
  ttlDays.value = Math.min(7, Math.max(1, Math.round(Number(number) || 1)))
}

function handleDismiss() {
  share.close()
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

async function login() {
  try {
    await auth.login()
    if (!auth.authenticated) error.value = '登录未完成'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败'
  }
}

function findShareRecord(item: Track): PluginRecord {
  const source = item.ref?.providerId
  if (!source) throw new Error('这首歌缺少音源信息')
  const owner = item.ref.scope === 'provider' ? '' : item.ref.pluginId || item.pluginKey || ''
  const hasProvider = (record: PluginRecord) =>
    !!record.manifest.contributes?.providers?.some((provider) => provider.id === source)
  const hasShare = (record: PluginRecord) => !!record.manifest.modules?.share
  const candidates = pluginStore.plugins.filter(
    (record) =>
      record.enabled &&
      hasProvider(record) &&
      hasShare(record) &&
      (!owner || record.key === owner || record.manifestId === owner)
  )
  const selectedKey = pluginStore.selectedProvider(source)?.pluginKey
  const ordered = [
    ...candidates.filter((record) => record.key === item.pluginKey),
    ...candidates.filter((record) => record.key === selectedKey),
    ...candidates
  ].filter(
    (record, index, list) => list.findIndex((entry) => entry.key === record.key) === index
  )
  if (!ordered.length) {
    throw new Error('当前音源插件没有提供服务器分享解析模块，请更新插件后重试')
  }
  return ordered[0]
}

async function exportGuest(record: PluginRecord): Promise<ShareResolverGuest | undefined> {
  const adapterId = record.manifest.modules?.share?.guestAdapterId
  if (!adapterId) return undefined
  return guestStoreFor(record).exportSelected(adapterId)
}

async function loadLyric(item: Track): Promise<ShareLyric | undefined> {
  try {
    const lrc = lyricValueToLrc(await pluginStore.lyrics(item))
    // 歌词模板的海报复用这份文本，不再为同一首歌发第二次请求。
    if (lrc.trim()) posterLrc.value = lrc
    if (!lrc.trim()) {
      warnings.value.push('这首歌没有可用歌词，分享仍会继续。')
      return undefined
    }
    return { lrc, format: 'lrc' }
  } catch (cause) {
    warnings.value.push(
      '歌词未包含：' + (cause instanceof Error ? cause.message : String(cause))
    )
    return undefined
  }
}

async function loadHotComments(item: Track): Promise<ShareComment[]> {
  try {
    const page = await pluginStore.comments(item, 'hot', 1, 10)
    return page.comments.slice(0, 10).map((comment) => ({
      userName: comment.userName,
      avatar: comment.avatar || undefined,
      text: comment.text,
      likedCount: comment.likedCount,
      timeStr: comment.timeStr || undefined,
      location: comment.location || undefined
    }))
  } catch (cause) {
    warnings.value.push(
      '热评未包含：' + (cause instanceof Error ? cause.message : String(cause))
    )
    return []
  }
}

async function confirmUpload(): Promise<boolean> {
  const alert = await alertController.create({
    header: '需要上传播放解析模块',
    message:
      '网页播放需要将当前音源的播放解析模块和所需音源配置上传到澜音服务器，仅用于分享解析，不会公开。是否继续？',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '继续上传', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'confirm'
}

function pickQuality(qualities: string[]): string | undefined {
  const preferred = String(settings.settings.preferredQuality || '').trim()
  if (preferred && qualities.includes(preferred)) return preferred
  return qualities[qualities.length - 1]
}

async function createShare() {
  const item = track.value
  if (!item || phase.value === 'loading') return
  if (!auth.authenticated) {
    error.value = '请先登录澜音'
    return
  }
  if (item.localUri || item.downloadedPath) {
    error.value = '本地歌曲不能创建云分享'
    return
  }
  if (!consented.value) {
    error.value = '请先确认上传播放解析模块'
    return
  }
  phase.value = 'loading'
  error.value = ''
  statusText.value = '读取插件分享模块…'
  warnings.value = []
  shareUrl.value = ''
  try {
    const record = findShareRecord(item)
    const config = await pluginStore.loadConfig(record.key)
    const guest = await exportGuest(record)
    const resolver = createSongShareResolver(record, item, config, guest)

    statusText.value = '检查服务器解析模块…'
    const precheck = await shareApi.precheck({ pluginMd5: resolver.md5 })
    if (!precheck.hasPlugin) {
      const accepted = await confirmUpload()
      if (!accepted) {
        phase.value = 'idle'
        statusText.value = ''
        return
      }
      statusText.value = '上传播放解析模块…'
      const uploaded = await shareApi.uploadPlugin({
        pluginCode: resolver.code,
        md5: resolver.md5,
        type: resolver.type
      })
      if (!uploaded.ok) throw new Error(uploaded.message || '上传播放解析模块失败')
    }

    statusText.value = '收集歌词与热门评论…'
    const lyric = await loadLyric(item)
    const hotComments = await loadHotComments(item)

    statusText.value = '创建分享链接…'
    const result = await shareApi.create({
      pluginMd5: resolver.md5,
      source: item.ref.providerId,
      ttlDays: ttlDays.value,
      quality: pickQuality(resolver.qualities),
      song: resolver.musicInfo as ShareSongInfo,
      lyric,
      hotComments: hotComments.length ? hotComments : undefined
    })
    if (!result?.url) throw new Error('服务器没有返回分享链接')
    shareUrl.value = result.url
    phase.value = 'success'
    statusText.value = ''
    void buildPoster(result.url)
  } catch (cause) {
    phase.value = 'error'
    statusText.value = ''
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

const hasLyric = computed(() => parseLrcToLines(posterLrc.value).length > 0)
const availableTemplates = computed(() => getAvailableTemplates('song', hasLyric.value))

function pickTemplate(id: SongPosterTemplate) {
  if (id === 'lyric' && !hasLyric.value) return
  posterTemplate.value = id
}

watch(posterTemplate, () => {
  if (phase.value === 'success' && shareUrl.value) void buildPoster(shareUrl.value)
})

async function buildPoster(url: string) {
  const item = track.value
  if (!item) return
  posterLoading.value = true
  posterError.value = ''
  posterDataUrl.value = ''
  try {
    // 歌词模板需要歌词文本；loadLyric 只在创建分享时顺带取过一次，这里独立
    // 再取一次（与桌面版从播放器缓存读不同，移动端分享面板不依赖播放状态）。
    if (!posterLrc.value) {
      try {
        posterLrc.value = lyricValueToLrc(await pluginStore.lyrics(item))
      } catch {
        posterLrc.value = ''
      }
    }
    posterDataUrl.value = await renderSharePoster({
      type: 'song',
      template: posterTemplate.value,
      title: item.title,
      subtitle: item.artists.join(' / ') || '未知艺术家',
      album: item.album,
      cover: item.artworkUrl || '',
      shareUrl: url,
      expiryText: expiryText.value,
      lyricText: posterLrc.value
    })
  } catch (cause) {
    console.warn('生成分享海报失败', cause)
    posterError.value = '海报生成失败，可继续使用文字链接分享'
  } finally {
    posterLoading.value = false
  }
}

async function savePoster() {
  const item = track.value
  if (!posterDataUrl.value || !item) return
  try {
    await sharePosterImage(posterDataUrl.value, item.title)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '海报保存失败', 'danger')
  }
}

async function copyLink() {
  if (!shareUrl.value) return
  try {
    await Clipboard.write({ string: shareUrl.value })
    await toast('分享链接已复制')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '复制失败', 'danger')
  }
}

async function systemShare() {
  if (!shareUrl.value || !track.value) return
  try {
    await Share.share({
      title: track.value.title,
      text: `${track.value.title} - ${track.value.artists.join(' / ')}`,
      url: shareUrl.value
    })
  } catch {
    // Closing the system share sheet is not a failure.
  }
}
</script>

<style scoped>
.share-modal {
  --background: var(--ceru-bg);
  --border-radius: 24px 24px 0 0;
}
.share-content {
  --background: var(--ceru-bg);
}
.share-head {
  position: sticky;
  top: 0;
  z-index: 4;
  padding: max(10px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-left)) 12px
    max(20px, env(safe-area-inset-right));
  background: var(--ceru-bg);
  border-bottom: 1px solid var(--ceru-border);
}
.grabber {
  width: 38px;
  height: 5px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: var(--ceru-border);
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.eyebrow {
  margin: 0 0 4px;
  color: var(--ceru-brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
}
h2 {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.03em;
}
.close-btn {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--ceru-border);
  border-radius: 50%;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text-secondary);
  font-size: 21px;
}
.share-body {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px max(20px, env(safe-area-inset-left)) 0 max(20px, env(safe-area-inset-right));
}
.song-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px;
  border: 1px solid var(--ceru-border);
  border-radius: 18px;
  background: var(--ceru-bg-elevated);
}
.song-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.song-copy strong {
  font-size: 17px;
}
.song-copy span {
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.song-copy small {
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.form-card,
.success-card,
.auth-box,
.state-box {
  margin-top: 16px;
  padding: 18px;
  border: 1px solid var(--ceru-border);
  border-radius: 18px;
  background: var(--ceru-bg-elevated);
}
.form-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
}
.form-title strong {
  color: var(--ceru-brand);
  font-size: 16px;
}
ion-range {
  padding: 8px 0 0;
  --bar-background: var(--ceru-border);
  --bar-background-active: var(--ceru-brand);
  --knob-background: var(--ceru-brand);
}
.expiry {
  margin: 2px 0 16px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 14px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.status-row ion-spinner {
  width: 17px;
  height: 17px;
}
.error-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  padding: 11px 12px;
  border-radius: 11px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
}
.error-box ion-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 17px;
}
.error-box div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  line-height: 1.5;
}
.error-box strong {
  font-size: 12px;
}
.create-btn {
  margin-top: 18px;
}
.fine-print {
  margin: 12px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 10px;
  line-height: 1.5;
}
.auth-box,
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 22px;
  text-align: center;
}
.auth-box ion-icon,
.state-box ion-icon {
  color: var(--ceru-brand);
  font-size: 42px;
}
.auth-box strong,
.state-box strong {
  font-size: 17px;
}
.auth-box span,
.state-box span {
  max-width: 330px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.auth-box ion-button {
  width: 100%;
  margin-top: 6px;
}
.error-text {
  margin: 0;
  color: var(--ceru-danger);
  font-size: 11px;
}
.state-box.error ion-icon {
  color: var(--ceru-danger);
}
.success-card {
  text-align: center;
}
.success-icon {
  color: var(--ceru-brand);
  font-size: 50px;
}
.success-card h3 {
  margin: 8px 0 4px;
  font-size: 20px;
}
.success-card > p {
  margin: 0 auto;
  max-width: 380px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.link-box {
  margin-top: 16px;
  padding: 12px;
  border: 1px dashed var(--ceru-border);
  border-radius: 10px;
  background: var(--ceru-bg-soft);
  color: var(--ceru-text);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-align: left;
}
.success-actions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 14px;
}
.success-actions ion-button {
  margin: 0;
}
.warnings {
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--ceru-border);
  text-align: left;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.warnings strong {
  color: var(--ceru-text);
}
.warnings p {
  margin: 5px 0 0;
}
/* 海报模板分段与预览（对齐桌面版 poster-templates / poster-preview） */
.poster-section {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}
.tpl-tab {
  padding: 5px 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 999px;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.tpl-tab.active {
  border-color: var(--ceru-brand);
  color: var(--ceru-brand);
}
.tpl-tab:disabled {
  opacity: 0.45;
}
.poster-preview {
  margin-top: 10px;
  border-radius: 12px;
  overflow: hidden;
}
.poster-preview img {
  display: block;
  width: 100%;
  height: auto;
  cursor: zoom-in;
}
.poster-preview.loading {
  min-height: 0;
}
.poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 26px 12px;
  border: 1px dashed var(--ceru-border);
  border-radius: 12px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.poster-placeholder.error {
  color: var(--ion-color-danger, #d54941);
}
/* 海报放大层：整屏黑底，点任意处关闭 */
.poster-zoom-modal {
  --border-radius: 0;
}
.poster-zoom-backdrop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  background: rgba(0, 0, 0, 0.88);
}
.poster-zoom-backdrop img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
}
.bottom-safe {
  height: calc(30px + env(safe-area-inset-bottom));
}
@media (min-width: 700px) {
  .share-modal {
    --width: min(700px, 92vw);
    --height: 86vh;
    --border-radius: 24px;
    margin: auto;
  }
}
</style>
