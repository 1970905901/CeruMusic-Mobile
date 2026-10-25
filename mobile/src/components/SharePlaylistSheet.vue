<template>
  <ion-modal
    class="share-modal"
    :is-open="open"
    :initial-breakpoint="0.9"
    :breakpoints="[0, 0.65, 0.9]"
    @didDismiss="$emit('close')"
  >
    <ion-content class="share-content">
      <div class="share-head">
        <div class="grabber" aria-hidden="true" />
        <div class="head-row">
          <div>
            <p class="eyebrow">CERU CLOUD SHARE</p>
            <h2>分享歌单</h2>
          </div>
          <button type="button" class="close-btn" aria-label="关闭分享" @click="$emit('close')">
            <ion-icon :icon="closeOutline" />
          </button>
        </div>
      </div>

      <div class="share-body">
        <div v-if="playlist" class="song-card">
          <CoverImage :src="cover" :size="78" :radius="16" :alt="playlist.name" />
          <div class="song-copy">
            <strong class="ceru-truncate">{{ playlist.name }}</strong>
            <span class="ceru-truncate">{{ playlist.description || '本地歌单' }}</span>
            <small class="ceru-truncate">{{ shareableCount }} / {{ totalCount }} 首可分享</small>
          </div>
        </div>

        <div v-if="!playlist" class="state-box">歌单不存在。</div>

        <div v-else-if="!totalCount" class="state-box">
          <ion-icon :icon="albumsOutline" />
          <strong>歌单还是空的</strong>
          <span>先添加一些在线歌曲，再生成歌单分享链接。</span>
        </div>

        <div v-else-if="!shareableCount" class="state-box error">
          <ion-icon :icon="alertCircleOutline" />
          <strong>没有可分享的在线歌曲</strong>
          <span>本地导入或已下载的歌曲无法同步到云端，请加入来自音源插件的歌曲。</span>
        </div>

        <div v-else-if="!auth.authenticated" class="auth-box">
          <ion-icon :icon="cloudUploadOutline" />
          <strong>登录后创建歌单分享</strong>
          <span>歌单会先同步到澜音云端，再生成可分享的链接。接收方在 App 内打开并导入。</span>
          <ion-button expand="block" :disabled="auth.loading" @click="login">
            <ion-spinner v-if="auth.loading" name="crescent" />
            <span v-else>登录澜音</span>
          </ion-button>
          <p v-if="auth.error" class="error-text">{{ auth.error }}</p>
        </div>

        <template v-else>
          <div v-if="phase !== 'success'" class="form-card">
            <p class="hint">分享链接仅用于在 Ceru Music App 内打开并导入歌单，暂不支持网页在线播放。</p>
            <p v-if="skippedCount" class="hint">已跳过 {{ skippedCount }} 首本地或下载歌曲。</p>

            <!-- 与歌曲分享共用同一份合规承诺（桌面版 ShareConsentBar） -->
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
          </div>

          <div v-else class="success-card">
            <ion-icon :icon="checkmarkCircleOutline" class="success-icon" />
            <h3>分享链接已生成</h3>
            <p>接收方在 Ceru Music App 中打开链接即可导入这份歌单。</p>
            <div class="link-box">{{ shareUrl }}</div>

            <!-- 分享海报（桌面版 SharePlaylistDialog 的 poster-templates + 预览） -->
            <div class="poster-section" role="group" aria-label="海报模板">
              <button
                v-for="tpl in availableTemplates"
                :key="tpl.id"
                type="button"
                class="tpl-tab"
                :class="{ active: posterTemplate === tpl.id }"
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
          </div>
        </template>

        <div class="bottom-safe" />
      </div>
    </ion-content>

    <!-- 海报放大预览（与歌曲分享面板同一交互） -->
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
  IonSpinner,
  toastController
} from '@ionic/vue'
import {
  albumsOutline,
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
import { useLibraryStore } from '@/stores/library'
import { useAuthStore } from '@/stores/auth'
import { playlistTracksToCloud } from '@/services/cloudSongList'
import shareApi from '@/services/shareApi'
import {
  getAvailableTemplates,
  renderSharePoster,
  sharePosterImage,
  type PlaylistPosterTemplate,
  type PosterTemplate
} from '@/services/posterRenderer'

const props = defineProps<{
  open?: boolean
  playlistId?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const library = useLibraryStore()
const auth = useAuthStore()
// 分享海报状态（对齐桌面版 SharePlaylistDialog；歌单没有歌词模板）
const posterDataUrl = ref('')
const posterLoading = ref(false)
const posterError = ref('')
const posterTemplate = ref<PlaylistPosterTemplate>('classic')
const posterPreviewOpen = ref(false)

const phase = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
/** ShareConsent 在挂载时回填已完成承诺，未完成时为 false 并禁用生成按钮。 */
const consented = ref(false)
const statusText = ref('')
const error = ref('')
const shareUrl = ref('')

const playlist = computed(() =>
  props.playlistId ? library.playlists.find((item) => item.id === props.playlistId) : undefined
)
const tracks = computed(() => (props.playlistId ? library.playlistTracks(props.playlistId) : []))
const totalCount = computed(() => tracks.value.length)
const shareableCount = computed(() => playlistTracksToCloud(tracks.value).length)
const skippedCount = computed(() => Math.max(0, totalCount.value - shareableCount.value))
const cover = computed(
  () => playlist.value?.cover || tracks.value.find((track) => track.artworkUrl)?.artworkUrl
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    phase.value = 'idle'
    statusText.value = ''
    error.value = ''
    shareUrl.value = ''
    posterDataUrl.value = ''
    posterLoading.value = false
    posterError.value = ''
    posterTemplate.value = 'classic'
    posterPreviewOpen.value = false
  }
)

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

async function createShare() {
  if (!props.playlistId || phase.value === 'loading') return
  if (!auth.authenticated) {
    error.value = '请先登录澜音'
    return
  }
  phase.value = 'loading'
  error.value = ''
  shareUrl.value = ''
  try {
    statusText.value = '正在同步歌单到云端…'
    const cloudId = await library.syncPlaylistToCloud(props.playlistId)
    statusText.value = '正在创建分享链接…'
    const result = await shareApi.createPlaylist({
      cloudPlaylistId: cloudId,
      allowWebPlayback: false
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

const availableTemplates = computed(() => getAvailableTemplates('playlist', false))

function pickTemplate(id: PosterTemplate) {
  // 模板列表按 'playlist' 构造，'lyric' 不会出现；这里的收窄只是让模板字符串保持诚实。
  if (id === 'lyric') return
  posterTemplate.value = id
}

watch(posterTemplate, () => {
  if (phase.value === 'success' && shareUrl.value) void buildPoster(shareUrl.value)
})

async function buildPoster(url: string) {
  const item = playlist.value
  if (!item) return
  posterLoading.value = true
  posterError.value = ''
  posterDataUrl.value = ''
  try {
    posterDataUrl.value = await renderSharePoster({
      type: 'playlist',
      template: posterTemplate.value,
      title: item.name || '未命名歌单',
      subtitle: item.description || '已同步到云端的本地歌单',
      cover: cover.value || '',
      shareUrl: url,
      songCount: shareableCount.value
    })
  } catch (cause) {
    console.warn('生成分享海报失败', cause)
    posterError.value = '海报生成失败，可继续使用文字链接分享'
  } finally {
    posterLoading.value = false
  }
}

async function savePoster() {
  const item = playlist.value
  if (!posterDataUrl.value || !item) return
  try {
    await sharePosterImage(posterDataUrl.value, item.name || '歌单')
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
  if (!shareUrl.value || !playlist.value) return
  try {
    await Share.share({
      title: playlist.value.name,
      text: playlist.value.description || playlist.value.name,
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
.hint {
  margin: 0 0 12px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.55;
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
/* 海报模板分段与预览（与歌曲分享面板共用同一套样式规则） */
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
