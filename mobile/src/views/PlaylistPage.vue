<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button v-if="batchMode" fill="clear" @click="exitBatchMode">取消</ion-button>
          <ion-back-button v-else default-href="/tabs/library" text="" />
        </ion-buttons>
        <ion-title>{{ batchMode ? `已选择 ${selectedCount} 首` : headerTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="batchMode" fill="clear" @click="toggleSelectAll">
            {{ isAllSelected ? '取消全选' : '全选' }}
          </ion-button>
          <ion-button v-else-if="reorderMode" fill="clear" @click="exitReorder">完成</ion-button>
          <template v-else>
            <ion-button
              v-if="tracks.length"
              fill="clear"
              title="批量选择"
              @click="enterBatchMode"
            >
              <ion-icon slot="icon-only" :icon="checkmarkDoneOutline" />
            </ion-button>
            <ion-button v-if="isLocal" fill="clear" @click="openPlaylistMenu">
              <ion-icon slot="icon-only" :icon="ellipsisHorizontal" />
            </ion-button>
          </template>
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
            <ion-button :disabled="!tracks.length || batchMode" @click="playAll">
              <ion-icon slot="start" :icon="playIcon" />
              播放全部
            </ion-button>
            <ion-button fill="outline" :disabled="!tracks.length || batchMode" @click="shuffleAll">
              <ion-icon slot="start" :icon="shuffle" />
              随机
            </ion-button>
            <ion-button
              v-if="!batchMode && !reorderMode"
              fill="outline"
              :disabled="!tracks.length"
              @click="enterBatchMode"
            >
              <ion-icon slot="start" :icon="checkmarkDoneOutline" />
              批量
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

      <p v-if="reorderMode" class="reorder-hint ceru-pad">拖动右侧手柄调整歌曲顺序，完成后自动保存。</p>

      <div v-if="tracks.length && !reorderMode" class="list-block">
        <div v-for="track in tracks" :key="track.key" class="track-list-item">
          <TrackRow
            :track="track"
            :favorite="library.isFavorite(track)"
            :selectable="batchMode"
            :selected="selectedKeys.has(track.key)"
            @play="play"
            @more="openMore"
            @toggleSelect="toggleSelectTrack"
          />
          <PlaylistItemActions v-if="!batchMode" :track="track" @open="openPlaylistAction" />
        </div>
      </div>

      <ion-reorder-group
        v-else-if="tracks.length"
        class="reorder-block"
        :disabled="false"
        @ionItemReorder="onReorder"
      >
        <ion-item v-for="track in tracks" :key="track.key" class="reorder-item" lines="none">
          <ion-label class="reorder-label">
            <div class="reorder-title ceru-truncate">{{ track.title }}</div>
            <div class="reorder-sub ceru-truncate">
              {{ track.artists.join(' / ') || '未知艺术家' }}
            </div>
          </ion-label>
          <ion-reorder slot="end" />
        </ion-item>
      </ion-reorder-group>

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

    <!-- 底部批量操作栏 -->
    <div v-if="batchMode" class="batch-bar-backdrop">
      <div class="batch-bar-container ceru-card">
        <button
          type="button"
          class="batch-action-btn ceru-press"
          :disabled="selectedCount === 0"
          @click="playSelected"
        >
          <ion-icon :icon="playIcon" />
          <span>播放</span>
        </button>
        <button
          type="button"
          class="batch-action-btn ceru-press"
          :disabled="selectedCount === 0"
          @click="playNextSelected"
        >
          <ion-icon :icon="playSkipForwardOutline" />
          <span>下一首</span>
        </button>
        <button
          type="button"
          class="batch-action-btn ceru-press"
          :disabled="selectedCount === 0"
          @click="addToPlaylistSelected"
        >
          <ion-icon :icon="addCircleOutline" />
          <span>加歌单</span>
        </button>
        <button
          type="button"
          class="batch-action-btn ceru-press"
          :disabled="selectedCount === 0"
          @click="downloadSelected"
        >
          <ion-icon :icon="cloudDownloadOutline" />
          <span>下载</span>
        </button>
        <button
          v-if="isLocal"
          type="button"
          class="batch-action-btn danger ceru-press"
          :disabled="selectedCount === 0"
          @click="removeSelected"
        >
          <ion-icon :icon="trashOutline" />
          <span>移除</span>
        </button>
      </div>
    </div>

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
  IonItem,
  IonLabel,
  IonPage,
  IonReorder,
  IonReorderGroup,
  IonSpinner,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import {
  albumsOutline,
  checkmarkDoneOutline,
  ellipsisHorizontal,
  play as playIcon,
  playSkipForwardOutline,
  addCircleOutline,
  cloudDownloadOutline,
  trashOutline,
  shuffle
} from 'ionicons/icons'
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
import { useDownloadStore } from '@/stores/downloads'
import { useAuthStore } from '@/stores/auth'
import { openTrackActions, addTracksToPlaylistDialog } from '@/services/trackActions'
import { Clipboard } from '@capacitor/clipboard'
import { encryptPlaylistTracks, packPlaylistFile, playlistFileName } from '@/services/playlistFiles'
import { saveAndShareFile } from '@/services/fileExport'
import type { Track } from '@/types/music'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const player = usePlayerStore()
const downloads = useDownloadStore()
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
const reorderMode = ref(false)
const batchMode = ref(false)
const selectedKeys = ref<Set<string>>(new Set())

const selectedTracks = computed(() =>
  tracks.value.filter((track) => selectedKeys.value.has(track.key))
)
const selectedCount = computed(() => selectedKeys.value.size)
const isAllSelected = computed(
  () => tracks.value.length > 0 && selectedKeys.value.size === tracks.value.length
)

function toggleSelectTrack(track: Track) {
  const next = new Set(selectedKeys.value)
  if (next.has(track.key)) {
    next.delete(track.key)
  } else {
    next.add(track.key)
  }
  selectedKeys.value = next
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedKeys.value = new Set()
  } else {
    selectedKeys.value = new Set(tracks.value.map((t) => t.key))
  }
}

function enterBatchMode(): void {
  if (!tracks.value.length) return
  reorderMode.value = false
  batchMode.value = true
  selectedKeys.value = new Set()
}

function exitBatchMode(): void {
  batchMode.value = false
  selectedKeys.value = new Set()
}

async function playSelected() {
  if (!selectedTracks.value.length) return
  await play(selectedTracks.value[0], selectedTracks.value)
  exitBatchMode()
}

function playNextSelected() {
  if (!selectedTracks.value.length) return
  player.insertTracksNext(selectedTracks.value)
  void toast(`已将 ${selectedTracks.value.length} 首歌曲加入下一首播放`)
  exitBatchMode()
}

async function addToPlaylistSelected() {
  if (!selectedTracks.value.length) return
  await addTracksToPlaylistDialog(selectedTracks.value)
  exitBatchMode()
}

async function downloadSelected() {
  if (!selectedTracks.value.length) return
  try {
    const enqueued = await downloads.createBatchDownloads(selectedTracks.value)
    if (enqueued > 0) {
      await toast(`已添加 ${enqueued} 首歌曲到下载队列`)
    } else {
      await toast('所选歌曲已在下载或已是本地歌曲')
    }
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '批量下载失败', 'danger')
  }
  exitBatchMode()
}

async function removeSelected() {
  if (!isLocal || !selectedTracks.value.length) return
  const count = selectedTracks.value.length
  const alert = await alertController.create({
    header: '从歌单中移除',
    message: `确定要从当前歌单移除选中的 ${count} 首歌曲吗？`,
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '移除',
        role: 'destructive',
        handler: () => {
          void doRemoveSelected()
        }
      }
    ]
  })
  await alert.present()
}

async function doRemoveSelected() {
  try {
    const keys = Array.from(selectedKeys.value)
    const removedCount = await library.removeTracksFromPlaylist(remoteId, keys)
    loadLocal()
    await toast(`已从歌单移除 ${removedCount} 首歌曲`)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '移除失败', 'danger')
  } finally {
    exitBatchMode()
  }
}
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

async function play(track: Track, customQueue?: Track[]) {
  try {
    await player.playTrack(track, customQueue || tracks.value)
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
  await play(shuffled[0], shuffled)
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
        text: '批量操作',
        handler: () => {
          enterBatchMode()
        }
      },
      {
        text: '分享歌单',
        handler: () => {
          shareOpen.value = true
        }
      },
      {
        text: '导出歌单文件',
        handler: () => {
          void exportPlaylistFile()
        }
      },
      {
        text: '复制歌单到剪贴板',
        handler: () => {
          void copyPlaylistToClipboard()
        }
      },
      {
        text: '调整歌曲顺序',
        handler: () => {
          startReorder()
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

function startReorder(): void {
  if (tracks.value.length < 2) {
    void toast('至少需要两首歌曲才能排序')
    return
  }
  exitBatchMode()
  reorderMode.value = true
}

function exitReorder(): void {
  reorderMode.value = false
}

async function onReorder(
  event: CustomEvent<{ from: number; to: number; complete: (data?: Track[]) => void }>
): Promise<void> {
  const { from, to, complete } = event.detail
  const next = [...tracks.value]
  const [moved] = next.splice(from, 1)
  if (!moved) {
    complete()
    return
  }
  next.splice(to, 0, moved)
  tracks.value = next
  complete(next)
  try {
    await library.reorderPlaylist(remoteId, next.map((track) => track.key))
    await toast('歌单顺序已保存')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '排序保存失败', 'danger')
    loadLocal()
  }
}

async function exportPlaylistFile() {
  const playlist = localPlaylist.value
  if (!playlist) return
  try {
    const encrypted = encryptPlaylistTracks(library.playlistTracks(remoteId))
    const fileName = playlistFileName(playlist.name)
    await saveAndShareFile({
      name: fileName,
      data: packPlaylistFile(encrypted),
      mime: 'application/gzip',
      title: 'Ceru Music 歌单'
    })
    await toast('歌单文件已导出')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '导出失败', 'danger')
  }
}

async function copyPlaylistToClipboard() {
  const playlist = localPlaylist.value
  if (!playlist) return
  try {
    const encrypted = encryptPlaylistTracks(library.playlistTracks(remoteId))
    await Clipboard.write({ string: encrypted })
    await toast('歌单已复制到剪贴板')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '复制失败', 'danger')
  }
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
.reorder-hint {
  margin: 14px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.reorder-block {
  margin: 8px 8px 0;
  background: transparent;
}
.reorder-item {
  --background: transparent;
  --padding-start: 8px;
  --inner-padding-end: 8px;
}
.reorder-label {
  min-width: 0;
}
.reorder-title {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.reorder-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
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
.batch-bar-backdrop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--ceru-mini-player-height, 64px) + var(--ion-safe-area-bottom, 16px) + 12px);
  display: flex;
  justify-content: center;
  padding: 0 16px;
  z-index: 99;
  pointer-events: none;
  animation: batchSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes batchSlideUp {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
.batch-bar-container {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--ceru-card-bg, rgba(30, 30, 35, 0.92));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--ceru-border, rgba(255, 255, 255, 0.12));
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  max-width: 440px;
  width: 100%;
  justify-content: space-around;
}
.batch-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 12px;
  transition: opacity 0.15s ease, transform 0.15s ease;
  min-width: 52px;
}
.batch-action-btn ion-icon {
  font-size: 20px;
  color: var(--ceru-brand);
}
.batch-action-btn.danger ion-icon {
  color: var(--ion-color-danger, #eb445a);
}
.batch-action-btn:disabled {
  opacity: 0.38;
  pointer-events: none;
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
