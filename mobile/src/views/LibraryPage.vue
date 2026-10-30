<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button v-if="batchMode" fill="clear" @click="exitBatchMode">取消</ion-button>
        </ion-buttons>
        <ion-title>{{ batchMode ? `已选择 ${selectedCount} 首` : '音乐库' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="batchMode" fill="clear" @click="toggleSelectAll">
            {{ isAllSelected ? '取消全选' : '全选' }}
          </ion-button>
          <template v-else>
            <ion-button
              v-if="activeTracks.length"
              fill="clear"
              title="批量选择"
              @click="enterBatchMode"
            >
              <ion-icon slot="icon-only" :icon="checkmarkDoneOutline" />
            </ion-button>
            <ion-button fill="clear" @click="openCreatePlaylist">
              <ion-icon slot="icon-only" :icon="addOutline" />
            </ion-button>
          </template>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <input
        ref="localInput"
        class="file-input"
        type="file"
        accept="audio/*"
        multiple
        @change="onLocalFiles"
      />
      <input
        ref="playlistFileInput"
        class="file-input"
        type="file"
        accept=".cpl,.cmpl"
        @change="onPlaylistFile"
      />
      <input
        ref="coverInput"
        class="file-input"
        type="file"
        accept="image/*"
        @change="onCoverFile"
      />
      <div class="library-head ceru-pad">
        <p class="eyebrow">YOUR LIBRARY</p>
        <h1 class="ceru-title">收藏与本地</h1>
        <div class="quick-row">
          <button class="quick-card ceru-card ceru-press" type="button" @click="activeSegment = 'local'; pickLocal()">
            <ion-icon :icon="folderOpenOutline" />
            <span>导入本地音乐</span>
          </button>
          <button v-if="showPlaylistImport" class="quick-card ceru-card ceru-press" type="button" @click="importOpen = true">
            <ion-icon :icon="cloudDownloadOutline" />
            <span>导入歌单链接</span>
          </button>
          <button class="quick-card ceru-card ceru-press" type="button" @click="sharedImportOpen = true">
            <ion-icon :icon="linkOutline" />
            <span>导入分享歌单</span>
          </button>
          <button class="quick-card ceru-card ceru-press" type="button" @click="pickPlaylistFile">
            <ion-icon :icon="documentOutline" />
            <span>导入歌单文件</span>
          </button>
          <button class="quick-card ceru-card ceru-press" type="button" @click="importPlaylistFromClipboard">
            <ion-icon :icon="clipboardOutline" />
            <span>从剪贴板导入</span>
          </button>
          <!-- 桌面版「选择导入方式」里的「从播放列表」：把当前队列原样存成一张歌单 -->
          <button
            v-if="player.queue.length"
            class="quick-card ceru-card ceru-press"
            type="button"
            @click="saveQueueAsPlaylist"
          >
            <ion-icon :icon="listOutline" />
            <span>从播放列表</span>
          </button>
          <button class="quick-card ceru-card ceru-press" type="button" @click="$router.push('/downloads')">
            <ion-icon :icon="cloudDownloadOutline" />
            <span>下载管理</span>
          </button>
        </div>
      </div>

      <ion-segment v-model="activeSegment" class="library-segment" scrollable>
        <ion-segment-button value="favorites"><ion-label>收藏</ion-label></ion-segment-button>
        <ion-segment-button value="playlists"><ion-label>歌单</ion-label></ion-segment-button>
        <ion-segment-button value="local"><ion-label>本地</ion-label></ion-segment-button>
        <ion-segment-button value="recent"><ion-label>最近</ion-label></ion-segment-button>
      </ion-segment>

      <div v-if="activeSegment === 'favorites'" class="section">
        <div v-if="library.favorites.length > 5" class="filter-wrap ceru-pad">
          <ion-searchbar
            v-model="trackFilter"
            placeholder="搜索收藏歌曲 / 歌手 / 专辑"
            :debounce="150"
            show-clear-button="always"
            @ionClear="trackFilter = ''"
          />
        </div>
        <div v-if="library.favorites.length" class="section-actions ceru-pad">
          <ion-button size="small" :disabled="batchMode" @click="playFavoriteAll(false)">
            <ion-icon slot="start" :icon="playIcon" />
            播放全部 ({{ filteredFavorites.length }})
          </ion-button>
          <ion-button size="small" fill="outline" :disabled="batchMode" @click="playFavoriteAll(true)">
            <ion-icon slot="start" :icon="shuffle" />
            随机
          </ion-button>
          <ion-button size="small" fill="outline" :disabled="batchMode" @click="openFavoriteSortSheet">
            <ion-icon slot="start" :icon="swapVerticalOutline" />
            {{ favoriteSortLabel }}
          </ion-button>
        </div>
        <div v-if="library.favorites.length" class="list-block">
          <TrackRow
            v-for="entry in favoriteWindow.visible.value"
            :key="entry.key"
            :track="entry.track"
            favorite
            :selectable="batchMode"
            :selected="selection.isSelected(entry.track)"
            :active="player.currentTrack?.key === entry.track.key"
            @play="play"
            @more="openMore"
            @toggleSelect="selection.toggleSelect"
          />
          <p v-if="trackFilter && !filteredFavorites.length" class="empty-search-hint ceru-pad">
            未找到包含 “{{ trackFilter }}” 的收藏歌曲
          </p>
        </div>
        <EmptyState
          v-else
          title="还没有收藏"
          description="在播放器或歌曲菜单中点击收藏，喜欢的音乐会出现在这里。"
          :icon="heartOutline"
        />
      </div>

      <div v-else-if="activeSegment === 'playlists'" class="section">
        <div
          v-if="library.playlists.length + cloudOnlyPlaylists.length > 5"
          class="filter-wrap ceru-pad"
        >
          <ion-searchbar
            v-model="playlistFilter"
            placeholder="搜索歌单名称或描述"
            :debounce="150"
            :animated="false"
            :show-clear-button="'always'"
          />
        </div>
        <div v-if="visiblePlaylists.length" class="playlist-grid ceru-pad">
          <div
            v-for="playlist in visiblePlaylists"
            :key="playlist.id"
            class="playlist-card ceru-press"
            role="button"
            tabindex="0"
            @click="$router.push(`/playlist/${playlist.id}`)"
            @keyup.enter="$router.push(`/playlist/${playlist.id}`)"
            @contextmenu.prevent="openPlaylistActions(playlist)"
          >
            <div class="playlist-art">
              <CoverImage
                :src="playlistCover(playlist.id)"
                :size="150"
                :radius="18"
                :alt="playlist.name"
              />
              <span class="track-count">{{ playlist.trackKeys.length }} 首</span>
            </div>
            <div class="playlist-name-row">
              <span class="playlist-name ceru-truncate">{{ playlist.name }}</span>
              <!-- 已关联云端副本时给出徽标：同名歌单在列表里否则分不清哪张会同步 -->
              <span v-if="playlistSyncState(playlist)" class="playlist-sync-tag">
                {{ playlistSyncLabel(playlistSyncState(playlist)) }}
              </span>
            </div>
            <div class="playlist-desc ceru-truncate">
              {{ playlistDescriptionText(playlist.description) }}
            </div>
            <div v-if="playlistTimeLine(playlist)" class="playlist-time">
              {{ playlistTimeLine(playlist) }}
            </div>
            <button class="playlist-more" type="button" aria-label="歌单更多操作" @click.stop="openPlaylistActions(playlist)">
              <ion-icon :icon="ellipsisHorizontal" />
            </button>
          </div>
          <button class="playlist-card create-card" type="button" @click="openCreatePlaylist">
            <div class="create-art">
              <ion-icon :icon="addOutline" />
            </div>
            <div class="playlist-name">新建歌单</div>
          </button>
        </div>
        <!-- 只存在于云端的歌单：换设备登录后本机没有副本，但仍应看得见 -->
        <template v-if="visibleCloudPlaylists.length || cloudListLoading || cloudListError">
          <div class="cloud-head ceru-pad">
            <span class="cloud-head-title">
              <ion-icon :icon="cloudOutline" />
              云端歌单
            </span>
            <span v-if="cloudListLoading" class="cloud-head-hint">读取中…</span>
            <span v-else-if="cloudListError" class="cloud-head-hint error">
              {{ cloudListError }}
            </span>
            <span v-else class="cloud-head-hint">尚未保存到本机</span>
          </div>
          <div v-if="visibleCloudPlaylists.length" class="playlist-grid ceru-pad">
            <div
              v-for="playlist in visibleCloudPlaylists"
              :key="cloudPlaylistKey(playlist.id)"
              class="playlist-card cloud-card ceru-press"
              role="button"
              tabindex="0"
              @click="openCloudPlaylist(playlist)"
              @keyup.enter="openCloudPlaylist(playlist)"
            >
              <div class="playlist-art">
                <CoverImage
                  :src="playlist.cover || undefined"
                  :size="150"
                  :radius="18"
                  :alt="playlist.name"
                />
                <span class="track-count cloud-tag">云端</span>
              </div>
              <div class="playlist-name ceru-truncate">{{ playlist.name }}</div>
              <button
                class="playlist-more"
                type="button"
                aria-label="保存到本地"
                @click.stop="saveCloudPlaylist(playlist)"
              >
                <ion-icon :icon="cloudDownloadOutline" />
              </button>
            </div>
          </div>
        </template>

        <p
          v-if="playlistFilter && !visiblePlaylists.length && !visibleCloudPlaylists.length"
          class="empty-search-hint ceru-pad"
        >
          未找到名称或描述包含 “{{ playlistFilter }}” 的歌单
        </p>
        <EmptyState
          v-else-if="!library.playlists.length && !visibleCloudPlaylists.length"
          title="还没有歌单"
          description="创建歌单，把不同来源的歌曲整理到一起。"
          :icon="albumsOutline"
        >
          <ion-button fill="outline" @click="openCreatePlaylist">新建歌单</ion-button>
        </EmptyState>
      </div>

      <div v-else-if="activeSegment === 'local'" class="section">
        <div class="local-tools ceru-pad">
          <ion-button fill="outline" size="small" :disabled="library.importingLocal" @click="scanLocal">
            <ion-icon slot="start" :icon="folderOpenOutline" />
            扫描 Documents 目录
          </ion-button>
          <span>也可以把音频放入“文件”App 的本应用目录</span>
        </div>
        <div v-if="library.localRecords.length > 5" class="filter-wrap ceru-pad">
          <ion-searchbar
            v-model="trackFilter"
            placeholder="搜索本地歌曲 / 歌手 / 专辑"
            :debounce="150"
            show-clear-button="always"
            @ionClear="trackFilter = ''"
          />
        </div>
        <div v-if="library.localRecords.length" class="section-actions ceru-pad">
          <ion-button size="small" :disabled="batchMode" @click="playLocalAll(false)">
            <ion-icon slot="start" :icon="playIcon" />
            播放全部 ({{ filteredLocalTracks.length }})
          </ion-button>
          <ion-button size="small" fill="outline" :disabled="batchMode" @click="playLocalAll(true)">
            <ion-icon slot="start" :icon="shuffle" />
            随机
          </ion-button>
          <ion-button size="small" fill="outline" :disabled="batchMode" @click="openLocalSortSheet">
            <ion-icon slot="start" :icon="swapVerticalOutline" />
            {{ localSortLabel }}
          </ion-button>
          <ion-button
            size="small"
            fill="outline"
            :disabled="batchMode || batchMatching"
            @click="matchLocalBatch"
          >
            <ion-icon slot="start" :icon="sparklesOutline" />
            {{ batchMatching ? '匹配中…' : '批量匹配' }}
          </ion-button>
        </div>
        <div v-if="library.localRecords.length" class="list-block">
          <TrackRow
            v-for="track in localWindow.visible.value"
            :key="track.key"
            :track="track"
            :selectable="batchMode"
            :selected="selection.isSelected(track)"
            :active="player.currentTrack?.key === track.key"
            @play="play"
            @more="openLocalActions(track)"
            @toggleSelect="selection.toggleSelect"
          />
          <p v-if="trackFilter && !filteredLocalTracks.length" class="empty-search-hint ceru-pad">
            未找到包含 “{{ trackFilter }}” 的本地歌曲
          </p>
        </div>
        <EmptyState
          v-else
          title="导入本地音乐"
          description="从“文件”或系统文件选择器导入音频。文件会复制到应用私有目录，之后离线可用。"
          :icon="folderOpenOutline"
        >
          <ion-button @click="pickLocal">
            <ion-icon slot="start" :icon="folderOpenOutline" />
            选择音频文件
          </ion-button>
        </EmptyState>
        <p v-if="library.importingLocal" class="importing">
          <ion-spinner name="crescent" /> 正在导入并读取标签…
        </p>
      </div>

      <div v-else class="section">
        <div v-if="library.recentTracks.length" class="section-actions ceru-pad">
          <ion-button size="small" :disabled="batchMode" @click="playRecentAll(false)">
            <ion-icon slot="start" :icon="playIcon" />
            播放全部 ({{ library.recentTracks.length }})
          </ion-button>
          <ion-button size="small" fill="outline" :disabled="batchMode" @click="playRecentAll(true)">
            <ion-icon slot="start" :icon="shuffle" />
            随机
          </ion-button>
          <button class="clear-history-btn" type="button" :disabled="batchMode" @click="confirmClearHistory">
            清空记录
          </button>
        </div>
        <div v-if="library.recentTracks.length" class="list-block">
          <TrackRow
            v-for="track in library.recentTracks"
            :key="track.key"
            :track="track"
            :favorite="library.isFavorite(track)"
            :selectable="batchMode"
            :selected="selection.isSelected(track)"
            :active="player.currentTrack?.key === track.key"
            @play="play"
            @more="openRecentActions(track)"
            @toggleSelect="selection.toggleSelect"
          />
        </div>
        <EmptyState
          v-else
          title="还没有播放记录"
          description="播放过的歌曲会出现在这里，方便快速继续。"
          :icon="timeOutline"
        />
      </div>

      <!--
        长列表的「继续展开」哨兵：按当前分段判断是否还有未渲染的批次。
        与歌单页同一套渐进渲染，避免上千条时一次性挂载全部 TrackRow。
      -->
      <ion-infinite-scroll
        v-if="activeSegment === 'favorites' && favoriteWindow.hasMore.value"
        @ionInfinite="favoriteWindow.more"
      >
        <ion-infinite-scroll-content loading-spinner="crescent" loading-text="继续展开…" />
      </ion-infinite-scroll>
      <ion-infinite-scroll
        v-else-if="activeSegment === 'local' && localWindow.hasMore.value"
        @ionInfinite="localWindow.more"
      >
        <ion-infinite-scroll-content loading-spinner="crescent" loading-text="继续展开…" />
      </ion-infinite-scroll>

      <div class="bottom-space" />
    </ion-content>

    <TrackBatchBar
      :open="batchMode"
      :selected-count="selectedCount"
      :destructive-label="batchDestructiveLabel"
      :destructive-icon="batchDestructiveIcon"
      @play="playSelected"
      @play-next="playNextSelected"
      @add-to-playlist="addToPlaylistSelected"
      @download="downloadSelected"
      @destructive="removeSelected"
    />

    <PlaylistImportSheet :open="importOpen" @close="importOpen = false" />
    <!-- 歌单列表里的「分享歌单」：与歌单页共用同一个分享面板 -->
    <SharePlaylistSheet
      :open="sharePlaylistOpen"
      :playlist-id="sharePlaylistId"
      @close="sharePlaylistOpen = false"
    />
    <LocalTagEditorSheet
      :open="tagEditorOpen"
      :track="tagEditorTrack"
      @close="tagEditorOpen = false"
      @saved="onTagsSaved"
    />
    <SharedPlaylistImportSheet :open="sharedImportOpen" @close="sharedImportOpen = false" />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import {
  addOutline,
  albumsOutline,
  checkmarkDoneOutline,
  clipboardOutline,
  cloudDownloadOutline,
  cloudOutline,
  documentOutline,
  ellipsisHorizontal,
  folderOpenOutline,
  heartDislikeOutline,
  heartOutline,
  linkOutline,
  listOutline,
  play as playIcon,
  sparklesOutline,
  trashOutline,
  shuffle,
  swapVerticalOutline,
  timeOutline
} from 'ionicons/icons'
import TrackRow from '@/components/TrackRow.vue'
import TrackBatchBar from '@/components/TrackBatchBar.vue'
import CoverImage from '@/components/CoverImage.vue'
import EmptyState from '@/components/EmptyState.vue'
import LocalTagEditorSheet from '@/components/LocalTagEditorSheet.vue'
import type { Track } from '@/types/music'
import { TRACK_SORT_OPTIONS, sortTracks, type TrackSortType } from '@/services/trackSorter'
import { useRenderWindow } from '@/composables/useRenderWindow'
import type { Playlist } from '@/types/music'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { useDownloadStore } from '@/stores/downloads'
import { usePluginStore } from '@/stores/plugins'
import { useAuthStore } from '@/stores/auth'
import type { CloudPlaylistView } from '@/services/cloudPlaylists'
import { lyricValueToLrc } from '@/services/lyrics'
import { batchQualityChoices } from '@/services/batchDownloadQuality'
import { getQualityDisplayName } from '@/services/qualityNames'
import PlaylistImportSheet from '@/components/PlaylistImportSheet.vue'
import SharedPlaylistImportSheet from '@/components/SharedPlaylistImportSheet.vue'
import SharePlaylistSheet from '@/components/SharePlaylistSheet.vue'
import { collectPlaylistImporters } from '@/services/playlistImporters'
import { parsePlaylistFile, playlistFileTracks } from '@/services/playlistFiles'
import { clipboardPlaylistName, parsePlaylistClipboard } from '@/services/playlistClipboard'
import { buildQueuePlaylistDraft } from '@/services/queuePlaylistDraft'
import { cloudPlaylistKey } from '@/services/cloudPlaylists'
import {
  playlistDescriptionText,
  playlistSyncLabel,
  playlistSyncState,
  playlistTimeLine
} from '@/services/playlistCardMeta'
import { Clipboard } from '@capacitor/clipboard'
import { openTrackActions, addTracksToPlaylistDialog } from '@/services/trackActions'
import { useTrackBatchSelection } from '@/services/trackBatch'
import {
  hasUnknownArtist,
  hasUnknownTitle,
  needsMetadataMatch,
  runLocalMetadataMatch
} from '@/services/localMetadataMatch'
import { createPluginProgress, updatePluginProgress, closePluginProgress } from '@/services/pluginProgress'

const library = useLibraryStore()
const player = usePlayerStore()
const downloads = useDownloadStore()
const pluginStore = usePluginStore()
const authStore = useAuthStore()
const activeSegment = ref<'favorites' | 'playlists' | 'local' | 'recent'>('favorites')

/**
 * 只存在于云端的歌单。
 *
 * 移动端此前只渲染 IndexedDB 里的本地歌单：换设备登录后，云端那些没落到本机的
 * 歌单在手机上完全看不见（桌面版会把它们一起列出来）。这里单独存一份，与本地
 * 歌单并列展示，并可「保存到本地」。
 */
const cloudOnlyPlaylists = ref<CloudPlaylistView[]>([])
const cloudListLoading = ref(false)
const cloudListError = ref('')

async function loadCloudPlaylists(): Promise<void> {
  if (!authStore.authenticated) {
    cloudOnlyPlaylists.value = []
    return
  }
  cloudListLoading.value = true
  cloudListError.value = ''
  try {
    cloudOnlyPlaylists.value = await library.refreshCloudPlaylists()
  } catch (cause) {
    // 云端拉取失败不该让整个歌单页打不开：本地歌单照常显示，只提示云端部分不可用。
    cloudOnlyPlaylists.value = []
    cloudListError.value = cause instanceof Error ? cause.message : '无法读取云端歌单'
  } finally {
    cloudListLoading.value = false
  }
}

watch(
  () => authStore.authenticated,
  (authenticated) => {
    if (authenticated) void loadCloudPlaylists()
    else cloudOnlyPlaylists.value = []
  },
  { immediate: true }
)

const trackFilter = ref('')
/** 歌单列表的搜索词：歌单攒多了以后，网格与「新建歌单」混在一起很难找。 */
const playlistFilter = ref('')
const batchMatching = ref(false)
const favoriteSortType = ref<TrackSortType>('default')
const localSortType = ref<TrackSortType>('default')

const favoriteSortLabel = computed(() => {
  const opt = TRACK_SORT_OPTIONS.find((o) => o.type === favoriteSortType.value)
  return opt?.type === 'default' ? '排序' : opt?.label || '排序'
})

const localSortLabel = computed(() => {
  const opt = TRACK_SORT_OPTIONS.find((o) => o.type === localSortType.value)
  return opt?.type === 'default' ? '排序' : opt?.label || '排序'
})

/** 歌单搜索：名称与描述，忽略大小写与首尾空白。 */
const visiblePlaylists = computed(() => {
  const q = playlistFilter.value.trim().toLowerCase()
  if (!q) return library.playlists
  return library.playlists.filter(
    (playlist) =>
      playlist.name.toLowerCase().includes(q) ||
      String(playlist.description || '').toLowerCase().includes(q)
  )
})

/** 云端歌单也按同一个搜索词过滤，否则搜索时它们会「凭空消失」。 */
const visibleCloudPlaylists = computed(() => {
  const q = playlistFilter.value.trim().toLowerCase()
  if (!q) return cloudOnlyPlaylists.value
  return cloudOnlyPlaylists.value.filter(
    (playlist) =>
      playlist.name.toLowerCase().includes(q) || playlist.description.toLowerCase().includes(q)
  )
})

async function openCloudPlaylist(playlist: CloudPlaylistView): Promise<void> {
  await router.push('/playlist/' + encodeURIComponent(cloudPlaylistKey(playlist.id)))
}

/**
 * 把只读的云端歌单存成本地歌单。
 *
 * 存之前先确认：拉取曲目要等网络，且同名歌单不会自动合并——
 * 用户可能只是想看看云端内容，不该在点开时默默建一份副本。
 */
async function saveCloudPlaylist(playlist: CloudPlaylistView): Promise<void> {
  const alert = await alertController.create({
    header: '保存到本地',
    message:
      `将把云端歌单「${playlist.name}」的歌曲保存为本机歌单，之后可以编辑、同步与分享。`,
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  try {
    const created = await library.saveCloudPlaylistLocally(
      playlist.id,
      { name: playlist.name, description: playlist.description, cover: playlist.cover },
      pluginStore.providers
    )
    await loadCloudPlaylists()
    await showToast('已保存 ' + created.trackKeys.length + ' 首歌曲', 'success')
    await router.push('/playlist/' + created.id)
  } catch (cause) {
    await showToast(cause instanceof Error ? cause.message : '保存失败', 'danger')
  }
}

const filteredFavorites = computed(() => {
  const q = trackFilter.value.trim().toLowerCase()
  let list = library.favorites
  if (q) {
    list = list.filter((entry) => {
      const t = entry.track
      return (
        t.title?.toLowerCase().includes(q) ||
        t.subtitle?.toLowerCase().includes(q) ||
        t.album?.toLowerCase().includes(q) ||
        t.artists?.some((a) => a.toLowerCase().includes(q))
      )
    })
  }
  if (favoriteSortType.value === 'default') {
    return list
  }
  const sortedTracks = sortTracks(
    list.map((e) => e.track),
    favoriteSortType.value
  )
  const entryMap = new Map(list.map((e) => [e.track.key, e]))
  return sortedTracks.map((t) => entryMap.get(t.key)!).filter(Boolean)
})

const filteredLocalTracks = computed(() => {
  const q = trackFilter.value.trim().toLowerCase()
  let list = library.localTracks
  if (q) {
    list = list.filter((t) => {
      return (
        t.title?.toLowerCase().includes(q) ||
        t.subtitle?.toLowerCase().includes(q) ||
        t.album?.toLowerCase().includes(q) ||
        t.artists?.some((a) => a.toLowerCase().includes(q))
      )
    })
  }
  return sortTracks(list, localSortType.value)
})

/**
 * 收藏与本地音乐同样可能是上千条的长列表：只渲染当前批次，滚到底再放一批。
 * 「全选 / 播放全部 / 队列上下文」仍走完整的 filtered 列表，渲染裁剪不影响操作范围。
 */
const favoriteWindow = useRenderWindow(() => filteredFavorites.value)
const localWindow = useRenderWindow(() => filteredLocalTracks.value)

/** Tracks visible in the current library segment, used for select-all and context. */
const activeTracks = computed<Track[]>(() => {
  if (activeSegment.value === 'favorites') return filteredFavorites.value.map((e) => e.track)
  if (activeSegment.value === 'local') return filteredLocalTracks.value
  if (activeSegment.value === 'recent') return library.recentTracks
  return []
})

const selection = useTrackBatchSelection({ source: () => activeTracks.value })
const batchMode = selection.active
const selectedCount = selection.selectedCount
const isAllSelected = selection.allSelected

const batchDestructiveLabel = computed(() => {
  if (activeSegment.value === 'favorites') return '取消收藏'
  if (activeSegment.value === 'local') return '删除'
  if (activeSegment.value === 'recent') return '移除'
  return ''
})
const batchDestructiveIcon = computed(() =>
  activeSegment.value === 'favorites' ? heartDislikeOutline : trashOutline
)

watch(activeSegment, () => {
  if (batchMode.value) exitBatchMode()
})

watch(trackFilter, () => {
  if (batchMode.value) exitBatchMode()
})

function enterBatchMode(): void {
  selection.enter()
}

function exitBatchMode(): void {
  selection.exit()
}

function toggleSelectAll(): void {
  selection.toggleSelectAll()
}

async function playSelected(): Promise<void> {
  const tracks = selection.selectedTracks.value
  if (!tracks.length) return
  await playTrackList(tracks)
  exitBatchMode()
}

function playNextSelected(): void {
  const tracks = selection.selectedTracks.value
  if (!tracks.length) return
  player.insertTracksNext(tracks)
  void showToast(`已将 ${tracks.length} 首歌曲加入下一首播放`)
  exitBatchMode()
}

async function addToPlaylistSelected(): Promise<void> {
  const tracks = selection.selectedTracks.value
  if (!tracks.length) return
  await addTracksToPlaylistDialog(tracks)
  exitBatchMode()
}

/**
 * 批量下载前选一次音质（桌面版「选择批量下载音质(自动降级)」）。
 * 所选歌曲的在线曲目可能来自多个音源，因此音质并集要跨音源收集，
 * 每首歌的实际档位再由 store 逐首降级。
 */
async function downloadSelected(): Promise<void> {
  const tracks = selection.selectedTracks.value
  if (!tracks.length) return
  const order = [
    ...new Set(
      tracks
        .map((track) => track.ref?.providerId ?? pluginStore.sources[0]?.id ?? '')
        .filter(Boolean)
        .flatMap((source) => pluginStore.qualityOrderFor(source))
    )
  ]
  const options = batchQualityChoices(
    tracks.filter((track) => !track.localUri),
    order
  )
  const quality = options.length ? await chooseBatchQuality(options) : null
  if (options.length && !quality) return
  try {
    const enqueued = await downloads.createBatchDownloads(tracks, quality ?? undefined, order)
    await showToast(
      enqueued > 0 ? `已添加 ${enqueued} 首歌曲到下载队列` : '所选歌曲已在下载或已是本地歌曲'
    )
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '批量下载失败', 'danger')
  }
  exitBatchMode()
}

/** 音质选择面板：从高到低列出（用户通常想要尽可能好的），取消则不下载。 */
async function chooseBatchQuality(options: string[]): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let picked: string | null = null
    void actionSheetController
      .create({
        header: '选择批量下载音质（自动降级）',
        buttons: [
          ...[...options].reverse().map((value) => ({
            text: getQualityDisplayName(value),
            handler: () => {
              picked = value
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

async function removeSelected(): Promise<void> {
  const tracks = selection.selectedTracks.value
  const segment = activeSegment.value
  if (!tracks.length || segment === 'playlists') return
  const labels: Record<string, { header: string; message: string; confirm: string }> = {
    favorites: {
      header: '取消收藏',
      message: `确定要取消收藏选中的 ${tracks.length} 首歌曲吗？`,
      confirm: '取消收藏'
    },
    local: {
      header: '删除本地文件',
      message: `将从设备删除选中的 ${tracks.length} 个音频文件，此操作不可恢复。`,
      confirm: '删除'
    },
    recent: {
      header: '移除播放记录',
      message: `确定要从播放记录中移除选中的 ${tracks.length} 首歌曲吗？`,
      confirm: '移除'
    }
  }
  const label = labels[segment]
  if (!label) return
  const alert = await alertController.create({
    header: label.header,
    message: label.message,
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: label.confirm,
        role: 'destructive',
        handler: () => {
          void applyBatchRemoval(tracks, segment)
        }
      }
    ]
  })
  await alert.present()
}

/**
 * 单曲删除确认。
 *
 * 批量删除早就有二次确认，单曲删除却在菜单里点一下就真的删文件——
 * 手机上「点错一行」太常见，而本地文件删了没法恢复。
 */
async function confirmDeleteLocal(track: Track): Promise<void> {
  const alert = await alertController.create({
    header: '删除本地文件',
    message: `将从设备删除「${track.title}」，此操作不可恢复。`,
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '删除',
        role: 'destructive',
        handler: () => {
          void library
            .deleteLocalTrack(track.key)
            .then(() => showToast('已删除本地文件', 'success'))
            .catch((error) =>
              showToast(error instanceof Error ? error.message : '删除失败', 'danger')
            )
        }
      }
    ]
  })
  await alert.present()
}

async function applyBatchRemoval(
  tracks: Track[],
  segment: 'favorites' | 'local' | 'recent'
): Promise<void> {
  try {
    if (segment === 'favorites') {
      for (const track of tracks) await library.removeFavorite(track)
      await showToast(`已取消收藏 ${tracks.length} 首歌曲`)
    } else if (segment === 'local') {
      for (const track of tracks) await library.deleteLocalTrack(track.key)
      await showToast(`已删除 ${tracks.length} 个本地文件`)
    } else {
      for (const track of tracks) await library.removeFromHistory(track.key)
      await showToast(`已从播放记录移除 ${tracks.length} 首歌曲`)
    }
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '操作失败', 'danger')
  } finally {
    exitBatchMode()
  }
}

const localInput = ref<HTMLInputElement | null>(null)
const playlistFileInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)
let coverTarget: Track | null = null
const importOpen = ref(false)
/** 从歌单列表直接分享：面板需要歌单 id，先存下来再打开。 */
const sharePlaylistOpen = ref(false)
const sharePlaylistId = ref('')
const router = useRouter()
const sharedImportOpen = ref(false)
/** 整页标签编辑器：本地歌曲的封面、信息与歌词都在这里改。 */
const tagEditorOpen = ref(false)
const tagEditorTrack = ref<Track | null>(null)
const showPlaylistImport = computed(() =>
  collectPlaylistImporters(pluginStore.enabledPlugins, {
    runtimeInfo: pluginStore.runtimeInfo
  }).length > 0
)

function playlistCover(id: string): string | undefined {
  return library.getPlaylistCover(id)
}

async function play(track: Track) {
  try {
    let contextQueue: Track[] | undefined
    if (activeSegment.value === 'favorites') {
      contextQueue = filteredFavorites.value.map((e) => e.track)
    } else if (activeSegment.value === 'local') {
      contextQueue = filteredLocalTracks.value
    } else if (activeSegment.value === 'recent') {
      contextQueue = library.recentTracks
    }
    await player.playTrack(track, contextQueue)
  } catch (error) {
    const toast = await toastController.create({
      message: error instanceof Error ? error.message : String(error),
      duration: 2600,
      color: 'danger'
    })
    await toast.present()
  }
}

async function openFavoriteSortSheet() {
  const sheet = await actionSheetController.create({
    header: '收藏歌曲排序',
    buttons: [
      ...TRACK_SORT_OPTIONS.map((opt) => ({
        text: opt.label + (favoriteSortType.value === opt.type ? ' ✓' : ''),
        role: favoriteSortType.value === opt.type ? 'selected' : undefined,
        handler: () => {
          favoriteSortType.value = opt.type
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function openLocalSortSheet() {
  const sheet = await actionSheetController.create({
    header: '本地音乐排序',
    buttons: [
      ...TRACK_SORT_OPTIONS.map((opt) => ({
        text: opt.label + (localSortType.value === opt.type ? ' ✓' : ''),
        role: localSortType.value === opt.type ? 'selected' : undefined,
        handler: () => {
          localSortType.value = opt.type
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

function openMore(track: Track) {
  void openTrackActions(track)
}

async function playTrackList(tracks: Track[], shuffleMode = false) {
  if (!tracks.length) return
  try {
    const targetTracks = shuffleMode ? [...tracks].sort(() => Math.random() - 0.5) : tracks
    if (shuffleMode) player.setMode({ shuffle: true })
    await player.playTrack(targetTracks[0], tracks)
  } catch (error) {
    await showToast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

function playFavoriteAll(shuffleMode = false) {
  const source = filteredFavorites.value.length ? filteredFavorites.value : library.favorites
  playTrackList(
    source.map((entry) => entry.track),
    shuffleMode
  )
}

function playLocalAll(shuffleMode = false) {
  const source = filteredLocalTracks.value.length ? filteredLocalTracks.value : library.localTracks
  playTrackList(source, shuffleMode)
}

function playRecentAll(shuffleMode = false) {
  playTrackList(library.recentTracks, shuffleMode)
}

async function confirmClearHistory() {
  const alert = await alertController.create({
    header: '清空播放记录？',
    message: '所有最近播放的历史记录会被清除。',
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '清空',
        role: 'destructive',
        handler: () => {
          void library
            .clearHistory()
            .then(() => showToast('已清空播放记录'))
            .catch((error) =>
              showToast(error instanceof Error ? error.message : '清空失败', 'danger')
            )
        }
      }
    ]
  })
  await alert.present()
}

function openRecentActions(track: Track) {
  void openTrackActions(track, {
    extraButtons: [
      {
        text: '从记录中移除',
        role: 'destructive',
        handler: () => {
          void library
            .removeFromHistory(track.key)
            .then(() => showToast('已从播放记录中移除'))
            .catch((error) =>
              showToast(error instanceof Error ? error.message : '移除失败', 'danger')
            )
        }
      }
    ]
  })
}

function pickLocal() {
  localInput.value?.click()
}

function pickPlaylistFile() {
  playlistFileInput.value?.click()
}

async function onPlaylistFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const songs = parsePlaylistFile(file.name, new Uint8Array(await file.arrayBuffer()))
    const tracks = playlistFileTracks(songs, pluginStore.providers)
    if (!tracks.length) throw new Error('歌单文件里没有可导入的歌曲')
    const name = file.name.replace(/\.(cmpl|cpl)$/i, '') || '导入歌单'
    const playlist = await library.importSharedPlaylist(name, '从歌单文件导入', tracks)
    activeSegment.value = 'playlists'
    await showToast('已导入 ' + playlist.trackKeys.length + ' 首歌曲', 'success')
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '导入失败', 'danger')
  }
}

/**
 * 从剪贴板导入歌单（桌面版 `importPlaylistFromClipboard`）。
 *
 * 歌单页的「复制歌单到剪贴板」把加密歌单写进剪贴板后，手机上原本没有任何
 * 地方能读回来。这里读剪贴板、解出曲目、建成新歌单；失败原因逐条说明——
 * 用户常常是复制了别的东西，只报「导入失败」没法自查。
 */
async function importPlaylistFromClipboard() {
  try {
    const { value } = await Clipboard.read()
    if (!value) throw new Error('剪贴板是空的')
    const { tracks } = parsePlaylistClipboard(value, pluginStore.providers)
    const playlist = await library.importSharedPlaylist(
      clipboardPlaylistName(),
      '从剪贴板导入',
      tracks
    )
    activeSegment.value = 'playlists'
    await showToast('已导入 ' + playlist.trackKeys.length + ' 首歌曲', 'success')
  } catch (cause) {
    await showToast(cause instanceof Error ? cause.message : '导入失败', 'danger')
  }
}

/**
 * 把当前播放队列保存成一张新歌单（桌面版「选择导入方式 → 从播放列表」）。
 *
 * 队列可以导出成 `.cmpl` 文件，但文件只是备份——想在手机的音乐库里留住
 * 这次播放顺序，此前只能逐首点「加入歌单」。命名、描述与桌面版同一份口径，
 * 队列里重复的歌只存一份并如实提示跳过数量。
 */
async function saveQueueAsPlaylist() {
  try {
    const draft = buildQueuePlaylistDraft(player.queue)
    const playlist = await library.importSharedPlaylist(draft.name, draft.description, draft.tracks)
    activeSegment.value = 'playlists'
    await showToast(
      draft.skipped > 0
        ? `已保存 ${playlist.trackKeys.length} 首到歌单「${draft.name}」，跳过 ${draft.skipped} 首重复`
        : `已保存 ${playlist.trackKeys.length} 首到歌单「${draft.name}」`,
      'success'
    )
  } catch (cause) {
    await showToast(cause instanceof Error ? cause.message : '保存失败', 'danger')
  }
}

async function onLocalFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  const records = await library.importLocalFiles(files)
  if (records.length) {
    const toast = await toastController.create({
      message: `已导入 ${records.length} 首本地歌曲`,
      duration: 2200,
      color: 'success'
    })
    await toast.present()
    return
  }
  // 一首都没进来时必须说明原因（文件过大、格式不支持、存储写满），
  // 否则用户点了导入、界面毫无反应。
  if (records.failed.length) {
    const first = records.failed[0]
    const more = records.failed.length > 1 ? ` 等 ${records.failed.length} 个文件` : ''
    await showToast(`${first.name}${more}：${first.message}`, 'danger')
  }
}

async function openCreatePlaylist() {
  const alert = await alertController.create({
    header: '新建歌单',
    inputs: [
      { name: 'name', type: 'text', placeholder: '歌单名称' },
      { name: 'description', type: 'text', placeholder: '描述（可选）' }
    ],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '创建', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  const name = String(data?.values?.name ?? '').trim()
  if (role !== 'confirm' || !name) return
  library.createPlaylist(name, String(data?.values?.description ?? '').trim())
  activeSegment.value = 'playlists'
}

async function openPlaylistActions(playlist: Playlist) {
  const sheet = await actionSheetController.create({
    header: playlist.name,
    buttons: [
      {
        text: '打开歌单',
        handler: () => {
          void router.push(`/playlist/${playlist.id}`)
        }
      },
      {
        text: '分享歌单',
        handler: () => {
          sharePlaylistId.value = playlist.id
          sharePlaylistOpen.value = true
        }
      },
      {
        text: '重命名',
        handler: () => {
          void renamePlaylist(playlist)
        }
      },
      {
        text: '删除歌单',
        role: 'destructive',
        handler: () => {
          void confirmDeletePlaylist(playlist)
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

/**
 * 删除歌单前确认：歌单里的歌曲本身不受影响，但歌单无法撤销。
 * 批量/单曲删除一直有确认，歌单删除却是一点就没，口径不一致。
 */
async function confirmDeletePlaylist(playlist: Playlist): Promise<void> {
  const alert = await alertController.create({
    header: '删除歌单',
    message: playlist.cloudId
      ? `确定删除歌单「${playlist.name}」吗？本地与云端副本都会删除，其中的歌曲不会被删除。`
      : `确定删除歌单「${playlist.name}」吗？其中的歌曲不会被删除。`,
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '删除',
        role: 'destructive',
        handler: () => {
          void library
            .deletePlaylist(playlist.id)
            .then((warning) =>
              showToast(warning || '歌单已删除', warning ? 'warning' : 'success')
            )
            .catch((error) =>
              showToast(error instanceof Error ? error.message : '删除失败', 'danger')
            )
        }
      }
    ]
  })
  await alert.present()
}

async function renamePlaylist(playlist: Playlist) {
  const alert = await alertController.create({
    header: '重命名歌单',
    inputs: [{ name: 'name', type: 'text', value: playlist.name }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const name = String(data?.values?.name ?? '').trim()
  if (name) await library.renamePlaylist(playlist.id, name)
}

async function showToast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

async function scanLocal() {
  try {
    const records = await library.scanLocalMusic()
    const filtered = (records.filteredSizeCount || 0) + (records.filteredDurationCount || 0)
    if (records.length) {
      const filterTip = filtered ? ` (已自动过滤 ${filtered} 个短音频)` : ''
      await showToast(`已导入 ${records.length} 首本地歌曲${filterTip}`, 'success')
    } else if (filtered) {
      await showToast(`没有发现新的音频 (已自动过滤 ${filtered} 个短音频)`, 'medium')
    } else {
      await showToast('没有发现新的音频文件', 'medium')
    }
  } catch (error) {
    await showToast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

/** 打开整页标签编辑器（桌面版 LocalTagEditor 的移动端等价）。 */
function editLocalTags(track: Track) {
  tagEditorTrack.value = track
  tagEditorOpen.value = true
}

/** 保存成功后歌曲对象已更新，列表会跟着刷新；这里只做一次提示。 */
function onTagsSaved() {
  void showToast('标签已更新', 'success')
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('读取图片失败'))
    image.src = source
  })
}

async function fileToCoverDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  if (file.size <= 512 * 1024) return dataUrl
  try {
    const image = await loadImage(dataUrl)
    const scale = Math.min(1, 1024 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return dataUrl
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return dataUrl
  }
}

function chooseCover(track: Track) {
  coverTarget = track
  coverInput.value?.click()
}

async function onCoverFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const target = coverTarget
  coverTarget = null
  if (!file || !target) return
  if (!file.type.startsWith('image/')) {
    await showToast('请选择图片文件', 'danger')
    return
  }
  try {
    const cover = await fileToCoverDataUrl(file)
    const result = await library.writeLocalTags(target, { cover })
    if (result.fileTagWarning) {
      await showToast('封面已保存到应用内；音频文件写入失败', 'warning')
    } else {
      await showToast(result.fileTagWritten ? '封面已保存并写入音频标签' : '封面已保存')
    }
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '设置封面失败', 'danger')
  }
}

async function removeCover(track: Track) {
  try {
    const result = await library.writeLocalTags(track, { cover: '' })
    if (result.fileTagWarning) {
      await showToast('应用内封面已移除；音频文件写入失败', 'warning')
    } else {
      await showToast('已移除封面')
    }
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '移除封面失败', 'danger')
  }
}

async function chooseMatchSource(): Promise<string | null> {
  const sources = pluginStore.sources
  if (!sources.length) {
    await showToast('请先安装并启用音源插件', 'warning')
    return null
  }
  if (sources.length === 1) return sources[0].id
  return new Promise<string | null>((resolve) => {
    let picked: string | null = null
    void actionSheetController
      .create({
        header: '选择音源',
        buttons: [
          ...sources.map((source) => ({
            text: source.name,
            handler: () => {
              picked = source.id
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

async function matchLocalTrack(track: Track) {
  const source = await chooseMatchSource()
  if (!source) return
  const query = (track.title + ' ' + track.artists.join(' ')).trim()
  try {
    const page = await pluginStore.searchTracks(source, query, undefined, 10)
    const items = (page.items || []).slice(0, 8)
    if (!items.length) {
      await showToast('没有找到可匹配的歌曲', 'warning')
      return
    }
    const picked = await new Promise<Track | null>((resolve) => {
      let selected: Track | null = null
      void actionSheetController
        .create({
          header: '选择匹配结果',
          buttons: [
            ...items.map((item) => ({
              text: (item.title + ' - ' + item.artists.join(' / ')).slice(0, 80),
              handler: () => {
                selected = item
              }
            })),
            { text: '取消', role: 'cancel' }
          ]
        })
        .then(async (sheet) => {
          await sheet.present()
          await sheet.onDidDismiss()
          resolve(selected)
        })
    })
    if (!picked) return
    let lyricsValue: any = null
    try {
      lyricsValue = await pluginStore.lyrics(picked)
    } catch {
      // Cover matching still succeeds when the source has no lyrics.
    }
    const lyrics = lyricValueToLrc(lyricsValue)
    await library.applyLocalMetadata(track.key, {
      cover: picked.artworkUrl || '',
      lyrics
    })
    await showToast(lyrics ? '已匹配封面与歌词' : '已匹配封面', 'success')
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '匹配失败', 'danger')
  }
}

/**
 * Matches every local track that is still missing a cover, album, or title
 * against one source, reporting progress through the shared overlay.
 */
async function matchLocalBatch() {
  if (batchMatching.value) return
  const source = await chooseMatchSource()
  if (!source) return
  const targets = library.localTracks.filter(needsMetadataMatch)
  if (!targets.length) {
    await showToast('本地歌曲信息已完整，无需匹配', 'medium')
    return
  }
  batchMatching.value = true
  const progressId = createPluginProgress({
    title: '批量匹配本地歌曲',
    message: `0 / ${targets.length}`
  })
  try {
    const result = await runLocalMetadataMatch({
      tracks: targets,
      search: async (query) => {
        const page = await pluginStore.searchTracks(source, query, undefined, 10)
        return page.items || []
      },
      lyrics: async (picked) => lyricValueToLrc(await pluginStore.lyrics(picked)),
      apply: (track, picked, metadata) =>
        library.applyLocalMetadata(track.key, {
          ...metadata,
          title: hasUnknownTitle(track) ? picked.title : undefined,
          artist: hasUnknownArtist(track) ? picked.artists.join(' / ') : undefined,
          album: track.album ? undefined : picked.album
        }),
      onProgress: ({ processed, total }) => {
        updatePluginProgress(progressId, { message: `${processed} / ${total}`, value: processed / total })
      }
    })
    await showToast(
      result.matched ? `已匹配 ${result.matched} / ${result.total} 首本地歌曲` : '没有找到匹配结果',
      result.matched ? 'success' : 'warning'
    )
  } catch (error) {
    await showToast(error instanceof Error ? error.message : '批量匹配失败', 'danger')
  } finally {
    closePluginProgress(progressId)
    batchMatching.value = false
  }
}

async function openLocalActions(track: Track) {
  const sheet = await actionSheetController.create({
    header: track.title,
    buttons: [
      { text: '播放', handler: () => void play(track) },
      { text: '编辑信息', handler: () => void editLocalTags(track) },
      { text: track.artworkUrl ? '更换封面' : '添加封面', handler: () => chooseCover(track) },
      ...(track.artworkUrl
        ? [{ text: '移除封面', handler: () => void removeCover(track) }]
        : []),
      { text: '在线匹配封面与歌词', handler: () => void matchLocalTrack(track) },
      { text: '歌曲信息', handler: () => void openTrackActions(track) },
      {
        text: '删除本地文件',
        role: 'destructive',
        handler: () => {
          // 单曲删除是真正的物理删除，与批量删除一样先confirm一次。
          void confirmDeleteLocal(track)
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}
</script>

<style scoped>
.file-input {
  display: none;
}
.library-head {
  padding-top: 16px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.quick-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}
.quick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  color: var(--ceru-text);
  border: 1px solid var(--ceru-border);
  text-align: left;
  font-size: 13px;
  font-weight: 600;
}
.quick-card ion-icon {
  color: var(--ceru-brand);
  font-size: 22px;
}
.library-segment {
  margin: 18px 16px 8px;
  --background: var(--ceru-bg-elevated);
  border-radius: 12px;
  padding: 3px;
}
.section {
  padding-top: 8px;
}
.list-block {
  margin: 0 8px;
}
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 12px;
}
.playlist-card {
  position: relative;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: var(--ceru-text);
  min-width: 0;
}
.playlist-art {
  position: relative;
  width: 100%;
  height: 0;
  padding-top: 100%;
  overflow: hidden;
  border-radius: 18px;
}
.playlist-art :deep(.cover) {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}
.track-count {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
  font-size: 10px;
  backdrop-filter: blur(8px);
}
.playlist-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-right: 26px;
  min-width: 0;
}
.playlist-name {
  font-size: 13px;
  font-weight: 650;
  min-width: 0;
}
/* 「新建歌单」卡片没有说明行，名称仍需与封面隔开 */
.create-card .playlist-name {
  margin-top: 8px;
}
/* 云端徽标沿用桌面版的小号标签：说明「这张会同步」，不抢名称的位置 */
.playlist-sync-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--ceru-border);
  color: var(--ceru-brand);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
}
.playlist-desc,
.playlist-time {
  margin-top: 2px;
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
/* 「更多」按钮浮在卡片右下角，给说明行留出位置，避免文字压到图标下面 */
.playlist-desc,
.playlist-time {
  padding-right: 28px;
}
.playlist-more {
  position: absolute;
  right: 0;
  bottom: -8px;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 18px;
  padding: 8px;
}
/* 云端歌单与本地歌单在列表里必须是两组：前者只读，点开是网络请求 */
.cloud-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 26px;
  padding-bottom: 10px;
}
.cloud-head-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ceru-text);
}
.cloud-head-title ion-icon {
  font-size: 15px;
  color: var(--ceru-brand);
}
.cloud-head-hint {
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.cloud-head-hint.error {
  color: var(--ceru-danger);
}
.cloud-tag {
  background: rgba(var(--ion-color-primary-rgb), 0.82);
}
.create-card .create-art {
  position: relative;
  width: 100%;
  height: 0;
  padding-top: 100%;
  border: 1.5px dashed var(--ceru-border);
  border-radius: 18px;
  color: var(--ceru-text-secondary);
  font-size: 32px;
  background: var(--ceru-bg-elevated);
}
.create-card .create-art ion-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.filter-wrap {
  margin-top: 8px;
  margin-bottom: 4px;
}
.empty-search-hint {
  text-align: center;
  color: var(--ion-color-step-500, #888);
  font-size: 14px;
  padding: 24px 16px;
}
.local-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 10px;
}
.local-tools span {
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 16px 10px;
}
.clear-history-btn {
  margin-left: auto;
  border: 1px solid var(--ceru-border);
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
}
.clear-history-btn:active {
  color: var(--ceru-danger);
  border-color: var(--ceru-danger);
}
.clear-history-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}
.importing {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  padding: 16px;
}
.bottom-space {
  height: 150px;
}
@media (min-width: 700px) {
  .playlist-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (min-width: 1000px) {
  .playlist-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}</style>
