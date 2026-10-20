<template>
  <ion-modal
    class="comments-modal"
    :is-open="open"
    :initial-breakpoint="0.92"
    :breakpoints="[0, 0.55, 0.92]"
    @didDismiss="handleDismiss"
  >
    <ion-content class="comments-content" :scroll-y="true">
      <div class="comments-head">
        <div class="grabber" aria-hidden="true" />
        <div class="head-row">
          <div class="tabs" role="tablist" aria-label="评论类型">
            <button
              v-for="entry in tabs"
              :key="entry.kind"
              type="button"
              role="tab"
              :aria-selected="kind === entry.kind"
              class="tab"
              :class="{ active: kind === entry.kind }"
              @click="switchKind(entry.kind)"
            >
              {{ entry.label }}
              <span v-if="states[entry.kind].total" class="tab-count">
                {{ formatCount(states[entry.kind].total) }}
              </span>
            </button>
          </div>
          <button type="button" class="close-btn" aria-label="关闭评论" @click="emit('close')">
            <ion-icon :icon="closeOutline" />
          </button>
        </div>
        <p v-if="track" class="track-caption">
          {{ track.title }}
          <span v-if="track.artists.length"> · {{ track.artists.join(' / ') }}</span>
        </p>
      </div>

      <div class="comments-body">
        <div v-if="!track" class="state-box">
          <ion-icon :icon="chatbubbleEllipsesOutline" />
          <strong>还没有正在播放的歌曲</strong>
          <span>播放一首在线歌曲后即可查看评论。</span>
        </div>

        <template v-else>
          <div v-if="current.loading && !current.items.length" class="state-box" role="status">
            <ion-spinner name="crescent" />
            <span>正在加载{{ kindLabel }}…</span>
          </div>

          <div v-else-if="current.error && !current.items.length" class="state-box error">
            <ion-icon :icon="alertCircleOutline" />
            <strong>评论加载失败</strong>
            <span>{{ current.error }}</span>
            <button type="button" class="retry-btn" @click="retry">重试</button>
          </div>

          <div v-else-if="!current.items.length" class="state-box">
            <ion-icon :icon="chatbubbleEllipsesOutline" />
            <strong>暂无{{ kindLabel }}</strong>
            <span>这个音源暂时没有可显示的评论。</span>
          </div>

          <template v-else>
            <div v-if="current.error" class="inline-error">
              <span>{{ current.error }}</span>
              <button type="button" @click="retry">重试</button>
            </div>

            <article
              v-for="(comment, index) in current.items"
              :key="comment.id + '-' + index"
              class="comment"
            >
              <CoverImage :src="comment.avatar" :size="40" :radius="20" round :alt="comment.userName" />
              <div class="comment-main">
                <div class="comment-meta">
                  <span class="user-name">{{ comment.userName }}</span>
                  <span v-if="comment.timeStr" class="time">{{ comment.timeStr }}</span>
                  <span v-if="comment.location" class="location">{{ comment.location }}</span>
                </div>
                <p v-if="comment.text" class="comment-text">{{ comment.text }}</p>

                <div v-if="comment.images.length" class="image-grid">
                  <button
                    v-for="(image, imageIndex) in comment.images"
                    :key="image + imageIndex"
                    type="button"
                    class="image-button"
                    :aria-label="'查看评论图片 ' + (imageIndex + 1)"
                    @click="openViewer(comment.images, imageIndex)"
                  >
                    <img :src="image" alt="" loading="lazy" />
                  </button>
                </div>

                <div v-if="comment.reply.length" class="reply-block">
                  <button
                    v-if="!isExpanded(comment.id)"
                    type="button"
                    class="reply-toggle"
                    @click="toggleReplies(comment.id)"
                  >
                    展开 {{ comment.reply.length }} 条回复
                  </button>
                  <template v-else>
                    <div class="replies">
                      <div v-for="reply in comment.reply" :key="reply.id" class="reply">
                        <CoverImage :src="reply.avatar" :size="26" :radius="13" round :alt="reply.userName" />
                        <p>
                          <span class="reply-name">{{ reply.userName }}</span>
                          <span class="reply-text">：{{ reply.text }}</span>
                        </p>
                      </div>
                    </div>
                    <button type="button" class="reply-toggle" @click="toggleReplies(comment.id)">
                      收起回复
                    </button>
                  </template>
                </div>

                <div class="comment-footer">
                  <span class="like">
                    <ion-icon :icon="heartOutline" />
                    {{ formatCount(comment.likedCount) }}
                  </span>
                </div>
              </div>
            </article>

            <div class="load-more">
              <button
                v-if="hasMore"
                type="button"
                :disabled="current.loadingMore"
                @click="loadMore"
              >
                <ion-spinner v-if="current.loadingMore" name="crescent" />
                <span>{{ current.loadingMore ? '加载中…' : '加载更多评论' }}</span>
              </button>
              <span v-else class="no-more">没有更多了</span>
            </div>
          </template>
        </template>
        <div class="bottom-safe" />
      </div>
    </ion-content>

    <div v-if="viewer.open" class="image-viewer" @click.self="closeViewer">
      <button type="button" class="viewer-close" aria-label="关闭图片" @click="closeViewer">
        <ion-icon :icon="closeOutline" />
      </button>
      <button
        v-if="viewer.images.length > 1"
        type="button"
        class="viewer-arrow previous"
        aria-label="上一张图片"
        @click="moveViewer(-1)"
      >
        <ion-icon :icon="chevronBackOutline" />
      </button>
      <img :src="viewer.images[viewer.index]" alt="评论图片" />
      <button
        v-if="viewer.images.length > 1"
        type="button"
        class="viewer-arrow next"
        aria-label="下一张图片"
        @click="moveViewer(1)"
      >
        <ion-icon :icon="chevronForwardOutline" />
      </button>
      <span v-if="viewer.images.length > 1" class="viewer-count">
        {{ viewer.index + 1 }} / {{ viewer.images.length }}
      </span>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { IonContent, IonIcon, IonModal, IonSpinner } from '@ionic/vue'
import {
  alertCircleOutline,
  chatbubbleEllipsesOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  heartOutline
} from 'ionicons/icons'
import CoverImage from '@/components/CoverImage.vue'
import { usePluginStore } from '@/stores/plugins'
import { createRequestGuard } from '@/services/requestGuard'
import {
  COMMENT_PAGE_SIZE,
  commentKindLabel,
  commentPageHasMore,
  mergeCommentPages,
  type CommentKind,
  type MusicComment
} from '@/services/comments'
import type { Track } from '@/types/music'

interface CommentTabState {
  items: MusicComment[]
  page: number
  maxPage: number
  total: number
  loading: boolean
  loadingMore: boolean
  initialized: boolean
  error: string
}

const props = defineProps<{
  track: Track | null
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()
const pluginStore = usePluginStore()
const kind = ref<CommentKind>('hot')
const tabs: Array<{ kind: CommentKind; label: string }> = [
  { kind: 'hot', label: '热门评论' },
  { kind: 'latest', label: '最新评论' }
]
const expandedReplies = ref(new Set<string>())
const viewer = reactive({ open: false, images: [] as string[], index: 0 })
/** 换歌或关闭面板都会作废在途评论请求，避免旧响应覆盖新歌曲的列表。 */
const commentRequests = createRequestGuard()

function emptyState(): CommentTabState {
  return {
    items: [],
    page: 0,
    maxPage: 0,
    total: 0,
    loading: false,
    loadingMore: false,
    initialized: false,
    error: ''
  }
}

const states = reactive<Record<CommentKind, CommentTabState>>({
  hot: emptyState(),
  latest: emptyState()
})
const current = computed(() => states[kind.value])
const kindLabel = computed(() => commentKindLabel(kind.value))
const trackIdentity = computed(() => {
  const item = props.track
  if (!item) return ''
  return `${item.pluginKey || ''}:${item.ref?.providerId || ''}:${item.ref?.id || ''}:${item.key || ''}`
})
const hasMore = computed(() =>
  commentPageHasMore(
    {
      page: current.value.page,
      total: current.value.total,
      maxPage: current.value.maxPage
    },
    current.value.items.length
  )
)

function handleDismiss() {
  emit('close')
}

function formatCount(value: number): string {
  const count = Math.max(0, Number(value) || 0)
  if (count >= 10000) {
    const text = (count / 10000).toFixed(count >= 100000 ? 0 : 1)
    return text.replace(/\.0$/, '') + 'w'
  }
  return String(count)
}

function isExpanded(id: string): boolean {
  return expandedReplies.value.has(id)
}

function toggleReplies(id: string) {
  const next = new Set(expandedReplies.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedReplies.value = next
}

function openViewer(images: string[], index: number) {
  viewer.images = images.filter(Boolean)
  viewer.index = Math.min(Math.max(0, index), Math.max(0, viewer.images.length - 1))
  viewer.open = viewer.images.length > 0
}

function closeViewer() {
  viewer.open = false
  viewer.images = []
  viewer.index = 0
}

function moveViewer(step: number) {
  if (!viewer.images.length) return
  viewer.index = (viewer.index + step + viewer.images.length) % viewer.images.length
}

function resetStates() {
  commentRequests.invalidate()
  states.hot = emptyState()
  states.latest = emptyState()
  expandedReplies.value = new Set()
  closeViewer()
}

async function load(targetKind: CommentKind, reset = false) {
  const item = props.track
  if (!item || commentRequests.disposed) return
  const state = states[targetKind]
  if (state.loading || state.loadingMore) return
  if (!reset && state.initialized && !commentPageHasMore(
    { page: state.page, total: state.total, maxPage: state.maxPage },
    state.items.length
  )) {
    return
  }
  if (reset) {
    state.items = []
    state.page = 0
    state.maxPage = 0
    state.total = 0
    state.initialized = false
  }
  const page = reset ? 1 : state.page + 1
  // 两个分类各自分页，因此用 capture 并存而不是 beginLatest。
  const token = commentRequests.capture(trackIdentity.value)
  state.error = ''
  if (page === 1) state.loading = true
  else state.loadingMore = true
  try {
    const result = await pluginStore.comments(item, targetKind, page, COMMENT_PAGE_SIZE)
    if (!commentRequests.isCurrent(token, trackIdentity.value)) return
    state.items =
      page === 1 ? result.comments : mergeCommentPages(state.items, result.comments)
    state.page = result.page || page
    state.maxPage = result.maxPage
    state.total = result.total
    state.initialized = true
  } catch (cause) {
    if (!commentRequests.isCurrent(token, trackIdentity.value)) return
    state.error = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (commentRequests.isCurrent(token, trackIdentity.value)) {
      state.loading = false
      state.loadingMore = false
    }
  }
}

function ensureCurrent() {
  if (!props.track) return
  const state = states[kind.value]
  if (!state.initialized && !state.loading) void load(kind.value, false)
}

function switchKind(next: CommentKind) {
  if (kind.value === next) return
  kind.value = next
  closeViewer()
  ensureCurrent()
}

function retry() {
  void load(kind.value, true)
}

function loadMore() {
  if (!hasMore.value) return
  void load(kind.value, false)
}

watch(
  () => props.open,
  (open) => {
    if (open) ensureCurrent()
  }
)

watch(trackIdentity, () => {
  resetStates()
  kind.value = 'hot'
  if (props.open) void load('hot', false)
})

onMounted(() => {
  if (props.open) ensureCurrent()
})

onBeforeUnmount(() => {
  commentRequests.dispose()
})
</script>

<style scoped>
.comments-modal {
  --background: #0d1218;
  --border-radius: 24px 24px 0 0;
  color: #f5f8fb;
}
.comments-content {
  --background: #0d1218;
  --padding-bottom: env(safe-area-inset-bottom);
  color: #f5f8fb;
}
.comments-head {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: max(10px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-left)) 12px
    max(18px, env(safe-area-inset-right));
  background: linear-gradient(180deg, #0d1218 78%, rgba(13, 18, 24, 0.94));
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
.grabber {
  width: 38px;
  height: 5px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}
.tab {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 5px 0 8px;
  border: 0;
  background: transparent;
  color: rgba(245, 248, 251, 0.5);
  font-size: 16px;
  font-weight: 700;
}
.tab.active {
  color: #f5f8fb;
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  border-radius: 999px;
  background: #00dac0;
  box-shadow: 0 0 12px rgba(0, 218, 192, 0.38);
}
.tab-count {
  font-size: 10px;
  font-weight: 500;
  color: rgba(245, 248, 251, 0.42);
}
.close-btn {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(245, 248, 251, 0.8);
  font-size: 20px;
}
.track-caption {
  margin: 5px 0 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(245, 248, 251, 0.42);
  font-size: 11px;
}
.comments-body {
  max-width: 760px;
  margin: 0 auto;
  padding: 8px max(18px, env(safe-area-inset-left)) 0 max(18px, env(safe-area-inset-right));
}
.state-box {
  min-height: 46vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px 20px;
  text-align: center;
  color: rgba(245, 248, 251, 0.48);
  font-size: 12px;
}
.state-box ion-icon {
  font-size: 42px;
  color: #00dac0;
  opacity: 0.8;
}
.state-box strong {
  color: #f5f8fb;
  font-size: 16px;
}
.state-box span {
  max-width: 300px;
  line-height: 1.55;
}
.state-box.error ion-icon {
  color: #ff8c90;
}
.retry-btn {
  margin-top: 4px;
  padding: 8px 18px;
  border: 1px solid rgba(0, 218, 192, 0.3);
  border-radius: 999px;
  background: rgba(0, 218, 192, 0.1);
  color: #00dac0;
  font-size: 12px;
  font-weight: 650;
}
.inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 6px 0 2px;
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(255, 107, 111, 0.1);
  color: #ff8c90;
  font-size: 11px;
}
.inline-error button {
  border: 0;
  background: transparent;
  color: #ff8c90;
  font-size: 11px;
}
.comment {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.075);
}
.comment-main {
  min-width: 0;
  flex: 1;
}
.comment-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 9px;
  min-width: 0;
}
.user-name {
  color: rgba(245, 248, 251, 0.78);
  font-size: 13px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.time,
.location {
  color: rgba(245, 248, 251, 0.36);
  font-size: 10px;
}
.comment-text {
  margin: 6px 0 0;
  color: rgba(245, 248, 251, 0.9);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 9px;
}
.image-button {
  padding: 0;
  overflow: hidden;
  aspect-ratio: 1;
  border: 0;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.06);
}
.image-button img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.reply-block {
  margin-top: 9px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.045);
}
.reply-toggle {
  padding: 1px 0;
  border: 0;
  background: transparent;
  color: #00dac0;
  font-size: 11px;
}
.replies {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.reply {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}
.reply p {
  margin: 0;
  min-width: 0;
  color: rgba(245, 248, 251, 0.68);
  font-size: 11px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.reply-name {
  color: rgba(245, 248, 251, 0.84);
  font-weight: 600;
}
.comment-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 5px;
}
.like {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(245, 248, 251, 0.36);
  font-size: 10px;
}
.like ion-icon {
  font-size: 13px;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 18px 0 8px;
}
.load-more button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.055);
  color: rgba(245, 248, 251, 0.7);
  font-size: 12px;
}
.load-more button:disabled {
  opacity: 0.62;
}
.load-more ion-spinner {
  width: 14px;
  height: 14px;
}
.no-more {
  color: rgba(245, 248, 251, 0.3);
  font-size: 11px;
}
.bottom-safe {
  height: calc(28px + env(safe-area-inset-bottom));
}
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 52px 18px 70px;
  background: rgba(0, 0, 0, 0.92);
}
.image-viewer img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}
.viewer-close {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  right: 16px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 24px;
}
.viewer-arrow {
  position: absolute;
  top: 50%;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 24px;
  transform: translateY(-50%);
}
.viewer-arrow.previous {
  left: 14px;
}
.viewer-arrow.next {
  right: 14px;
}
.viewer-count {
  position: absolute;
  bottom: max(22px, env(safe-area-inset-bottom));
  left: 50%;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  transform: translateX(-50%);
}
:global(html.ios) .comments-modal {
  --border-radius: 24px 24px 0 0;
}
:global(html.md) .comments-modal {
  --border-radius: 20px 20px 0 0;
}
:global(html.ios-14) .comments-head,
:global(html.ios-15) .comments-head {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: #0d1218;
}
@media (min-width: 700px) {
  .comments-body,
  .comments-head {
    max-width: 760px;
    margin-left: auto;
    margin-right: auto;
  }
  .comments-modal {
    --width: min(760px, 92vw);
    --height: 88vh;
    --border-radius: 24px;
    margin: auto;
  }
}
</style>
