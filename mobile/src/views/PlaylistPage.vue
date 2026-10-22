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
              :color="searchActive ? 'primary' : undefined"
              title="搜索歌曲"
              @click="toggleSearch"
            >
              <ion-icon slot="icon-only" :icon="searchOutline" />
            </ion-button>
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
            <!-- 远程歌单（插件/排行榜）可以整单存成自己的歌单，桌面版同入口 -->
            <ion-button
              v-else
              fill="clear"
              :disabled="!tracks.length || savingToLocal"
              title="保存到本地"
              @click="saveToLocalPlaylist"
            >
              <ion-icon slot="icon-only" :icon="saveOutline" />
            </ion-button>
          </template>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="hero ceru-pad">
        <div class="cover-wrapper" :class="{ clickable: isLocal }" @click="openCoverActions">
          <CoverImage :src="cover" :size="168" :radius="22" :alt="title" class="hero-cover" />
          <div v-if="isLocal" class="cover-badge" title="更换封面">
            <ion-icon :icon="cameraOutline" />
          </div>
        </div>
        <input
          ref="coverFileInput"
          type="file"
          accept="image/*"
          class="file-input"
          @change="onCoverFilePicked"
        />
        <div class="hero-copy">
          <p class="eyebrow">{{ isLocal ? 'PLAYLIST' : 'FROM PLUGIN' }}</p>
          <h1 class="hero-title">{{ title }}</h1>
          <p v-if="description" class="hero-desc">{{ description }}</p>
          <p class="hero-meta">{{ playlistStatsText }}</p>
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
              @click="openSortSheet"
            >
              <ion-icon slot="start" :icon="swapVerticalOutline" />
              {{ sortType === "default" ? "排序" : currentSortLabel }}
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

      <div v-if="searchActive" class="search-wrap ceru-pad">
        <ion-searchbar
          ref="searchBarRef"
          v-model="searchQuery"
          placeholder="搜索歌单内歌曲 / 歌手 / 专辑"
          :debounce="150"
          show-clear-button="always"
          @ionClear="searchQuery = ''"
        />
      </div>

      <div
        v-if="sortType !== 'default' && !reorderMode"
        class="sort-status-bar ceru-pad"
      >
        <div class="sort-status-info">
          <ion-icon :icon="swapVerticalOutline" />
          <span>已按 <strong>{{ currentSortLabel }}</strong> 排序</span>
        </div>
        <div class="sort-status-actions">
          <button type="button" class="sort-text-btn" @click="sortType = 'default'">
            恢复默认
          </button>
          <button
            v-if="isLocal"
            type="button"
            class="sort-persist-btn ceru-press"
            @click="persistCurrentSort"
          >
            保存为歌单顺序
          </button>
        </div>
      </div>

      <div v-if="loading && !tracks.length" class="loading-row">
        <ion-spinner name="crescent" />
        <span>正在加载歌曲…</span>
      </div>
      <p v-if="error" class="error">{{ error }}</p>

      <p v-if="reorderMode" class="reorder-hint ceru-pad">拖动右侧手柄调整歌曲顺序，完成后自动保存。</p>

      <div v-if="tracks.length && !reorderMode" class="list-block">
        <p v-if="searchQuery && !displayTracks.length" class="empty-search-hint ceru-pad">
          未找到包含 “{{ searchQuery }}” 的歌曲
        </p>
        <div
          v-for="track in displayTracks"
          :id="'track-item-' + track.key"
          :key="track.key"
          class="track-list-item"
        >
          <TrackRow
            :track="track"
            :favorite="library.isFavorite(track)"
            :selectable="batchMode"
            :selected="selectedKeys.has(track.key)"
            :active="player.currentTrack?.key === track.key"
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

    <TrackBatchBar
      :open="batchMode"
      :selected-count="selectedCount"
      :destructive-label="isLocal ? '移除' : ''"
      @play="playSelected"
      @play-next="playNextSelected"
      @add-to-playlist="addToPlaylistSelected"
      @download="downloadSelected"
      @destructive="removeSelected"
    />

    <!-- 定位到当前播放歌曲悬浮按钮 -->
    <transition name="locate-btn-fade">
      <button
        v-if="hasCurrentPlayingTrack && !batchMode && !reorderMode"
        type="button"
        class="locate-fab-btn ceru-press"
        title="定位到当前播放歌曲"
        @click="locateCurrentSong"
      >
        <ion-icon :icon="locateOutline" />
      </button>
    </transition>

    <PlaylistItemActionSheet
      :open="playlistActionOpen"
      :track="playlistActionTrack"
      @close="closePlaylistAction"
    />
    <SharePlaylistSheet :open="shareOpen" :playlist-id="remoteId" @close="shareOpen = false" />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import {
  albumsOutline,
  cameraOutline,
  checkmarkDoneOutline,
  searchOutline,
  ellipsisHorizontal,
  saveOutline,
  play as playIcon,
  shuffle,
  swapVerticalOutline,
  locateOutline
} from 'ionicons/icons'
import { useRoute, useRouter } from 'vue-router'
import CoverImage from '@/components/CoverImage.vue'
import TrackRow from '@/components/TrackRow.vue'
import TrackBatchBar from '@/components/TrackBatchBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import PluginSlot from '@/components/PluginSlot.vue'
import PlaylistItemActions from '@/components/PlaylistItemActions.vue'
import PlaylistItemActionSheet from '@/components/PlaylistItemActionSheet.vue'
import SharePlaylistSheet from '@/components/SharePlaylistSheet.vue'
import { useLibraryStore } from '@/stores/library'
import { compressAndCropToSquare } from '@/services/imageUtils'
import { usePluginStore } from '@/stores/plugins'
import { usePlayerStore } from '@/stores/player'
import { useDownloadStore } from '@/stores/downloads'
import { useAuthStore } from '@/stores/auth'
import { openTrackActions, addTracksToPlaylistDialog } from '@/services/trackActions'
import { Clipboard } from '@capacitor/clipboard'
import { encryptPlaylistTracks, packPlaylistFile, playlistFileName } from '@/services/playlistFiles'
import { describePlaylistStats, summarizePlaylist } from '@/services/playlistStats'
import { saveAndShareFile } from '@/services/fileExport'
import { batchQualityChoices } from '@/services/batchDownloadQuality'
import { getQualityDisplayName } from '@/services/qualityNames'
import type { Track } from '@/types/music'
import { TRACK_SORT_OPTIONS, sortTracks, type TrackSortType } from '@/services/trackSorter'
import { useTrackBatchSelection } from '@/services/trackBatch'
import { createRequestGuard } from '@/services/requestGuard'
import { dedupeByKey } from '@/services/listMerge'

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
/** 远程歌单「保存到本地」进行中：拉全部分页可能耗时，避免重复触发。 */
const savingToLocal = ref(false)

const searchQuery = ref('')
const searchActive = ref(false)
const searchBarRef = ref<any>(null)
const sortType = ref<TrackSortType>('default')
const currentSortLabel = computed(() => {
  return TRACK_SORT_OPTIONS.find((opt) => opt.type === sortType.value)?.label || '默认顺序'
})

function toggleSearch() {
  searchActive.value = !searchActive.value
  if (!searchActive.value) {
    searchQuery.value = ''
  }
}

const displayTracks = computed(() => {
  let list = tracks.value
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((track) => {
      const titleMatch = track.title?.toLowerCase().includes(q)
      const subtitleMatch = track.subtitle?.toLowerCase().includes(q)
      const albumMatch = track.album?.toLowerCase().includes(q)
      const artistMatch = track.artists?.some((artist) => artist.toLowerCase().includes(q))
      return titleMatch || subtitleMatch || albumMatch || artistMatch
    })
  }
  return sortTracks(list, sortType.value)
})

const selection = useTrackBatchSelection({
  source: () => displayTracks.value,
  order: () => tracks.value
})
const batchMode = selection.active
const selectedKeys = selection.selectedKeys
const selectedTracks = selection.selectedTracks
const selectedCount = selection.selectedCount
const isAllSelected = selection.allSelected
const toggleSelectTrack = selection.toggleSelect
const toggleSelectAll = selection.toggleSelectAll
const exitBatchMode = selection.exit

function enterBatchMode(): void {
  reorderMode.value = false
  selection.enter()
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

/**
 * 选中歌曲可用的音质（并集，按音源清单顺序低→高），
 * 与桌面版批量下载前的「选择批量下载音质(自动降级)」同口径。
 */
function batchQualityOptions(): string[] {
  return batchQualityChoices(selectedTracks.value, pluginStore.qualityOrderFor(source))
}

/** 弹一次音质选择；用户取消时返回 null，不下载任何东西。 */
async function chooseBatchQuality(options: string[]): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let picked: string | null = null
    void actionSheetController
      .create({
        header: '选择批量下载音质（自动降级）',
        buttons: [
          ...[...options].reverse().map((quality) => ({
            text: getQualityDisplayName(quality),
            handler: () => {
              picked = quality
            }
          })),
          { text: '取消', role: 'cancel' }
        ]
      })
      .then(async (sheet) => {
        await sheet.present()
        await sheet.onDidDismiss()
        resolve(picked)
      })
  })
}

async function downloadSelected() {
  if (!selectedTracks.value.length) return
  const options = batchQualityOptions()
  const quality = options.length ? await chooseBatchQuality(options) : null
  if (options.length && !quality) return
  try {
    const enqueued = await downloads.createBatchDownloads(
      selectedTracks.value,
      quality ?? undefined,
      options
    )
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
/** 远程歌单/榜单的分页请求守卫；本地歌单是同步读取，不参与竞态。 */
const remoteRequests = createRequestGuard()
const error = ref<string | null>(null)

const localPlaylist = computed(() => library.playlists.find((item) => item.id === remoteId))
const title = computed(() =>
  isLocal ? localPlaylist.value?.name || '歌单' : String(route.query.title || '歌单')
)
const description = computed(() =>
  isLocal ? localPlaylist.value?.description || '' : String(route.query.description || '')
)
const cover = computed(() => {
  if (isLocal) {
    return (
      localPlaylist.value?.cover ||
      library.playlistTracks(remoteId).find((item) => item.artworkUrl)?.artworkUrl
    )
  }
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
/** 歌单统计：歌曲数 · 总时长 · 歌手数（对齐桌面版「播放列表统计」）。 */
const playlistStatsText = computed(() => {
  const parts = [describePlaylistStats(summarizePlaylist(tracks.value))]
  if (sourceName.value) parts.push(sourceName.value)
  return parts.join(' · ')
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
  // 远程歌单按「音源 + provider + 目标」归属；换歌单后旧响应必须丢弃。
  const identity = `${source}|${providerId}|${remoteKind}|${String(route.query.remoteId || '')}`
  const token = reset ? remoteRequests.beginLatest(identity) : remoteRequests.capture(identity)
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
    if (!remoteRequests.isCurrent(token, identity)) return
    const provider = pluginStore.selectedProvider(source)
    const items = (page.items || [])
      .filter((item: any) => item?.ref?.kind === 'track')
      .map((item: any) => pluginStore.normalizeEntity(provider?.pluginKey || source, item))
    // 音源分页会在边界重复上一页的最后一首；不去重会导致 :key 重复、渲染错乱。
    tracks.value = dedupeByKey(reset ? items : [...tracks.value, ...items], (track) => track.key)
    nextCursor.value = page.nextCursor
  } catch (cause) {
    if (!remoteRequests.isCurrent(token, identity)) return
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (remoteRequests.isCurrent(token, identity)) loading.value = false
  }
}

async function play(track: Track, customQueue?: Track[]) {
  try {
    await player.playTrack(track, customQueue || displayTracks.value)
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
  const currentList = displayTracks.value.length ? displayTracks.value : tracks.value
  if (!currentList.length) return
  await play(currentList[0], currentList)
}

async function shuffleAll() {
  const currentList = displayTracks.value.length ? displayTracks.value : tracks.value
  if (!currentList.length) return
  // 只随机「从哪首开始」，队列本身按原顺序交给播放器，由 shuffle 模式统一洗牌。
  // 两边都打乱等于双重随机：洗牌顺序与队列顺序互不对应，
  // 手动点队列里任意一首时又会重新洗一次，播放顺序完全不可复现。
  const startIndex = Math.floor(Math.random() * currentList.length)
  player.setMode({ shuffle: true })
  await play(currentList[startIndex], currentList)
}

const hasCurrentPlayingTrack = computed(() => {
  if (!player.currentTrack) return false
  return tracks.value.some((t) => t.key === player.currentTrack?.key)
})

function locateCurrentSong(): void {
  if (!player.currentTrack) return
  const el = document.getElementById('track-item-' + player.currentTrack.key)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else {
    void toast('当前播放歌曲未在当前显示列表中')
  }
}

function openMore(track: Track) {
  const extraButtons: any[] = []
  if (isLocal) {
    extraButtons.push(
      {
        text: '移动到指定位置…',
        handler: () => {
          void promptMoveTrackToPosition(track)
        }
      },
      {
        text: '从本歌单移除',
        role: 'destructive',
        handler: () => {
          void removeTrackFromPlaylist(track)
        }
      }
    )
  }
  void openTrackActions(track, { extraButtons })
}

async function promptMoveTrackToPosition(track: Track) {
  if (!isLocal || !localPlaylist.value) return
  const currentIdx = tracks.value.findIndex((t) => t.key === track.key)
  if (currentIdx < 0) return
  const total = tracks.value.length

  const alert = await alertController.create({
    header: '移动到指定位置',
    subHeader: `当前位置：第 ${currentIdx + 1} 首 / 共 ${total} 首`,
    inputs: [
      {
        name: 'position',
        type: 'number',
        placeholder: `输入目标位置 (1 - ${total})`,
        value: String(currentIdx + 1),
        min: 1,
        max: total
      }
    ],
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '移动',
        role: 'confirm'
      }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role === 'confirm') {
    const targetPos = parseInt(data?.values?.position, 10)
    if (isNaN(targetPos) || targetPos < 1 || targetPos > total) {
      await toast(`请输入有效的序号 (1 ~ ${total})`, 'warning')
      return
    }
    const targetIdx = targetPos - 1
    if (targetIdx === currentIdx) return

    const next = [...tracks.value]
    const [moved] = next.splice(currentIdx, 1)
    next.splice(targetIdx, 0, moved)
    tracks.value = next
    try {
      await library.reorderPlaylist(remoteId, next.map((t) => t.key))
      await toast(`已移动到第 ${targetPos} 首`)
    } catch (err) {
      console.error('移动歌曲失败:', err)
      await toast(err instanceof Error ? err.message : '移动歌曲失败', 'danger')
      loadLocal()
    }
  }
}

async function removeTrackFromPlaylist(track: Track) {
  if (!isLocal || !localPlaylist.value) return
  try {
    await library.removeTrackFromPlaylist(remoteId, track.key)
    tracks.value = tracks.value.filter((t) => t.key !== track.key)
    await toast(`已从歌单移除「${track.title}」`)
  } catch (err) {
    console.error('移除歌曲失败:', err)
    await toast(err instanceof Error ? err.message : '移除歌曲失败', 'danger')
  }
}

async function loadMore(event: any) {
  try {
    await loadRemote(false)
  } finally {
    event.target.complete()
  }
}

/**
 * 把当前本地歌单上传 / 同步到云端（桌面版 `uploadToCloud` / `syncToCloud`）。
 *
 * 必须在操作前确认一次：同步会用本机内容覆盖云端副本，云端若在别的设备上
 * 改过，那些改动会丢。上传只跳过不可分享的本地歌曲，不让人以为整单都传了。
 */
async function syncPlaylistToCloud(): Promise<void> {
  const playlist = localPlaylist.value
  if (!playlist) return
  const shareable = tracks.value.filter((track) => !track.localUri && !track.downloadedPath).length
  if (!shareable) {
    await toast('歌单里没有可上传的在线歌曲', 'warning')
    return
  }
  const updating = Boolean(playlist.cloudId)
  const alert = await alertController.create({
    header: updating ? '同步到云端' : '上传到云端',
    message: updating
      ? `将用本机内容覆盖云端副本（${shareable} 首在线歌曲），其它设备上的改动会被替换。`
      : `将把 ${shareable} 首在线歌曲上传到云端；本地文件与已下载副本不会上传。`,
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: updating ? '同步' : '上传', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  try {
    await library.syncPlaylistToCloud(playlist.id)
    await toast(updating ? '已同步到云端' : '已上传到云端', 'success')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '云端操作失败', 'danger')
  }
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

const coverFileInput = ref<HTMLInputElement | null>(null)

async function openCoverActions() {
  if (!isLocal || !localPlaylist.value) return
  const hasCustomCover = !!localPlaylist.value.cover
  const buttons: any[] = [
    {
      text: '从相册选择新封面',
      handler: () => {
        coverFileInput.value?.click()
      }
    }
  ]
  if (hasCustomCover) {
    buttons.push({
      text: '恢复默认封面（自动使用首曲）',
      role: 'destructive',
      handler: () => {
        void library.updatePlaylist(remoteId, { cover: null }).then(() => {
          void toast('已恢复默认封面')
        })
      }
    })
  }
  buttons.push({ text: '取消', role: 'cancel' })

  const sheet = await actionSheetController.create({
    header: '歌单封面',
    buttons
  })
  await sheet.present()
}

async function onCoverFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!file.type.startsWith('image/')) {
    await toast('请选择有效的图片文件', 'warning')
    return
  }

  try {
    const dataUrl = await compressAndCropToSquare(file, 600, 0.85)
    await library.updatePlaylist(remoteId, { cover: dataUrl })
    await toast('歌单封面已更新')
  } catch (err) {
    console.error('更新歌单封面失败:', err)
    await toast(err instanceof Error ? err.message : '更新封面失败', 'danger')
  }
}

async function openSortSheet() {
  const sheet = await actionSheetController.create({
    header: '歌曲排序',
    subHeader: isLocal && sortType.value !== 'default' ? '已选择排序，可固化为歌单默认顺序' : undefined,
    buttons: [
      ...TRACK_SORT_OPTIONS.map((opt) => ({
        text: opt.label + (sortType.value === opt.type ? ' ✓' : ''),
        role: sortType.value === opt.type ? 'selected' : undefined,
        handler: () => {
          sortType.value = opt.type
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function persistCurrentSort() {
  if (!isLocal || !localPlaylist.value) return
  try {
    const fullSorted = sortTracks(tracks.value, sortType.value)
    tracks.value = fullSorted
    await library.reorderPlaylist(remoteId, fullSorted.map((t) => t.key))
    sortType.value = 'default'
    await toast('已保存为歌单默认顺序')
  } catch (cause) {
    console.error('保存歌单顺序失败:', cause)
    await toast(cause instanceof Error ? cause.message : '保存歌单顺序失败', 'danger')
  }
}

async function editPlaylistInfo() {
  if (!localPlaylist.value) return
  const alert = await alertController.create({
    header: '编辑歌单信息',
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: '歌单名称',
        value: localPlaylist.value.name
      },
      {
        name: 'description',
        type: 'textarea',
        placeholder: '歌单简介（选填）',
        value: localPlaylist.value.description || ''
      }
    ],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role === 'confirm') {
    const name = String(data?.values?.name || '').trim()
    const description = String(data?.values?.description || '').trim()
    if (!name) {
      await toast('歌单名称不能为空', 'warning')
      return
    }
    await library.updatePlaylist(remoteId, { name, description })
    await toast('歌单信息已更新')
  }
}

async function openPlaylistMenu() {
  if (!isLocal || !localPlaylist.value) return
  const sheet = await actionSheetController.create({
    header: localPlaylist.value.name,
    buttons: [
      {
        text: '编辑歌单信息',
        handler: () => {
          void editPlaylistInfo()
        }
      },
      {
        text: `排序方式（当前: ${currentSortLabel.value}）`,
        handler: () => {
          void openSortSheet()
        }
      },
      {
        text: '更换歌单封面',
        handler: () => {
          void openCoverActions()
        }
      },
      {
        // 桌面版「上传到云端 / 同步到云端」：本地歌单此前只有分享时才会隐式上传，
        // 用户没法主动备份或更新云端副本。
        text: localPlaylist.value.cloudId ? '同步到云端' : '上传到云端',
        handler: () => {
          void syncPlaylistToCloud()
        }
      },
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
  if (sortType.value !== 'default') {
    sortType.value = 'default'
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

/**
 * 把远程歌单整单保存成本地歌单（桌面版 list.vue「保存到本地」）。
 *
 * 关键点：
 * - 分页还没拉完时先补拉，否则「保存」只会存下当前可见的一页，
 *   用户以为存了整单、实际少了后面几十首；补拉有页数上限，避免异常分页空转。
 * - 同名歌单已存在时不覆盖也不静默重名，直接提示，避免出现两个一模一样的名字。
 * - 先建歌单再批量加歌，封面用远程歌单封面，避免列表里是一张空白卡。
 */
async function saveToLocalPlaylist(): Promise<void> {
  if (isLocal || savingToLocal.value || !tracks.value.length) return
  const name = title.value.trim() || '歌单'
  if (library.playlists.some((item) => item.name === name)) {
    await toast('已存在同名的本地歌单', 'warning')
    return
  }
  const alert = await alertController.create({
    header: '保存到本地',
    message: `确定将歌单「${name}」保存为本地歌单吗？`,
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  savingToLocal.value = true
  try {
    let guard = 0
    while (nextCursor.value && guard++ < 50) await loadRemote(false)
    const playlist = library.createPlaylist(name, description.value)
    const added = await library.addTracksToPlaylist(playlist.id, tracks.value)
    if (cover.value) await library.updatePlaylist(playlist.id, { cover: cover.value })
    await toast(`已保存 ${added} 首到本地歌单「${name}」`, 'success')
    router.replace(`/playlist/${playlist.id}`)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '保存失败', 'danger')
  } finally {
    savingToLocal.value = false
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

onBeforeUnmount(() => {
  remoteRequests.dispose()
})
</script>

<style scoped>
.hero {
  display: flex;
  gap: 18px;
  align-items: flex-end;
  padding-top: 18px;
}
.cover-wrapper {
  position: relative;
  flex: 0 0 auto;
}
.cover-wrapper.clickable {
  cursor: pointer;
}
.cover-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.hero-cover {
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  display: block;
}
.file-input {
  display: none;
}
.search-wrap {
  margin-top: 10px;
  margin-bottom: 4px;
}
.sort-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  margin-bottom: 2px;
  padding: 8px 14px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.05));
  border-radius: 12px;
  border: 1px solid var(--ceru-border, rgba(255, 255, 255, 0.08));
  font-size: 13px;
}
.sort-status-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.sort-status-info ion-icon {
  font-size: 16px;
  color: var(--ceru-brand);
}
.sort-status-info strong {
  color: var(--ceru-text);
}
.sort-status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sort-text-btn {
  background: transparent;
  border: 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  padding: 4px 6px;
  cursor: pointer;
}
.sort-persist-btn {
  background: var(--ceru-brand);
  color: #fff;
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
}
.empty-search-hint {
  text-align: center;
  color: var(--ion-color-step-500, #888);
  font-size: 14px;
  padding: 32px 16px;
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
.locate-fab-btn {
  position: fixed;
  right: 18px;
  bottom: calc(var(--ceru-mini-player-height, 64px) + var(--ion-safe-area-bottom, 16px) + 20px);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--ceru-card-bg, rgba(30, 30, 35, 0.9));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--ceru-border, rgba(255, 255, 255, 0.15));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  color: var(--ceru-brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  z-index: 90;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.locate-fab-btn:active {
  transform: scale(0.92);
}
.locate-btn-fade-enter-active,
.locate-btn-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.locate-btn-fade-enter-from,
.locate-btn-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
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
