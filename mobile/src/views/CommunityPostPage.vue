<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/community" text="" />
        </ion-buttons>
        <ion-title>帖子</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" :disabled="!post" @click="openPostActions">
            <ion-icon slot="icon-only" :icon="ellipsisHorizontal" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="post-content">
      <div v-if="loading && !post" class="loading">
        <ion-spinner name="crescent" />
        <span>加载中…</span>
      </div>

      <div v-else-if="error && !post" class="empty ceru-pad">
        <ion-icon :icon="cloudOfflineOutline" />
        <h2>帖子加载失败</h2>
        <p>{{ error }}</p>
        <ion-button fill="outline" @click="loadPost">重试</ion-button>
      </div>

      <template v-else-if="post">
        <div class="post-main ceru-pad">
          <header class="author-row">
            <CoverImage :src="ossAvatar(post.userAvatar)" :size="44" :radius="22" :alt="post.username" />
            <div class="author-copy">
              <div class="author-name">{{ post.username || '音乐同好' }}</div>
              <div class="post-time">{{ formatTime(post.createdAt) }}<span v-if="post.ipLocation"> · {{ post.ipLocation }}</span></div>
            </div>
            <button v-if="isOwnPost" type="button" class="mini-action" @click="startEdit">编辑</button>
          </header>

          <p v-if="post.content" class="body-text">{{ post.content }}</p>

          <div v-if="post.images.length" class="detail-images">
            <button
              v-for="(image, index) in post.images"
              :key="imageUrl(image) + index"
              type="button"
              class="detail-image"
              @click="openViewer(index)"
            >
              <img :src="ossCard(imageUrl(image))" alt="" loading="lazy" />
            </button>
          </div>

          <div v-if="attachment" class="attachment-card" @click="playAttachment">
            <CoverImage :src="ossCard(attachmentCover)" :size="62" :radius="12" :alt="attachmentTitle" />
            <div class="attachment-copy">
              <div class="attachment-title">{{ attachmentTitle }}</div>
              <div class="attachment-sub">{{ attachmentSubtitle }}</div>
            </div>
            <ion-icon :icon="attachment.type === 'song' ? playCircleOutline : musicalNotesOutline" />
          </div>

          <div class="post-stats">
            <button type="button" class="stat" :class="{ active: post.liked }" @click="togglePostLike">
              <ion-icon :icon="post.liked ? heart : heartOutline" />
              {{ formatCount(post.likeCount) }}
            </button>
            <span class="stat"><ion-icon :icon="chatbubbleOutline" /> {{ post.commentCount }}</span>
            <button type="button" class="stat share" @click="sharePost">
              <ion-icon :icon="shareOutline" />
              分享
            </button>
          </div>
        </div>

        <div class="comments-head ceru-pad">
          <h2>评论 <span>{{ post.commentCount }}</span></h2>
        </div>

        <div v-if="rootComments.length" class="comments ceru-pad">
          <article v-for="comment in rootComments" :key="comment.id" class="comment">
            <CoverImage :src="ossAvatar(comment.userAvatar)" :size="36" :radius="18" :alt="comment.username" />
            <div class="comment-body">
              <div class="comment-name">
                {{ comment.username || '音乐同好' }}
                <span v-if="comment.userId === post.userId" class="badge">作者</span>
                <span v-else-if="isOwnComment(comment)" class="badge me">我</span>
              </div>
              <p class="comment-text">{{ comment.content }}</p>
              <div class="comment-meta">
                <span>{{ formatTime(comment.createdAt) }}</span>
                <button type="button" class="meta-btn" :class="{ active: comment.liked }" @click="toggleCommentLike(comment)">
                  <ion-icon :icon="comment.liked ? heart : heartOutline" />
                  <span v-if="comment.likeCount">{{ comment.likeCount }}</span>
                </button>
                <button type="button" class="meta-btn" @click="startReply(comment)">回复</button>
                <button v-if="isOwnComment(comment)" type="button" class="meta-btn danger" @click="deleteComment(comment)">删除</button>
              </div>

              <div v-if="repliesFor(comment).length" class="replies">
                <article v-for="reply in repliesFor(comment)" :key="reply.id" class="reply">
                  <CoverImage :src="ossAvatar(reply.userAvatar)" :size="30" :radius="15" :alt="reply.username" />
                  <div class="comment-body">
                    <div class="comment-name">
                      {{ reply.username || '音乐同好' }}
                      <span v-if="reply.userId === post.userId" class="badge">作者</span>
                      <span v-else-if="isOwnComment(reply)" class="badge me">我</span>
                      <span v-if="reply.replyToUsername" class="reply-to">回复 @{{ reply.replyToUsername }}</span>
                    </div>
                    <p class="comment-text">{{ reply.content }}</p>
                    <div class="comment-meta">
                      <span>{{ formatTime(reply.createdAt) }}</span>
                      <button type="button" class="meta-btn" :class="{ active: reply.liked }" @click="toggleCommentLike(reply)">
                        <ion-icon :icon="reply.liked ? heart : heartOutline" />
                        <span v-if="reply.likeCount">{{ reply.likeCount }}</span>
                      </button>
                      <button type="button" class="meta-btn" @click="startReply(reply)">回复</button>
                      <button v-if="isOwnComment(reply)" type="button" class="meta-btn danger" @click="deleteComment(reply)">删除</button>
                    </div>
                  </div>
                </article>
              </div>

              <button
                v-if="pendingReplies(comment) > 0"
                type="button"
                class="more-replies"
                :disabled="loadingReplies.has(comment.id)"
                @click="loadMoreReplies(comment)"
              >
                {{ loadingReplies.has(comment.id) ? '加载中…' : '加载更多回复 (' + pendingReplies(comment) + ')' }}
              </button>
            </div>
          </article>
        </div>

        <div v-else-if="commentsLoading" class="loading small">
          <ion-spinner name="crescent" />
          <span>加载评论…</span>
        </div>
        <div v-else-if="commentsError" class="comments-empty">
          <p>{{ commentsError }}</p>
          <ion-button size="small" fill="outline" @click="loadComments(true)">重试</ion-button>
        </div>
        <div v-else class="comments-empty">还没有评论，说说你的看法</div>

        <div v-if="commentsHasMore" class="load-more">
          <ion-button fill="clear" :disabled="commentsLoadingMore" @click="loadComments(false)">
            {{ commentsLoadingMore ? '加载中…' : '加载更多评论' }}
          </ion-button>
        </div>
        <div class="bottom-space" />
      </template>
    </ion-content>

    <ion-footer v-if="post" class="comment-footer">
      <div v-if="replyTarget" class="reply-banner">
        <span>回复 @{{ replyTarget.username }}</span>
        <button type="button" @click="cancelReply">取消</button>
      </div>
      <div class="comment-input-row">
        <ion-textarea
          ref="commentBox"
          v-model="commentDraft"
          auto-grow
          :maxlength="300"
          placeholder="说点什么…"
          class="comment-input"
        />
        <ion-button :disabled="!commentDraft.trim() || submittingComment" @click="submitComment">
          {{ submittingComment ? '发送中' : '发送' }}
        </ion-button>
      </div>
    </ion-footer>

    <ion-modal :is-open="editing" @didDismiss="editing = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-button @click="editing = false">取消</ion-button></ion-buttons>
          <ion-title>编辑帖子</ion-title>
          <ion-buttons slot="end"><ion-button :disabled="saving" @click="saveEdit">保存</ion-button></ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="edit-content">
        <div class="ceru-pad">
          <ion-textarea v-model="editDraft" auto-grow :maxlength="1000" class="edit-textarea" />
          <div v-if="editImages.length" class="edit-images">
            <div v-for="(image, index) in editImages" :key="imageUrl(image) + index" class="edit-image">
              <img :src="imageUrl(image)" alt="" />
              <button type="button" aria-label="移除图片" @click="editImages.splice(index, 1)">
                <ion-icon :icon="closeCircle" />
              </button>
            </div>
          </div>
          <button v-if="editImages.length < 9" type="button" class="add-image" :disabled="uploading" @click="editImageInput?.click()">
            <ion-spinner v-if="uploading" name="crescent" />
            <ion-icon v-else :icon="imageOutline" />
            {{ uploading ? '上传中…' : '添加图片' }}
          </button>
          <input ref="editImageInput" class="file-input" type="file" accept="image/*" multiple @change="pickEditImages" />
        </div>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="viewerOpen" @didDismiss="viewerOpen = false" class="viewer-modal">
      <ion-content class="viewer-content" @click="viewerOpen = false">
        <img :src="ossDetail(viewerUrl)" alt="" class="viewer-image" />
      </ion-content>
    </ion-modal>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  alertController,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  chatbubbleOutline,
  closeCircle,
  cloudOfflineOutline,
  ellipsisHorizontal,
  heart,
  heartOutline,
  imageOutline,
  musicalNotesOutline,
  playCircleOutline,
  shareOutline
} from 'ionicons/icons'
import { Share } from '@capacitor/share'
import CoverImage from '@/components/CoverImage.vue'
import { ossAvatar, ossCard, ossDetail } from '@/services/ossImage'
import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { usePluginStore } from '@/stores/plugins'
import {
  communityApi,
  type CommunityComment,
  type CommunityPost,
  type PostAttachment,
  type PostImage,
  type PostImageOrUrl
} from '@/services/communityApi'

const route = useRoute()
const router = useIonRouter()
const auth = useAuthStore()
const player = usePlayerStore()
const pluginStore = usePluginStore()

const postId = String(route.params.id || '')
const post = ref<CommunityPost | null>(null)
const loading = ref(false)
const error = ref('')
const liking = ref(false)
const commentDraft = ref('')
const commentBox = ref<any>()
const comments = ref<CommunityComment[]>([])
const commentsPage = ref(1)
const commentsHasMore = ref(false)
const commentsLoading = ref(false)
const commentsLoadingMore = ref(false)
const commentsError = ref('')
const loadingReplies = reactive(new Set<string>())
const submittingComment = ref(false)
const replyTarget = ref<{ commentId: string; parentId: string; username: string } | null>(null)

const editing = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editDraft = ref('')
const editImages = ref<PostImageOrUrl[]>([])
const editAttachment = ref<PostAttachment | null>(null)
const editImageInput = ref<HTMLInputElement>()

const viewerOpen = ref(false)
const viewerUrl = ref('')

const currentUserId = computed(() => String((auth.user as any)?.sub || ''))
const isOwnPost = computed(() => !!post.value && post.value.userId === currentUserId.value)
const attachment = computed(() => post.value?.attachment || null)
const attachmentCover = computed(() => {
  const value = attachment.value
  if (!value) return ''
  return value.type === 'song'
    ? String(value.song?.img || '')
    : String(value.cover || value.preview?.[0]?.img || '')
})
const attachmentTitle = computed(() => {
  const value = attachment.value
  if (!value) return ''
  return value.type === 'song' ? String(value.song?.name || '音乐') : String(value.name || '歌单')
})
const attachmentSubtitle = computed(() => {
  const value = attachment.value
  if (!value) return ''
  if (value.type === 'song') return String(value.song?.singer || '单曲分享')
  return String(value.songCount || 0) + ' 首歌曲 · 歌单分享'
})
const rootComments = computed(() => comments.value.filter((comment) => !comment.parentId))
const repliesByParent = computed<Record<string, CommunityComment[]>>(() => {
  const map: Record<string, CommunityComment[]> = {}
  for (const comment of comments.value) {
    if (comment.parentId) (map[comment.parentId] ||= []).push(comment)
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }
  return map
})

function imageUrl(image: PostImageOrUrl): string {
  return typeof image === 'string' ? image : image.url
}

function formatCount(value: number): string {
  if (!value) return '0'
  if (value < 10000) return String(value)
  return (value / 10000).toFixed(1) + '万'
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前'
  return date.toLocaleDateString()
}

function isOwnComment(comment: CommunityComment): boolean {
  return comment.userId === currentUserId.value
}

function repliesFor(comment: CommunityComment): CommunityComment[] {
  return repliesByParent.value[comment.id] || []
}

function pendingReplies(comment: CommunityComment): number {
  return Math.max(0, Number(comment.replyCount || 0) - repliesFor(comment).length)
}

async function loadPost() {
  loading.value = true
  error.value = ''
  try {
    post.value = await communityApi.getPost(postId)
    await loadComments(true)
    const commentId = String(route.query.comment || '')
    if (commentId) {
      const target = comments.value.find((item) => item.id === commentId)
      if (target) startReply(target)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadComments(reset: boolean) {
  if (commentsLoading.value || commentsLoadingMore.value) return
  if (reset) {
    commentsPage.value = 1
    comments.value = []
    commentsError.value = ''
    commentsLoading.value = true
  } else {
    if (!commentsHasMore.value) return
    commentsLoadingMore.value = true
  }
  try {
    const result = await communityApi.listComments(postId, commentsPage.value, 20)
    const known = new Set(comments.value.map((item) => item.id))
    comments.value = [...comments.value, ...(result.items || []).filter((item) => !known.has(item.id))]
    commentsHasMore.value = !!result.hasMore
    if (commentsHasMore.value) commentsPage.value += 1
    if (post.value && Number.isFinite(Number(result.total))) {
      post.value.commentCount = Number(result.total)
    }
  } catch (cause) {
    commentsError.value = cause instanceof Error ? cause.message : '评论加载失败'
  } finally {
    commentsLoading.value = false
    commentsLoadingMore.value = false
  }
}

async function loadMoreReplies(comment: CommunityComment) {
  if (loadingReplies.has(comment.id)) return
  const loaded = repliesFor(comment).length
  const page = Math.floor(loaded / 50) + 1
  loadingReplies.add(comment.id)
  try {
    const result = await communityApi.listReplies(comment.id, page, 50)
    const known = new Set(comments.value.map((item) => item.id))
    comments.value = [...comments.value, ...(result.items || []).filter((item) => !known.has(item.id))]
    if (Number(result.total)) comment.replyCount = Number(result.total)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '回复加载失败', 'danger')
  } finally {
    loadingReplies.delete(comment.id)
  }
}

function requireLogin(): boolean {
  if (auth.authenticated) return true
  void toast('登录后才能操作', 'warning')
  router.push('/account')
  return false
}

async function togglePostLike() {
  if (!post.value || !requireLogin() || liking.value) return
  liking.value = true
  const was = post.value.liked
  post.value.liked = !was
  post.value.likeCount = Math.max(0, post.value.likeCount + (post.value.liked ? 1 : -1))
  try {
    const result = await communityApi.toggleLike(post.value.id)
    post.value.liked = result.liked
  } catch (cause) {
    post.value.liked = was
    post.value.likeCount = Math.max(0, post.value.likeCount + (was ? 1 : -1))
    await toast(cause instanceof Error ? cause.message : '操作失败', 'danger')
  } finally {
    liking.value = false
  }
}

function startReply(comment: CommunityComment) {
  if (!requireLogin()) return
  replyTarget.value = {
    commentId: comment.id,
    parentId: comment.parentId || comment.id,
    username: comment.username || '音乐同好'
  }
  setTimeout(() => commentBox.value?.setFocus?.(), 50)
}

function cancelReply() {
  replyTarget.value = null
}

async function submitComment() {
  const content = commentDraft.value.trim()
  if (!content || submittingComment.value || !post.value) return
  if (!requireLogin()) return
  submittingComment.value = true
  try {
    const created = await communityApi.createComment({
      postId: post.value.id,
      content,
      parentId: replyTarget.value?.parentId,
      replyToCommentId: replyTarget.value?.commentId,
      replyToUsername: replyTarget.value?.username
    })
    if (created.parentId) {
      comments.value.push(created)
      const root = comments.value.find((item) => item.id === created.parentId)
      if (root) root.replyCount = Number(root.replyCount || 0) + 1
    } else {
      comments.value.unshift(created)
    }
    post.value.commentCount += 1
    commentDraft.value = ''
    cancelReply()
    if (created.support) await showSupport(created.support)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '评论失败', 'danger')
  } finally {
    submittingComment.value = false
  }
}

async function toggleCommentLike(comment: CommunityComment) {
  if (!requireLogin()) return
  const was = comment.liked
  comment.liked = !was
  comment.likeCount = Math.max(0, comment.likeCount + (comment.liked ? 1 : -1))
  try {
    const result = await communityApi.toggleCommentLike(comment.id)
    comment.liked = result.liked
  } catch (cause) {
    comment.liked = was
    comment.likeCount = Math.max(0, comment.likeCount + (was ? 1 : -1))
    await toast(cause instanceof Error ? cause.message : '操作失败', 'danger')
  }
}

async function deleteComment(comment: CommunityComment) {
  const alert = await alertController.create({
    header: '删除评论？',
    message: '删除后无法恢复。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '删除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  try {
    await communityApi.deleteComment(comment.id)
    const removedReplies = comments.value.filter((item) => item.parentId === comment.id).length
    comments.value = comments.value.filter((item) => item.id !== comment.id && item.parentId !== comment.id)
    if (post.value) post.value.commentCount = Math.max(0, post.value.commentCount - 1 - removedReplies)
    const root = comment.parentId ? comments.value.find((item) => item.id === comment.parentId) : null
    if (root) root.replyCount = Math.max(0, Number(root.replyCount || 1) - 1)
    await toast('已删除')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '删除失败', 'danger')
  }
}

function openViewer(index: number) {
  const image = post.value?.images[index]
  if (!image) return
  viewerUrl.value = imageUrl(image)
  viewerOpen.value = true
}

async function playAttachment() {
  const value = attachment.value
  if (!value) return
  if (value.type !== 'song') {
    await toast('歌单附件将在后续云歌单功能中打开', 'medium')
    return
  }
  const song = value.song || {}
  const provider = pluginStore.selectedProvider(String(song.source || ''))
  if (!provider) {
    await toast('需要安装并启用对应音源插件才能播放', 'warning')
    return
  }
  const entity = {
    ref: {
      kind: 'track',
      providerId: String(song.source || provider.providerId),
      id: String(song.songmid || ''),
      scope: 'provider'
    },
    title: String(song.name || '未知歌曲'),
    subtitle: String(song.singer || ''),
    durationMs: Number(song.interval || 0) * 1000,
    playable: true,
    metadata: {
      artists: String(song.singer || '').split(/[\/,，、]/).map((item) => item.trim()).filter(Boolean),
      album: { title: String(song.albumName || ''), id: String(song.albumId || '') },
      artworkUrl: String(song.img || ''),
      qualities: Array.isArray(song.types) ? song.types : []
    }
  }
  try {
    await player.hostPlay(entity)
    router.push('/player')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '无法播放该歌曲', 'danger')
  }
}

async function sharePost() {
  if (!post.value) return
  try {
    await Share.share({
      title: 'Ceru Music 社区',
      text: post.value.content.slice(0, 120) || post.value.username + ' 分享了音乐',
      url: 'https://ceru.shiqianjiang.cn/community/' + post.value.id
    })
  } catch {
    // Closing the share sheet is not an error.
  }
}

async function openPostActions() {
  if (!post.value) return
  if (!requireLogin()) return
  const buttons: any[] = []
  if (isOwnPost.value) {
    buttons.push({ text: '编辑帖子', handler: () => startEdit() })
    buttons.push({ text: '删除帖子', role: 'destructive', handler: () => void deletePost() })
  } else {
    buttons.push({ text: '举报帖子', handler: () => void reportPost() })
  }
  buttons.push({ text: '取消', role: 'cancel' })
  const sheet = await alertController.create({ header: '帖子操作', buttons })
  await sheet.present()
}

async function reportPost() {
  if (!post.value) return
  const alert = await alertController.create({
    header: '举报帖子',
    message: '请填写举报理由（不超过 255 字）',
    inputs: [{ name: 'reason', type: 'textarea', placeholder: '涉嫌侵权、辱骂或其他违规内容…' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '提交', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const reason = String(data?.values?.reason || '').trim()
  if (!reason) {
    await toast('请填写举报理由', 'warning')
    return
  }
  try {
    const result = await communityApi.report({ postId: post.value.id, reason })
    await toast(result.already ? '你已经举报过这篇帖子' : '举报已提交，管理员会复核')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '举报失败', 'danger')
  }
}

async function deletePost() {
  if (!post.value) return
  const alert = await alertController.create({
    header: '删除帖子？',
    message: '删除后帖子将从社区移除，且无法恢复。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '删除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  try {
    await communityApi.deletePost(post.value.id)
    await toast('已删除')
    router.push('/community')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '删除失败', 'danger')
  }
}

function startEdit() {
  if (!post.value) return
  editDraft.value = post.value.content
  editImages.value = post.value.images.map((image) => (typeof image === 'string' ? image : { ...image }))
  editAttachment.value = post.value.attachment ? JSON.parse(JSON.stringify(post.value.attachment)) : null
  editing.value = true
}

async function pickEditImages(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const room = 9 - editImages.value.length
  if (!files.length || room <= 0) return
  uploading.value = true
  try {
    for (const file of files.slice(0, room)) {
      try {
        editImages.value.push(await communityApi.uploadImage(file))
      } catch (cause) {
        await toast(cause instanceof Error ? cause.message : '图片上传失败', 'danger')
      }
    }
  } finally {
    uploading.value = false
  }
}

async function saveEdit() {
  if (!post.value || saving.value) return
  const content = editDraft.value.trim()
  if (!content) {
    await toast('内容不能为空', 'warning')
    return
  }
  saving.value = true
  try {
    const updated = await communityApi.updatePost(post.value.id, {
      content,
      images: editImages.value,
      attachment: editAttachment.value || undefined
    })
    post.value = updated
    editing.value = false
    await toast('已保存')
    if (updated.support) await showSupport(updated.support)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '保存失败', 'danger')
  } finally {
    saving.value = false
  }
}

async function showSupport(support: { title: string; text: string; hotline?: string }) {
  const alert = await alertController.create({
    header: support.title,
    message: support.text + (support.hotline ? '\n\n心理援助热线：' + support.hotline : ''),
    buttons: ['我知道了']
  })
  await alert.present()
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

onMounted(() => {
  void loadPost()
})
</script>

<style scoped>
.post-content {
  --background: var(--ceru-bg);
}
.post-main {
  padding-top: 18px;
}
.author-row {
  display: flex;
  align-items: center;
  gap: 11px;
}
.author-copy {
  min-width: 0;
  flex: 1;
}
.author-name {
  font-size: 15px;
  font-weight: 700;
}
.post-time {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.mini-action {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 12px;
  padding: 6px;
}
.body-text {
  margin: 16px 0 0;
  font-size: 15px;
  line-height: 1.72;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-images {
  display: grid;
  gap: 5px;
  margin-top: 14px;
}
.detail-image {
  border: 0;
  padding: 0;
  background: var(--ceru-bg-soft);
  border-radius: 10px;
  overflow: hidden;
}
.detail-image img {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  display: block;
}
.attachment-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 15px;
  padding: 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-bg-elevated);
}
.attachment-copy {
  min-width: 0;
  flex: 1;
}
.attachment-title {
  font-size: 14px;
  font-weight: 700;
}
.attachment-sub {
  margin-top: 4px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.attachment-card > ion-icon {
  color: var(--ceru-brand);
  font-size: 26px;
}
.post-stats {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 16px;
  padding: 8px 0 14px;
  border-bottom: 1px solid var(--ceru-border);
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  padding: 6px 0;
}
.stat ion-icon {
  font-size: 20px;
}
.stat.active {
  color: var(--ceru-danger);
}
.stat.share {
  margin-left: auto;
}
.comments-head {
  padding-top: 18px;
}
.comments-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 750;
}
.comments-head span {
  color: var(--ceru-text-secondary);
  font-weight: 500;
}
.comments {
  padding-top: 8px;
}
.comment {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ceru-border);
}
.comment-body {
  min-width: 0;
  flex: 1;
}
.comment-name {
  font-size: 13px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.badge {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(0, 179, 155, 0.12);
  color: var(--ceru-brand);
  font-size: 9px;
  font-weight: 600;
}
.badge.me {
  background: rgba(80, 120, 255, 0.12);
  color: #5078ff;
}
.reply-to {
  color: var(--ceru-text-secondary);
  font-size: 11px;
  font-weight: 400;
}
.comment-text {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.comment-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.meta-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  padding: 2px;
  font-size: 10px;
}
.meta-btn ion-icon {
  font-size: 14px;
}
.meta-btn.active {
  color: var(--ceru-danger);
}
.meta-btn.danger {
  color: var(--ceru-danger);
}
.replies {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--ceru-bg-soft);
}
.reply {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 0;
}
.more-replies {
  margin-top: 7px;
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 11px;
  padding: 3px 0;
}
.comments-empty {
  padding: 30px 20px;
  text-align: center;
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 10px;
}
.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 90px 20px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.loading.small {
  padding: 24px;
}
.empty {
  padding-top: 100px;
  text-align: center;
  color: var(--ceru-text-secondary);
}
.empty ion-icon {
  font-size: 46px;
  color: var(--ceru-brand);
}
.empty h2 {
  color: var(--ceru-text);
}
.empty p {
  font-size: 13px;
}
.bottom-space {
  height: 130px;
}
.comment-footer {
  border-top: 1px solid var(--ceru-border);
  background: var(--ceru-bg);
}
.reply-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 14px 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.reply-banner button {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 11px;
}
.comment-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 7px 10px calc(7px + env(safe-area-inset-bottom));
}
.comment-input {
  flex: 1;
  min-height: 38px;
  max-height: 110px;
  --background: var(--ceru-bg-elevated);
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 9px;
  --padding-bottom: 9px;
  border: 1px solid var(--ceru-border);
  border-radius: 18px;
  font-size: 13px;
}
.comment-input-row ion-button {
  --border-radius: 18px;
  height: 38px;
  margin: 0;
}
.edit-content {
  --background: var(--ceru-bg);
}
.edit-textarea {
  --background: var(--ceru-bg-elevated);
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 10px;
  --padding-bottom: 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  font-size: 14px;
}
.edit-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 12px;
}
.edit-image {
  position: relative;
  aspect-ratio: 1;
  border-radius: 9px;
  overflow: hidden;
}
.edit-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.edit-image button {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.add-image {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 9px 13px;
  border: 1px dashed var(--ceru-border);
  border-radius: 10px;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.file-input {
  display: none;
}
.viewer-content {
  --background: #000;
}
.viewer-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
