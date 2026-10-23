<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>社区</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="openCreate">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="feedMode" @ionChange="changeMode">
          <ion-segment-button value="recommend">推荐</ion-segment-button>
          <ion-segment-button value="latest">最新</ion-segment-button>
          <ion-segment-button value="mine">我的</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!auth.authenticated && feedMode === 'mine'" class="empty ceru-pad">
        <ion-icon :icon="personCircleOutline" />
        <h2>登录后查看自己的帖子</h2>
        <p>登录 Ceru 账号即可发帖、点赞和评论。</p>
        <ion-button @click="$router.push('/account')">去登录</ion-button>
      </div>

      <template v-else>
        <div v-if="posts.length" class="feed">
          <article v-for="post in posts" :key="post.id" class="post-card" @click="openPost(post)">
            <header class="post-head">
              <CoverImage
                :src="ossAvatar(post.userAvatar)"
                :size="38"
                :radius="19"
                :alt="post.username"
              />
              <div class="author-copy">
                <div class="author-name ceru-truncate">{{ post.username || '音乐同好' }}</div>
                <div class="post-time">{{ communityMetaLine(formatRelativeTime(post.createdAt), post.ipLocation) }}</div>
              </div>
            </header>

            <!-- 没有配图时用桌面端的「音乐随记」文字封面，而不是只剩一段纯文字 -->
            <TextNoteCover v-if="!post.images.length" :seed="post.id" :content="post.content" />
            <p v-else-if="post.content" class="post-content">{{ post.content }}</p>

            <div v-if="post.images.length" class="image-grid" :class="imageGridClass(post.images.length)">
              <button
                v-for="(image, index) in post.images.slice(0, 9)"
                :key="imageUrl(image) + index"
                type="button"
                class="image-cell"
                @click.stop="openPost(post)"
              >
                <img :src="ossCard(imageUrl(image))" alt="" loading="lazy" />
              </button>
            </div>

            <div v-if="attachmentCover(post)" class="attachment" @click.stop="openPost(post)">
              <CoverImage :src="ossCard(attachmentCover(post))" :size="52" :radius="10" :alt="attachmentTitle(post)" />
              <div class="attachment-copy">
                <div class="attachment-title ceru-truncate">{{ attachmentTitle(post) }}</div>
                <div class="attachment-sub">{{ attachmentSubtitle(post) }}</div>
              </div>
              <ion-icon :icon="musicalNotesOutline" />
            </div>

            <footer class="post-actions">
              <button
                type="button"
                class="action"
                :class="{ active: post.liked }"
                @click.stop="toggleLike(post)"
              >
                <ion-icon :icon="post.liked ? heart : heartOutline" />
                <span>{{ formatCommunityCount(post.likeCount) }}</span>
              </button>
              <button type="button" class="action" @click.stop="openPost(post)">
                <ion-icon :icon="chatbubbleOutline" />
                <span>{{ formatCommunityCount(post.commentCount) }}</span>
              </button>
              <button type="button" class="action" @click.stop="sharePost(post)">
                <ion-icon :icon="shareOutline" />
              </button>
            </footer>
          </article>
        </div>

        <div v-if="loading && !posts.length" class="loading">
          <ion-spinner name="crescent" />
          <span>正在加载社区…</span>
        </div>

        <div v-else-if="error && !posts.length" class="empty ceru-pad">
          <ion-icon :icon="cloudOfflineOutline" />
          <h2>社区暂时不可用</h2>
          <p>{{ error }}</p>
          <ion-button fill="outline" @click="load(true)">重试</ion-button>
        </div>

        <div v-else-if="!posts.length" class="empty ceru-pad">
          <ion-icon :icon="peopleOutline" />
          <h2>还没有帖子</h2>
          <p>分享此刻正在听的音乐，成为第一个发帖的人。</p>
          <ion-button @click="openCreate">发一条</ion-button>
        </div>

        <!--
          分页失败必须单独提示：错误块只在「一条都没有」时显示，
          已有内容时翻页失败此前完全无声——点「加载更多」什么也不会发生，
          按钮又变回可点状态，用户只会反复点。
        -->
        <div v-if="posts.length && error && !loading" class="load-more-error" role="status">
          <p>{{ error }}</p>
          <ion-button size="small" fill="outline" @click="load(false)">重试</ion-button>
        </div>
        <div v-if="posts.length && hasMore" class="load-more">
          <ion-button fill="clear" :disabled="loading" @click="load(false)">
            {{ loading ? '加载中…' : '加载更多' }}
          </ion-button>
        </div>
        <div v-else-if="posts.length && !error" class="feed-end">已经到底了</div>
      </template>
      <div class="bottom-space" />
    </ion-content>

    <ion-modal :is-open="creating" @didDismiss="closeCreate">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-button @click="closeCreate">取消</ion-button></ion-buttons>
          <ion-title>发布帖子</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="publishing" @click="publish">
              {{ publishing ? '发布中…' : '发布' }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="composer">
        <div class="composer-pad ceru-pad">
          <ion-textarea
            v-model="draft"
            auto-grow
            :maxlength="1000"
            placeholder="分享音乐、心情或此刻的故事…"
            :counter="true"
            class="draft-input"
          />

          <div v-if="draftImages.length" class="draft-images">
            <div v-for="(image, index) in draftImages" :key="image.url + index" class="draft-image">
              <img :src="image.url" alt="" />
              <button type="button" aria-label="移除图片" @click="draftImages.splice(index, 1)">
                <ion-icon :icon="closeCircle" />
              </button>
            </div>
          </div>

          <button v-if="draftImages.length < 9" type="button" class="add-image" :disabled="uploading" @click="imageInput?.click()">
            <ion-spinner v-if="uploading" name="crescent" />
            <ion-icon v-else :icon="imageOutline" />
            <span>{{ uploading ? '上传中…' : '添加图片' }}</span>
          </button>
          <input ref="imageInput" class="file-input" type="file" accept="image/*" multiple @change="pickImages" />

          <div v-if="draftAttachment" class="draft-attachment">
            <CoverImage :src="ossCard(attachmentCoverValue)" :size="46" :radius="9" :alt="attachmentTitleValue" />
            <div class="attachment-copy">
              <div class="attachment-title ceru-truncate">{{ attachmentTitleValue }}</div>
              <div class="attachment-sub">{{ attachmentSubtitleValue }}</div>
            </div>
            <button type="button" class="remove-attachment" aria-label="移除音乐附件" @click="draftAttachment = null">
              <ion-icon :icon="closeCircle" />
            </button>
          </div>

          <div class="attach-actions">
            <button
              v-if="player.currentTrack && !draftAttachment"
              type="button"
              class="attach-current"
              @click="attachCurrentTrack"
            >
              <ion-icon :icon="musicalNotesOutline" />
              附加正在播放：{{ player.currentTrack.title }}
            </button>
            <!-- 桌面版「分享音乐」还支持附加整个歌单；移动端此前只能附加当前播放的单曲 -->
            <button
              v-if="!draftAttachment"
              type="button"
              class="attach-current"
              @click="pickPlaylistAttachment"
            >
              <ion-icon :icon="albumsOutline" />
              分享歌单
            </button>
          </div>

          <p class="composer-tip">发布内容会经过服务端审核；请勿发布侵权或违规内容。</p>
        </div>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  addOutline,
  albumsOutline,
  chatbubbleOutline,
  closeCircle,
  cloudOfflineOutline,
  heart,
  heartOutline,
  imageOutline,
  musicalNotesOutline,
  peopleOutline,
  personCircleOutline,
  shareOutline
} from 'ionicons/icons'
import { Share } from '@capacitor/share'
import CoverImage from '@/components/CoverImage.vue'
import TextNoteCover from '@/components/TextNoteCover.vue'
import { cloudSongListApi } from '@/services/cloudSongList'
import {
  createRemoteCoverCache,
  localAttachmentCover,
  needsRemoteCover
} from '@/services/postAttachmentCover'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { buildPlaylistAttachment } from '@/services/postAttachment'
import {
  communityApi,
  type CommunityPost,
  type PostAttachment,
  type PostImage,
  type PostImageOrUrl
} from '@/services/communityApi'
import type { Track } from '@/types/music'
import { createRequestGuard } from '@/services/requestGuard'
import { ossAvatar, ossCard } from '@/services/ossImage'
import { showSupportNotice } from '@/services/communitySupport'
import { communityMetaLine } from '@/services/communityLocation'
import { formatCommunityCount, formatRelativeTime } from '@/services/communityFormat'

type FeedMode = 'recommend' | 'latest' | 'mine'

const auth = useAuthStore()
const player = usePlayerStore()
const library = useLibraryStore()
const router = useIonRouter()

const feedMode = ref<FeedMode>('recommend')
const posts = ref<CommunityPost[]>([])
const page = ref(1)
const total = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')
const liking = new Set<string>()
/**
 * 社区列表守卫：切换推荐/最新/我的时作废旧请求，
 * 否则旧分类的响应会追加到新分类的列表里。
 */
const feedRequests = createRequestGuard()

/** 列表归属：分类 + 作者；任一变化都说明响应已过期。 */
function feedIdentity(): string {
  return `${feedMode.value}|${feedMode.value === 'mine' ? currentUserId.value : ''}`
}

const creating = ref(false)
const publishing = ref(false)
const uploading = ref(false)
const draft = ref('')
const draftImages = ref<PostImage[]>([])
const draftAttachment = ref<PostAttachment | null>(null)
const imageInput = ref<HTMLInputElement>()

const currentUserId = computed(() => String((auth.user as any)?.sub || ''))
const attachmentCoverValue = computed(() => {
  const value = draftAttachment.value
  if (!value) return ''
  return value.type === 'song'
    ? String(value.song?.img || '')
    : String(value.cover || value.preview?.[0]?.img || '')
})
const attachmentTitleValue = computed(() => {
  const value = draftAttachment.value
  if (!value) return ''
  return value.type === 'song'
    ? String(value.song?.name || '音乐')
    : String(value.name || '歌单')
})
const attachmentSubtitleValue = computed(() => {
  const value = draftAttachment.value
  if (!value) return ''
  return value.type === 'song'
    ? String(value.song?.singer || '')
    : String(value.songCount || 0) + ' 首歌曲'
})

function imageUrl(image: PostImageOrUrl): string {
  return typeof image === 'string' ? image : image.url
}

/**
 * 附件封面。歌单附件没有自带封面时按 `listId` 去云端补一次
 * （桌面版 usePostAttachmentCover 同口径），结果按歌单缓存，失败也缓存。
 */
const remoteCoverCache = createRemoteCoverCache()
const remoteCovers = ref<Record<string, string>>({})

function attachmentCover(post: CommunityPost): string {
  const value = post.attachment
  if (!value) return ''
  const local = localAttachmentCover(value)
  if (local || !needsRemoteCover(value)) return local
  const listId = String(value.listId || '')
  if (listId in remoteCovers.value) return remoteCovers.value[listId]
  void loadRemoteCover(listId)
  return ''
}

/** 同一个歌单只请求一次；结果（含失败）写入响应式表并同步进缓存。 */
const remoteCoverPending = new Set<string>()
async function loadRemoteCover(listId: string): Promise<void> {
  const cached = remoteCoverCache.get(listId)
  if (cached !== undefined) {
    remoteCovers.value = { ...remoteCovers.value, [listId]: cached }
    return
  }
  if (remoteCoverPending.has(listId)) return
  remoteCoverPending.add(listId)
  let cover = ''
  try {
    const detail = await cloudSongListApi.getSongListDetail(listId, 'asc', 1)
    cover = String(detail?.list?.[0]?.img || '')
  } catch {
    // 歌单不可用时保持无封面，帖子仍然按文字渲染。
  } finally {
    remoteCoverPending.delete(listId)
    remoteCoverCache.set(listId, cover)
    remoteCovers.value = { ...remoteCovers.value, [listId]: cover }
  }
}

function attachmentTitle(post: CommunityPost): string {
  const value = post.attachment
  if (!value) return ''
  return value.type === 'song'
    ? String(value.song?.name || '音乐')
    : String(value.name || '歌单')
}

function attachmentSubtitle(post: CommunityPost): string {
  const value = post.attachment
  if (!value) return ''
  if (value.type === 'song') return String(value.song?.singer || '单曲分享')
  return String(value.songCount || 0) + ' 首歌曲 · 歌单分享'
}

function imageGridClass(count: number): string {
  if (count === 1) return 'one'
  if (count === 2) return 'two'
  return 'many'
}

async function load(reset = false) {
  if (!reset && !hasMore.value) return
  if (feedMode.value === 'mine' && !auth.authenticated) {
    feedRequests.invalidate()
    posts.value = []
    hasMore.value = false
    total.value = 0
    loading.value = false
    return
  }
  if (reset) {
    page.value = 1
    posts.value = []
  }
  // 每次请求都清掉上一次的错误：只在 reset 时清会让「重试成功」之后
  // 旧的错误提示还在，看起来像又失败了一次。
  error.value = ''
  // 分类切换属于"只认最后一次"，同一分类内的分页用 capture 并存。
  const identity = feedIdentity()
  const token = reset ? feedRequests.beginLatest(identity) : feedRequests.capture(identity)
  const requestedPage = page.value
  loading.value = true
  try {
    const result = await communityApi.listPosts({
      sort: feedMode.value === 'recommend' ? 'recommend' : 'latest',
      page: requestedPage,
      pageSize: 20,
      userId: feedMode.value === 'mine' ? currentUserId.value : undefined
    })
    if (!feedRequests.isCurrent(token, feedIdentity())) return
    const known = new Set(posts.value.map((post) => post.id))
    posts.value = [...posts.value, ...(result.items || []).filter((post) => !known.has(post.id))]
    total.value = Number(result.total || posts.value.length)
    hasMore.value = posts.value.length < total.value && (result.items || []).length > 0
    // 用请求时的页码推进，避免并发分页重复自增。
    if (hasMore.value) page.value = requestedPage + 1
  } catch (cause) {
    if (!feedRequests.isCurrent(token, feedIdentity())) return
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (feedRequests.isCurrent(token, feedIdentity())) loading.value = false
  }
}

async function refresh(event: CustomEvent) {
  await load(true)
  ;(event.target as any)?.complete?.()
}

async function changeMode() {
  await load(true)
}

function openPost(post: CommunityPost) {
  router.push('/community/' + post.id)
}

async function toggleLike(post: CommunityPost) {
  if (!auth.authenticated) {
    await toast('登录后才能点赞', 'warning')
    router.push('/account')
    return
  }
  if (liking.has(post.id)) return
  liking.add(post.id)
  try {
    const result = await communityApi.toggleLike(post.id)
    post.liked = result.liked
    post.likeCount = Math.max(0, post.likeCount + (result.liked ? 1 : -1))
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '点赞失败', 'danger')
  } finally {
    liking.delete(post.id)
  }
}

async function sharePost(post: CommunityPost) {
  const url = 'https://ceru.shiqianjiang.cn/community/' + post.id
  try {
    await Share.share({
      title: 'Ceru Music 社区',
      text: post.content.slice(0, 120) || post.username + ' 分享了音乐',
      url
    })
  } catch {
    // The user closing the system share sheet needs no error UI.
  }
}

async function openCreate() {
  if (!auth.authenticated) {
    await toast('登录后才能发帖', 'warning')
    router.push('/account')
    return
  }
  draft.value = ''
  draftImages.value = []
  draftAttachment.value = null
  creating.value = true
}

function closeCreate() {
  if (publishing.value) return
  creating.value = false
}

async function pickImages(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const room = 9 - draftImages.value.length
  if (!files.length || room <= 0) return
  uploading.value = true
  try {
    for (const file of files.slice(0, room)) {
      try {
        draftImages.value.push(await communityApi.uploadImage(file))
      } catch (cause) {
        await toast(cause instanceof Error ? cause.message : '图片上传失败', 'danger')
      }
    }
  } finally {
    uploading.value = false
  }
}

function attachCurrentTrack() {
  const track = player.currentTrack
  if (!track) return
  draftAttachment.value = { type: 'song', song: songPayload(track) }
}

/**
 * 附加整个歌单（桌面版「分享音乐 → 歌单」）。
 *
 * 只列出已同步到云端的歌单：没有云端 ID 的歌单服务端解析不了，
 * 发出去是一张点不开的卡片。歌单里若全是本地文件，`buildPlaylistAttachment`
 * 会抛错并给出原因，这里直接提示而不是发出空附件。
 */
async function pickPlaylistAttachment(): Promise<void> {
  const candidates = library.playlists.filter((playlist) => playlist.cloudId)
  if (!candidates.length) {
    await toast('没有已同步到云端的歌单，可在歌单页先同步', 'warning')
    return
  }
  const sheet = await actionSheetController.create({
    header: '选择要分享的歌单',
    buttons: [
      ...candidates.map((playlist) => ({
        text: playlist.name,
        handler: () => {
          try {
            draftAttachment.value = buildPlaylistAttachment(
              playlist,
              library.playlistTracks(playlist.id)
            )
          } catch (error) {
            void toast(error instanceof Error ? error.message : '无法附加歌单', 'danger')
          }
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

function songPayload(track: Track): Record<string, any> {
  const raw = track.raw || {}
  return {
    songmid: String(raw.songmid || raw.songId || raw.id || track.key),
    name: String(raw.name || track.title),
    singer: String(raw.singer || track.artists.join(' / ') || '未知艺术家'),
    albumName: String(raw.albumName || raw.album || track.album || ''),
    albumId: String(raw.albumId || track.albumId || ''),
    source: String(raw.source || track.pluginKey || ''),
    interval: String(raw.interval || (track.durationMs ? Math.round(track.durationMs / 1000) : 0)),
    img: String(raw.img || track.artworkUrl || ''),
    types: Array.isArray(raw.types) ? raw.types : track.qualities || []
  }
}

async function publish() {
  if (publishing.value || uploading.value) return
  const content = draft.value.trim()
  if (!content) {
    await toast('写点内容再发布吧', 'warning')
    return
  }
  publishing.value = true
  try {
    const result = await communityApi.createPost({
      content,
      images: draftImages.value,
      attachment: draftAttachment.value || undefined
    })
    creating.value = false
    await toast('已发布')
    if (result.support) await showSupportNotice(result.support)
    feedMode.value = 'latest'
    await load(true)
    router.push('/community/' + result.id)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '发布失败', 'danger')
  } finally {
    publishing.value = false
  }
}


async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

onMounted(() => {
  void load(true)
})

onBeforeUnmount(() => {
  feedRequests.dispose()
})
</script>

<style scoped>
.feed {
  padding: 8px 10px 0;
}
.post-card {
  padding: 14px 12px 8px;
  margin-bottom: 10px;
  background: var(--ceru-bg-elevated);
  border: 1px solid var(--ceru-border);
  border-radius: 18px;
}
.post-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.author-copy {
  min-width: 0;
  flex: 1;
}
.author-name {
  font-size: 14px;
  font-weight: 700;
}
.post-time {
  margin-top: 2px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.post-content {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.62;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.image-grid {
  display: grid;
  gap: 4px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 12px;
}
.image-grid.one {
  grid-template-columns: 1fr;
  max-height: 360px;
}
.image-grid.two {
  grid-template-columns: repeat(2, 1fr);
}
.image-grid.many {
  grid-template-columns: repeat(3, 1fr);
}
.image-cell {
  padding: 0;
  border: 0;
  background: var(--ceru-bg-soft);
  min-height: 0;
  overflow: hidden;
}
.image-grid.one .image-cell {
  max-height: 360px;
}
.image-grid.one img {
  max-height: 360px;
  object-fit: contain;
}
.image-cell img {
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.attachment {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 8px;
  border-radius: 12px;
  background: var(--ceru-bg-soft);
}
.attachment-copy {
  min-width: 0;
  flex: 1;
}
.attachment-title {
  font-size: 13px;
  font-weight: 650;
}
.attachment-sub {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.post-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 8px;
}
.action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  padding: 6px 0;
}
.action ion-icon {
  font-size: 19px;
}
.action.active {
  color: var(--ceru-danger);
}
.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 70px 20px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.empty {
  padding-top: 100px;
  text-align: center;
  color: var(--ceru-text-secondary);
}
.empty ion-icon {
  font-size: 48px;
  color: var(--ceru-brand);
}
.empty h2 {
  color: var(--ceru-text);
  font-size: 18px;
}
.empty p {
  font-size: 13px;
  line-height: 1.55;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 8px;
}
.feed-end {
  padding: 18px;
  text-align: center;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.load-more-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}
.load-more-error p {
  margin: 0;
}
.bottom-space {
  height: 120px;
}
.composer {
  --background: var(--ceru-bg);
}
.composer-pad {
  padding-top: 14px;
}
.draft-input {
  --background: var(--ceru-bg-elevated);
  --padding-start: 14px;
  --padding-end: 14px;
  --padding-top: 12px;
  --padding-bottom: 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  font-size: 15px;
}
.draft-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
}
.draft-image {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--ceru-bg-soft);
}
.draft-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.draft-image button {
  position: absolute;
  top: 3px;
  right: 3px;
  border: 0;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
}
.add-image {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px dashed var(--ceru-border);
  border-radius: 12px;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.draft-attachment {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 9px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
}
.remove-attachment {
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 22px;
  padding: 6px;
}
.attach-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.attach-current {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 11px 14px;
  width: 100%;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-brand);
  font-size: 13px;
  text-align: left;
}
.composer-tip {
  margin: 18px 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.55;
}
.file-input {
  display: none;
}
</style>
