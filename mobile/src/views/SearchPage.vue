<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>搜索</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" aria-label="听歌识曲" @click="$router.push('/recognize')">
            <ion-icon slot="icon-only" :icon="micOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <div class="search-wrap ceru-pad">
        <ion-searchbar
          v-model="query"
          :debounce="350"
          placeholder="搜索歌曲、歌手或歌单"
          :animated="false"
          :show-clear-button="'always'"
          @ionInput="onInput"
          @keyup.enter="runSearch(true)"
        />
        <div class="source-row">
          <button class="source-pill" type="button" @click="chooseSource">
            <span class="dot" />
            {{ sourceName }}
            <ion-icon :icon="chevronDown" />
          </button>
          <button
            v-if="searchMenus.length"
            class="source-pill"
            type="button"
            @click="openPluginTools"
          >
            <ion-icon :icon="extensionPuzzleOutline" />
            插件工具
          </button>
          <button
            v-if="query"
            class="source-pill"
            type="button"
            @click="query = ''; results = []; playlists = [];"
          >
            清空
          </button>
        </div>

        <PluginSlot slot="search.source-selector.after" />

        <ion-segment v-model="kind" class="kind-segment" @ionChange="runSearch(true)">
          <ion-segment-button value="tracks">
            <ion-label>单曲</ion-label>
          </ion-segment-button>
          <ion-segment-button value="playlists">
            <ion-label>歌单</ion-label>
          </ion-segment-button>
        </ion-segment>

        <div v-if="!query && history.length" class="history">
          <div class="history-head">
            <span>最近搜索</span>
            <button type="button" @click="settings.clearSearchHistory()">清除</button>
          </div>
          <div class="history-chips">
            <button
              v-for="item in history"
              :key="item"
              type="button"
              class="history-chip"
              @click="query = item; runSearch(true)"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <div v-if="!pluginStore.enabledPlugins.length" class="ceru-empty">
          <ion-icon :icon="extensionPuzzleOutline" />
          <div class="empty-title">还没有安装音源插件</div>
          <div class="empty-desc">安装 Ceru v2 插件后才能搜索音乐。</div>
          <ion-button @click="$router.push('/welcome')">安装插件</ion-button>
        </div>

        <div v-else-if="loading && !results.length && !playlists.length" class="loading-row">
          <ion-spinner name="crescent" />
          <span>正在搜索…</span>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <div v-if="kind === 'tracks' && results.length" class="list-block">
          <TrackRow
            v-for="track in results"
            :key="track.key"
            :track="track"
            :favorite="library.isFavorite(track)"
            @play="play"
            @more="openMore"
          />
        </div>

        <div v-if="kind === 'playlists' && playlists.length" class="playlist-list">
          <button
            v-for="playlist in playlists"
            :key="`${playlist.ref?.providerId}:${playlist.ref?.id}`"
            class="playlist-row ceru-press"
            type="button"
            @click="openPlaylist(playlist)"
          >
            <CoverImage
              :src="playlist.metadata?.artworkUrl || playlist.playlist?.artworkUrl"
              :size="66"
              :radius="14"
              :alt="playlist.title"
            />
            <div class="playlist-meta">
              <div class="playlist-title ceru-truncate">{{ playlist.title }}</div>
              <div class="playlist-sub ceru-truncate">
                {{ playlist.playlist?.author || playlist.subtitle || '歌单' }}
                <span v-if="playlist.playlist?.trackCount"> · {{ playlist.playlist.trackCount }} 首</span>
              </div>
              <div v-if="playlist.playlist?.description" class="playlist-desc ceru-truncate">
                {{ playlist.playlist.description }}
              </div>
            </div>
            <ion-icon :icon="chevronForward" class="chevron" />
          </button>
        </div>

        <div
          v-if="!loading && query && !error && !(kind === 'tracks' ? results.length : playlists.length)"
          class="ceru-empty"
        >
          <ion-icon :icon="searchOutline" />
          <div class="empty-title">没有找到结果</div>
          <div class="empty-desc">换个关键词，或切换音源试试。</div>
        </div>

        <ion-infinite-scroll :disabled="!nextCursor || loading" @ionInfinite="loadMore">
          <ion-infinite-scroll-content loading-spinner="crescent" loading-text="加载更多…" />
        </ion-infinite-scroll>
      </div>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonLabel,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  actionSheetController,
  toastController
} from '@ionic/vue'
import { chevronDown, chevronForward, extensionPuzzleOutline, micOutline, searchOutline } from 'ionicons/icons'
import { useRoute, useRouter } from 'vue-router'
import TrackRow from '@/components/TrackRow.vue'
import CoverImage from '@/components/CoverImage.vue'
import PluginSlot from '@/components/PluginSlot.vue'
import { usePluginStore } from '@/stores/plugins'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { openTrackActions } from '@/services/trackActions'
import type { Track } from '@/types/music'

const route = useRoute()
const router = useRouter()
const pluginStore = usePluginStore()
const library = useLibraryStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const auth = useAuthStore()

const query = ref('')
const kind = ref<'tracks' | 'playlists'>('tracks')
const results = ref<Track[]>([])
const playlists = ref<any[]>([])
const nextCursor = ref<string | undefined>()
const loading = ref(false)
const error = ref<string | null>(null)
const history = computed(() => settings.settings.searchHistory)
const searchMenus = computed(() =>
  pluginStore.menus.filter(
    (menu) =>
      menu.slot === 'search.tools' && (!menu.when?.loggedIn || auth.authenticated)
  )
)

const source = computed(() => {
  const id = settings.settings.lastSource
  return pluginStore.sources.find((item) => item.id === id) ?? pluginStore.sources[0]
})
const sourceName = computed(() => source.value?.name ?? '选择音源')

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

async function openPluginTools() {
  if (!searchMenus.value.length) return
  const sheet = await actionSheetController.create({
    header: '插件工具',
    buttons: [
      ...searchMenus.value.map((menu) => ({
        text: menu.title,
        handler: () => {
          void pluginStore
            .invokeAction(menu.pluginKey, menu.action, {
              query: query.value,
              kind: kind.value
            })
            .catch((error) =>
              toast(error instanceof Error ? error.message : '插件操作失败', 'danger')
            )
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function chooseSource() {
  const sheet = await actionSheetController.create({
    header: '选择音源',
    buttons: [
      ...pluginStore.sources.map((item) => ({
        text: item.name,
        handler: () => {
          settings.settings.lastSource = item.id
          void runSearch(true)
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

let timer: ReturnType<typeof setTimeout> | null = null
function onInput(event: any) {
  query.value = String(event.detail?.value ?? '')
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void runSearch(true), 380)
}

async function runSearch(reset = false) {
  const text = query.value.trim()
  if (!text) {
    results.value = []
    playlists.value = []
    nextCursor.value = undefined
    return
  }
  if (!source.value) {
    error.value = '请先安装并启用音源插件'
    return
  }
  if (!reset && !nextCursor.value) return
  loading.value = true
  error.value = null
  if (reset) {
    results.value = []
    playlists.value = []
    nextCursor.value = undefined
    settings.addSearchHistory(text)
  }
  try {
    if (kind.value === 'tracks') {
      const page = await pluginStore.searchTracks(source.value.id, text, reset ? undefined : nextCursor.value)
      results.value = reset ? page.items : [...results.value, ...page.items]
      nextCursor.value = page.nextCursor
    } else {
      const page = await pluginStore.searchPlaylists(source.value.id, text, reset ? undefined : nextCursor.value)
      const items = (page.items ?? []).map((item: any) => ({ ...item }))
      playlists.value = reset ? items : [...playlists.value, ...items]
      nextCursor.value = page.nextCursor
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function loadMore(event: any) {
  try {
    await runSearch(false)
  } finally {
    event.target.complete()
  }
}

async function play(track: Track) {
  try {
    await player.playTrack(track)
  } catch (cause) {
    const toast = await toastController.create({
      message: cause instanceof Error ? cause.message : String(cause),
      duration: 2600,
      color: 'danger'
    })
    await toast.present()
  }
}

function openMore(track: Track) {
  void openTrackActions(track)
}

function openPlaylist(item: any) {
  void router.push({
    path: `/playlist/remote-${encodeURIComponent(source.value?.id ?? '')}-${encodeURIComponent(item.ref?.id ?? '')}`,
    query: {
      source: source.value?.id ?? '',
      providerId: item.ref?.providerId ?? source.value?.id ?? '',
      remoteId: item.ref?.id ?? '',
      kind: 'playlist',
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      cover: item.metadata?.artworkUrl || item.playlist?.artworkUrl || '',
      description: item.playlist?.description ?? ''
    }
  })
}

watch(kind, () => void runSearch(true))

onMounted(() => {
  const q = String(route.query.q ?? '')
  if (q) {
    query.value = q
    void runSearch(true)
  }
})
</script>

<style scoped>
.search-wrap {
  padding-top: 8px;
}
ion-searchbar {
  padding: 0;
  --background: var(--ceru-bg-elevated);
  --border-radius: 16px;
  --box-shadow: none;
  --color: var(--ceru-text);
  --placeholder-color: var(--ceru-text-secondary);
  --icon-color: var(--ceru-text-secondary);
  border: 1px solid var(--ceru-border);
  border-radius: 16px;
  overflow: hidden;
}
.source-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  overflow-x: auto;
  scrollbar-width: none;
}
.source-row::-webkit-scrollbar {
  display: none;
}
.source-pill {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ceru-border);
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  border-radius: 999px;
  padding: 8px 13px;
  font-size: 13px;
  font-weight: 600;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ceru-brand);
}
.kind-segment {
  margin-top: 14px;
  --background: var(--ceru-bg-elevated);
  border-radius: 12px;
  padding: 3px;
}
.history {
  margin-top: 22px;
}
.history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.history-head button {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 12px;
}
.history-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.history-chip {
  border: 1px solid var(--ceru-border);
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  border-radius: 999px;
  padding: 8px 13px;
  font-size: 13px;
}
.loading-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px;
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.error {
  color: var(--ceru-danger);
  font-size: 13px;
  padding: 16px 0;
  line-height: 1.5;
}
.list-block {
  margin: 14px 0 0;
}
.playlist-list {
  margin: 14px 0 0;
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
.empty-title {
  font-weight: 700;
  color: var(--ceru-text);
}
.empty-desc {
  max-width: 280px;
  line-height: 1.55;
  font-size: 13px;
}
.bottom-space {
  height: 140px;
}
</style>
