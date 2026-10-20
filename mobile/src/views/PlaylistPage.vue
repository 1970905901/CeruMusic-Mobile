<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/library" text="" />
        </ion-buttons>
        <ion-title>{{ headerTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="isLocal" fill="clear" @click="openPlaylistMenu">
            <ion-icon slot="icon-only" :icon="ellipsisHorizontal" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="hero ceru-pad">
        <CoverImage :src="cover" :size="168" :radius="22" :alt="title" class="hero-cover" />
        <div class="hero-copy">
          <p class="eyebrow">{{ isLocal ? 'PLAYLIST' : 'FROM PLUGIN' }}</p>
          <h1 class="hero-title">{{ title }}</h1>
          <p v-if="description" class="hero-desc">{{ description }}</p>
          <p class="hero-meta">{{ tracks.length }} 首 · {{ sourceName }}</p>
          <div class="hero-actions">
            <ion-button :disabled="!tracks.length" @click="playAll">
              <ion-icon slot="start" :icon="playIcon" />
              播放全部
            </ion-button>
            <ion-button fill="outline" :disabled="!tracks.length" @click="shuffleAll">
              <ion-icon slot="start" :icon="shuffle" />
              随机
            </ion-button>
          </div>
        </div>
      </div>

      <PluginSlot slot="playlist.header.actions" />

      <div v-if="loading && !tracks.length" class="loading-row">
        <ion-spinner name="crescent" />
        <span>正在加载歌曲…</span>
      </div>
      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="tracks.length" class="list-block">
        <div v-for="track in tracks" :key="track.key" class="track-list-item">
          <TrackRow
            :track="track"
            :favorite="library.isFavorite(track)"
            @play="play"
            @more="openMore"
          />
          <PlaylistItemActions :track="track" @open="openPlaylistAction" />
        </div>
      </div>

      <div v-if="playlistSections.length" class="playlist-plugin-sections ceru-pad">
        <h2>插件歌单工具</h2>
        <button
          v-for="section in playlistSections"
          :key="section.key"
          type="button"
          class="playlist-plugin-row ceru-card"
          @click="openPlaylistSection(section)"
        >
          <ion-icon :icon="albumsOutline" />
          <span class="ceru-truncate">{{ section.title }}</span>
          <small class="ceru-truncate">{{ section.pluginName }}</small>
        </button>
      </div>

      <EmptyState
        v-if="!loading && !tracks.length && !error"
        title="歌单还是空的"
        description="从歌曲菜单把歌曲添加进来，或检查远程歌单是否仍可访问。"
        :icon="albumsOutline"
      />

      <ion-infinite-scroll :disabled="!nextCursor || loading" @ionInfinite="loadMore">
        <ion-infinite-scroll-content loading-spinner="crescent" loading-text="加载更多…" />
      </ion-infinite-scroll>
      <div class="bottom-space" />
    </ion-content>

    <PlaylistItemActionSheet
      :open="playlistActionOpen"
      :track="playlistActionTrack"
      @close="closePlaylistAction"
    />
    <SharePlaylistSheet :open="shareOpen" :playlist-id="remoteId" @close="shareOpen = false" />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import { albumsOutline, ellipsisHorizontal, play as playIcon, shuffle } from 'ionicons/icons'
import { useRoute, useRouter } from 'vue-router'
import CoverImage from '@/components/CoverImage.vue'
import TrackRow from '@/components/TrackRow.vue'
import EmptyState from '@/components/EmptyState.vue'
import PluginSlot from '@/components/PluginSlot.vue'
import PlaylistItemActions from '@/components/PlaylistItemActions.vue'
import PlaylistItemActionSheet from '@/components/PlaylistItemActionSheet.vue'
import SharePlaylistSheet from '@/components/SharePlaylistSheet.vue'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import { usePlayerStore } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import { openTrackActions } from '@/services/trackActions'
import type { Track } from '@/types/music'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const player = usePlayerStore()
const auth = useAuthStore()

const remoteId = String(route.params.id || '')
const isLocal = !remoteId.startsWith('remote-')
const source = String(route.query.source || '')
const providerId = String(route.query.providerId || source)
const remoteKind = String(route.query.kind || 'playlist')
const tracks = ref<Track[]>([])
const playlistActionTrack = ref<Track | null>(null)
const playlistActionOpen = computed(() => playlistActionTrack.value !== null)
const shareOpen = ref(false)
const nextCursor = ref<string | undefined>()
const loading = ref(false)
const error = ref<string | null>(null)

const localPlaylist = computed(() => library.playlists.find((item) => item.id === remoteId))
const title = computed(() =>
  isLocal ? localPlaylist.value?.name || '歌单' : String(route.query.title || '歌单')
)
const description = computed(() =>
  isLocal ? localPlaylist.value?.description || '' : String(route.query.description || '')
)
const cover = computed(() => {
  if (isLocal) return library.playlistTracks(remoteId).find((item) => item.artworkUrl)?.artworkUrl
  return String(route.query.cover || '')
})
const playlistMenus = computed(() =>
  pluginStore.menus.filter(
    (menu) =>
      menu.slot === 'playlist.actions' &&
      (!menu.when?.loggedIn || auth.authenticated) &&
      (!menu.when?.kinds?.length || menu.when.kinds.includes('playlist'))
  )
)

const playlistSections = computed(() =>
  pluginStore.enabledPlugins.flatMap((plugin) =>
    (plugin.manifest.contributes?.playlistSections || []).map((section) => ({
      key: plugin.key + ':' + section.id,
      pluginKey: plugin.key,
      pluginName: plugin.manifest.name,
      title: section.title,
      view: section.view
    }))
  )
)

function openPlaylistAction(track: Track) {
  playlistActionTrack.value = track
}

function closePlaylistAction() {
  playlistActionTrack.value = null
}

function openPlaylistSection(section: { pluginKey: string; view: string }) {
  void router.push(
    '/plugin-surface/' +
      encodeURIComponent(section.pluginKey) +
      '/' +
      encodeURIComponent(section.view)
  )
}

const headerTitle = computed(() => title.value)
const sourceName = computed(() => {
  if (isLocal) return '本地歌单'
  const item = pluginStore.sources.find((entry) => entry.id === source)
  return item?.name || '插件歌单'
})

function loadLocal() {
  tracks.value = library.playlistTracks(remoteId)
  nextCursor.value = undefined
}

async function loadRemote(reset = false) {
  if (isLocal) {
    loadLocal()
    return
  }
  if (!reset && !nextCursor.value) return
  loading.value = true
  error.value = null
  try {
    const reference = {
      pluginId: source,
      providerId,
      kind: remoteKind === 'chart' ? 'chart' : 'playlist',
      id: String(route.query.remoteId || '')
    }
    const page =
      remoteKind === 'chart'
        ? await pluginStore.chartTracks(source, reference, reset ? undefined : nextCursor.value)
        : await pluginStore.playlistTracks(source, reference, reset ? undefined : nextCursor.value)
    const provider = pluginStore.selectedProvider(source)
    const items = (page.items || [])
      .filter((item: any) => item?.ref?.kind === 'track')
      .map((item: any) => pluginStore.normalizeEntity(provider?.pluginKey || source, item))
    tracks.value = reset ? items : [...tracks.value, ...items]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function play(track: Track) {
  try {
    await player.playTrack(track, tracks.value)
  } catch (cause) {
    const element = await toastController.create({
      message: cause instanceof Error ? cause.message : String(cause),
      duration: 2600,
      color: 'danger'
    })
    await element.present()
  }
}

async function playAll() {
  if (!tracks.value.length) return
  await play(tracks.value[0])
}

async function shuffleAll() {
  if (!tracks.value.length) return
  const shuffled = [...tracks.value].sort(() => Math.random() - 0.5)
  player.setMode({ shuffle: true })
  await play(shuffled[0])
}

function openMore(track: Track) {
  void openTrackActions(track)
}

async function loadMore(event: any) {
  try {
    await loadRemote(false)
  } finally {
    event.target.complete()
  }
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

async function openPlaylistMenu() {
  if (!isLocal || !localPlaylist.value) return
  const sheet = await actionSheetController.create({
    header: localPlaylist.value.name,
    buttons: [
      ...playlistMenus.value.map((menu) => ({
        text: menu.title,
        handler: () => {
          if (!localPlaylist.value) return
          void pluginStore
            .invokeAction(menu.pluginKey, menu.action, {
              playlist: {
                id: localPlaylist.value.id,
                name: localPlaylist.value.name,
                description: localPlaylist.value.description || '',
                trackKeys: [...localPlaylist.value.trackKeys]
              },
              tracks: tracks.value.map((track) => track.raw)
            })
            .catch((error) =>
              toast(error instanceof Error ? error.message : '插件操作失败', 'danger')
            )
        }
      })),
      {
        text: '分享歌单',
        handler: () => {
          shareOpen.value = true
        }
      },
      {
        text: '重命名',
        handler: () => {
          void renamePlaylist()
        }
      },
      {
        text: '删除歌单',
        role: 'destructive',
        handler: () => {
          void library.deletePlaylist(remoteId).then(() => router.replace('/tabs/library'))
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function renamePlaylist() {
  if (!localPlaylist.value) return
  const alert = await alertController.create({
    header: '重命名歌单',
    inputs: [{ name: 'name', type: 'text', value: localPlaylist.value.name }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  const name = String(data?.values?.name || '').trim()
  if (role === 'confirm' && name) await library.renamePlaylist(remoteId, name)
}

watch(
  () => library.playlists,
  () => {
    if (isLocal) loadLocal()
  },
  { deep: true }
)

onMounted(() => {
  if (isLocal) loadLocal()
  else void loadRemote(true)
})
</script>

<style scoped>
.hero {
  display: flex;
  gap: 18px;
  align-items: flex-end;
  padding-top: 18px;
}
.hero-cover {
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  flex: 0 0 auto;
}
.hero-copy {
  min-width: 0;
  flex: 1;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 10px;
  letter-spacing: 0.13em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.hero-title {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.035em;
  line-height: 1.08;
  font-weight: 800;
}
.hero-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ceru-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero-meta {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  flex-wrap: wrap;
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
.list-block {
  margin: 18px 8px 0;
}
.playlist-plugin-sections {
  display: grid;
  gap: 8px;
  margin-top: 20px;
}
.playlist-plugin-sections h2 {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 750;
}
.playlist-plugin-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  color: var(--ceru-text);
  text-align: left;
}
.playlist-plugin-row > ion-icon {
  color: var(--ceru-brand);
  font-size: 20px;
}
.playlist-plugin-row span {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 650;
}
.playlist-plugin-row small {
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.bottom-space {
  height: 140px;
}
@media (max-width: 420px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .hero-cover {
    align-self: center;
  }
  .hero-copy {
    width: 100%;
  }
}
</style>
