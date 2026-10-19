<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>音乐库</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="openCreatePlaylist">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
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
      <div class="library-head ceru-pad">
        <p class="eyebrow">YOUR LIBRARY</p>
        <h1 class="ceru-title">收藏与本地</h1>
        <div class="quick-row">
          <button class="quick-card ceru-card ceru-press" type="button" @click="activeSegment = 'local'; pickLocal()">
            <ion-icon :icon="folderOpenOutline" />
            <span>导入本地音乐</span>
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
        <div v-if="library.favorites.length" class="list-block">
          <TrackRow
            v-for="entry in library.favorites"
            :key="entry.key"
            :track="entry.track"
            favorite
            @play="play"
            @more="openMore"
          />
        </div>
        <EmptyState
          v-else
          title="还没有收藏"
          description="在播放器或歌曲菜单中点击收藏，喜欢的音乐会出现在这里。"
          :icon="heartOutline"
        />
      </div>

      <div v-else-if="activeSegment === 'playlists'" class="section">
        <div v-if="library.playlists.length" class="playlist-grid ceru-pad">
          <div
            v-for="playlist in library.playlists"
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
            <div class="playlist-name ceru-truncate">{{ playlist.name }}</div>
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
        <EmptyState
          v-else
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
        <div v-if="library.localRecords.length" class="list-block">
          <TrackRow
            v-for="track in library.localTracks"
            :key="track.key"
            :track="track"
            @play="play"
            @more="openLocalActions(track)"
          />
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
        <div v-if="library.recentTracks.length" class="list-block">
          <TrackRow
            v-for="track in library.recentTracks"
            :key="track.key"
            :track="track"
            :favorite="library.isFavorite(track)"
            @play="play"
            @more="openMore"
          />
        </div>
        <EmptyState
          v-else
          title="还没有播放记录"
          description="播放过的歌曲会出现在这里，方便快速继续。"
          :icon="timeOutline"
        />
      </div>

      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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
  cloudDownloadOutline,
  ellipsisHorizontal,
  folderOpenOutline,
  heartOutline,
  timeOutline
} from 'ionicons/icons'
import TrackRow from '@/components/TrackRow.vue'
import CoverImage from '@/components/CoverImage.vue'
import EmptyState from '@/components/EmptyState.vue'
import type { Track } from '@/types/music'
import type { Playlist } from '@/types/music'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { usePluginStore } from '@/stores/plugins'
import { lyricValueToLrc } from '@/services/lyrics'
import { openTrackActions } from '@/services/trackActions'

const library = useLibraryStore()
const player = usePlayerStore()
const pluginStore = usePluginStore()
const activeSegment = ref<'favorites' | 'playlists' | 'local' | 'recent'>('favorites')
const localInput = ref<HTMLInputElement | null>(null)

function playlistCover(id: string): string | undefined {
  const tracks = library.playlistTracks(id)
  return tracks.find((track) => track.artworkUrl)?.artworkUrl
}

async function play(track: Track) {
  try {
    await player.playTrack(track)
  } catch (error) {
    const toast = await toastController.create({
      message: error instanceof Error ? error.message : String(error),
      duration: 2600,
      color: 'danger'
    })
    await toast.present()
  }
}

function openMore(track: Track) {
  void openTrackActions(track)
}

function pickLocal() {
  localInput.value?.click()
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
        text: '重命名',
        handler: () => {
          void renamePlaylist(playlist)
        }
      },
      {
        text: '删除歌单',
        role: 'destructive',
        handler: () => {
          void library.deletePlaylist(playlist.id)
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
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
    await showToast(
      records.length ? `已导入 ${records.length} 首本地歌曲` : '没有发现新的音频文件',
      records.length ? 'success' : 'medium'
    )
  } catch (error) {
    await showToast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function editLocalTags(track: Track) {
  const alert = await alertController.create({
    header: '编辑本地信息',
    inputs: [
      { name: 'title', type: 'text', placeholder: '标题', value: track.title },
      { name: 'artist', type: 'text', placeholder: '艺术家', value: track.artists.join(' / ') },
      { name: 'album', type: 'text', placeholder: '专辑', value: track.album || '' }
    ],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const title = String(data?.values?.title ?? '').trim()
  if (!title) {
    await showToast('标题不能为空', 'danger')
    return
  }
  try {
    const artist = String(data?.values?.artist ?? '').trim()
    const album = String(data?.values?.album ?? '').trim()
    const result = await library.writeLocalTags(track, {
      title,
      artists: artist ? [artist] : [],
      album: album || undefined
    })
    if (result.fileTagWarning) {
      await showToast('应用内信息已保存；音频文件标签写入失败', 'warning')
    } else {
      await showToast(result.fileTagWritten ? '已保存并写入音频标签' : '应用内信息已保存')
    }
  } catch (error) {
    await showToast(error instanceof Error ? error.message : String(error), 'danger')
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

async function openLocalActions(track: Track) {
  const sheet = await actionSheetController.create({
    header: track.title,
    buttons: [
      { text: '播放', handler: () => void play(track) },
      { text: '编辑信息', handler: () => void editLocalTags(track) },
      { text: '在线匹配封面与歌词', handler: () => void matchLocalTrack(track) },
      { text: '歌曲信息', handler: () => void openTrackActions(track) },
      {
        text: '删除本地文件',
        role: 'destructive',
        handler: () => {
          void library.deleteLocalTrack(track.key)
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
.playlist-name {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 650;
  padding-right: 26px;
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
