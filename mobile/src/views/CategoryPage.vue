<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/discover" text="" />
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="head ceru-pad">
        <p class="eyebrow">PLAYLISTS</p>
        <h1 class="ceru-title">{{ title }}</h1>
        <p class="head-sub">{{ sourceName }} · 公开歌单分类</p>
      </div>

      <div v-if="loading && !items.length" class="loading-row">
        <ion-spinner name="crescent" />
        <span>正在加载歌单…</span>
      </div>
      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="items.length" class="playlist-list">
        <button
          v-for="item in items"
          :key="keyOf(item)"
          class="playlist-row ceru-press"
          type="button"
          @click="openPlaylist(item)"
        >
          <CoverImage :src="artworkOf(item)" :size="66" :radius="14" :alt="item.title" />
          <div class="playlist-meta">
            <div class="playlist-title ceru-truncate">{{ item.title }}</div>
            <div class="playlist-sub ceru-truncate">
              {{ item.playlist?.author || item.subtitle || '歌单' }}
              <span v-if="item.playlist?.trackCount"> · {{ item.playlist.trackCount }} 首</span>
            </div>
            <div v-if="item.playlist?.description" class="playlist-desc ceru-truncate">
              {{ item.playlist.description }}
            </div>
          </div>
          <ion-icon :icon="chevronForward" class="chevron" />
        </button>
      </div>

      <EmptyState
        v-if="!loading && !items.length && !error"
        title="这个分类没有歌单"
        description="插件没有返回内容，或该分类暂时为空。"
        :icon="albumsOutline"
      />

      <ion-infinite-scroll :disabled="!nextCursor || loading" @ionInfinite="loadMore">
        <ion-infinite-scroll-content loading-spinner="crescent" loading-text="加载更多…" />
      </ion-infinite-scroll>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar
} from '@ionic/vue'
import { albumsOutline, chevronForward } from 'ionicons/icons'
import { useRoute, useRouter } from 'vue-router'
import CoverImage from '@/components/CoverImage.vue'
import EmptyState from '@/components/EmptyState.vue'
import { usePluginStore } from '@/stores/plugins'

const route = useRoute()
const router = useRouter()
const pluginStore = usePluginStore()
const source = String(route.query.source || '')
const providerId = String(route.query.providerId || source)
const categoryId = String(route.query.categoryId || '')
const title = String(route.query.title || '歌单分类')
const items = ref<any[]>([])
const nextCursor = ref<string | undefined>()
const loading = ref(false)
const error = ref<string | null>(null)

const sourceName = computed(
  () => pluginStore.sources.find((item) => item.id === source)?.name || '插件音源'
)

function keyOf(item: any): string {
  return item.ref?.providerId + ':' + item.ref?.id
}

function artworkOf(item: any): string | undefined {
  return item.metadata?.artworkUrl || item.playlist?.artworkUrl
}

async function load(reset = false) {
  if (!reset && !nextCursor.value) return
  loading.value = true
  error.value = null
  try {
    const page = await pluginStore.playlistList(
      source,
      { pluginId: source, providerId, kind: 'category', id: categoryId },
      reset ? undefined : nextCursor.value
    )
    const next = (page.items || []).filter((item: any) => item?.ref?.kind === 'playlist')
    items.value = reset ? next : [...items.value, ...next]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function loadMore(event: any) {
  try {
    await load(false)
  } finally {
    event.target.complete()
  }
}

function openPlaylist(item: any) {
  void router.push({
    path: '/playlist/remote-' + encodeURIComponent(source) + '-' + encodeURIComponent(item.ref?.id || ''),
    query: {
      source,
      providerId: item.ref?.providerId || providerId,
      remoteId: item.ref?.id || '',
      kind: 'playlist',
      title: item.title || '',
      subtitle: item.subtitle || '',
      cover: artworkOf(item) || '',
      description: item.playlist?.description || ''
    }
  })
}

onMounted(() => void load(true))
</script>

<style scoped>
.head {
  padding-top: 14px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.head-sub {
  margin: 9px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.loading-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.error {
  color: var(--ceru-danger);
  font-size: 12px;
  padding: 16px;
  line-height: 1.5;
}
.playlist-list {
  margin: 18px 0 0;
}
.playlist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 8px 16px;
  text-align: left;
  color: var(--ceru-text);
  min-height: 82px;
}
.playlist-meta {
  min-width: 0;
  flex: 1;
}
.playlist-title {
  font-size: 15px;
  font-weight: 650;
}
.playlist-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.playlist-desc {
  margin-top: 3px;
  font-size: 11px;
  color: var(--ceru-text-secondary);
  opacity: 0.8;
}
.chevron {
  color: var(--ceru-text-secondary);
  flex: 0 0 auto;
}
.bottom-space {
  height: 140px;
}
</style>
