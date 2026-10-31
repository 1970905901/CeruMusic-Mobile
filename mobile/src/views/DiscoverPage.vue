<template>
  <ion-page>
    <ion-header :translucent="true" class="discover-header">
      <ion-toolbar>
        <ion-buttons slot="start">
          <img src="/logo.png" alt="" class="top-logo" />
        </ion-buttons>
        <ion-title>发现</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="$router.push('/tabs/settings')">
            <ion-icon slot="icon-only" :icon="settingsOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="discover-content">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div class="ceru-pad plugin-home-header"><PluginSlot slot="home.header" /></div>

      <div class="hero ceru-pad">
        <p class="eyebrow">{{ greeting }}</p>
        <h1 class="ceru-title">今天听点什么？</h1>
        <p class="hero-sub">从你安装的音源插件中搜索，或继续最近播放。</p>

        <ion-searchbar
          v-model="query"
          class="hero-search"
          placeholder="搜索歌曲、歌手或专辑"
          :debounce="0"
          :animated="false"
          @keyup.enter="goSearch"
          @ionInput="onSearchInput"
        />
        <div v-if="suggestions.length" class="suggestions ceru-card">
          <button
            v-for="suggestion in suggestions.slice(0, 6)"
            :key="suggestion"
            type="button"
            class="suggestion"
            @click="goSearch(suggestion)"
          >
            <ion-icon :icon="searchOutline" />
            <span class="ceru-truncate">{{ suggestion }}</span>
          </button>
        </div>
      </div>

      <div class="source-row ceru-pad">
        <button
          v-if="pluginStore.sources.length"
          class="source-pill ceru-press"
          type="button"
          @click="chooseSource"
        >
          <span class="dot" />
          {{ selectedSourceName }}
          <ion-icon :icon="chevronDown" />
        </button>
        <button class="source-pill muted" type="button" @click="$router.push('/downloads')">
          <ion-icon :icon="cloudDownloadOutline" />
          下载
        </button>
      </div>

      <div class="ceru-pad"><PluginSlot slot="home.content.before" /></div>

      <template v-if="!pluginStore.enabledPlugins.length">
        <div class="install-card ceru-card ceru-pad">
          <div class="install-icon">
            <ion-icon :icon="extensionPuzzleOutline" />
          </div>
          <h2>安装第一个音源插件</h2>
          <p>
            澜音移动端不内置音乐源。导入你信任的 Ceru v2 插件后，即可搜索、播放和下载。
          </p>
          <ion-button expand="block" @click="$router.push('/welcome')">
            去安装插件
          </ion-button>
        </div>
      </template>

      <template v-else>
        <div v-if="loading" class="loading-row">
          <ion-spinner name="crescent" />
          <span>正在读取音源…</span>
        </div>

        <template v-else>
          <template v-if="pluginSections.length">
            <SectionHeader title="插件推荐" subtitle="来自已启用插件的自定义首页" />
            <div class="plugin-section-row">
              <button
                v-for="section in pluginSections"
                :key="section.pluginKey + ':' + section.id"
                type="button"
                class="plugin-section-card ceru-card ceru-press"
                @click="openPluginSection(section)"
              >
                <span class="plugin-section-icon"><ion-icon :icon="extensionPuzzleOutline" /></span>
                <span class="plugin-section-copy">
                  <strong class="ceru-truncate">{{ section.title }}</strong>
                  <small class="ceru-truncate">{{ section.pluginName }}</small>
                </span>
                <ion-icon :icon="chevronForward" />
              </button>
            </div>
          </template>

          <!--
            排行榜与分类是两次独立请求：一边失败不该连带隐藏另一边。
            桌面版 find.vue 同样对分类歌单单独给出错误与「重新加载」。
          -->
          <PlaylistLoadError
            v-if="sourceError && !loading"
            :message="sourceError"
            :has-items="charts.length > 0 || categories.length > 0"
            :retrying="retryingSource"
            @retry="retrySourceData"
          />

          <SectionHeader
            v-if="charts.length"
            title="排行榜"
            subtitle="来自当前音源"
            action="刷新"
            @action="loadSourceData"
          />
          <div v-if="charts.length" class="horizontal-list">
            <button
              v-for="chart in charts"
              :key="chartKey(chart)"
              class="collection-card ceru-press"
              type="button"
              @click="openRemote('chart', chart)"
            >
              <CoverImage :src="artworkOf(chart)" :size="148" :radius="16" :alt="chart.title" />
              <div class="collection-meta">
                <div class="collection-title ceru-truncate">{{ chart.title }}</div>
                <div class="collection-sub ceru-truncate">
                  {{ chart.chart?.updateFrequency || chart.subtitle || '排行榜' }}
                </div>
              </div>
            </button>
          </div>

          <SectionHeader
            v-if="categories.length"
            title="歌单分类"
            subtitle="浏览当前音源公开歌单"
          />
          <div v-if="categories.length" class="category-grid ceru-pad">
            <button
              v-for="category in categories"
              :key="collectionKey(category)"
              class="category-card ceru-press"
              type="button"
              @click="openRemote('playlist-category', category)"
            >
              <CoverImage :src="artworkOf(category)" :size="72" :radius="14" :alt="category.title" />
              <div class="category-copy">
                <div class="ceru-truncate category-title">{{ category.title }}</div>
                <div class="ceru-truncate category-sub">{{ category.subtitle || '歌单' }}</div>
              </div>
              <ion-icon :icon="chevronForward" />
            </button>
          </div>

          <SectionHeader
            v-if="recent.length"
            title="最近播放"
            action="全部"
            @action="$router.push('/tabs/library')"
          />
          <div v-if="recent.length" class="list-block">
            <TrackRow
              v-for="track in recent.slice(0, 5)"
              :key="track.key"
              :track="track"
              :favorite="library.isFavorite(track)"
              :active="player.currentTrack?.key === track.key"
              @play="play"
              @more="openMore"
            />
          </div>

          <SectionHeader
            v-if="favoriteTracks.length"
            title="我的收藏"
            action="全部"
            @action="$router.push('/tabs/library')"
          />
          <div v-if="favoriteTracks.length" class="list-block">
            <TrackRow
              v-for="track in favoriteTracks.slice(0, 5)"
              :key="track.key"
              :track="track"
              favorite
              :active="player.currentTrack?.key === track.key"
              @play="play"
              @more="openMore"
            />
          </div>

          <div
            v-if="!charts.length && !categories.length && !recent.length && !favoriteTracks.length && !sourceError"
            class="ceru-empty"
          >
            <ion-icon :icon="compassOutline" />
            <div class="empty-title">还没有可展示的内容</div>
            <div class="empty-desc">试试搜索，或从音乐库导入本地音乐。</div>
            <ion-button fill="outline" @click="goSearch()">开始搜索</ion-button>
          </div>
        </template>
      </template>
      <div class="ceru-pad"><PluginSlot slot="home.content.after" /></div>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  actionSheetController,
  toastController
} from '@ionic/vue'
import {
  chevronDown,
  chevronForward,
  cloudDownloadOutline,
  compassOutline,
  extensionPuzzleOutline,
  searchOutline,
  settingsOutline
} from 'ionicons/icons'
import { useRouter } from 'vue-router'
import SectionHeader from '@/components/SectionHeader.vue'
import TrackRow from '@/components/TrackRow.vue'
import CoverImage from '@/components/CoverImage.vue'
import PlaylistLoadError from '@/components/PlaylistLoadError.vue'
import PluginSlot from '@/components/PluginSlot.vue'
import { playlistLoadErrorMessage } from '@/services/playlistLoadError'
import { collectHomeSections } from '@/services/homeSections'
import { usePluginStore } from '@/stores/plugins'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import { openTrackActions } from '@/services/trackActions'
import { createRequestGuard } from '@/services/requestGuard'
import type { Track } from '@/types/music'

const router = useRouter()
const pluginStore = usePluginStore()
const library = useLibraryStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const query = ref('')
const suggestions = ref<string[]>([])
const charts = ref<any[]>([])
const categories = ref<any[]>([])
const loading = ref(false)
/** 榜单/分类请求失败的说明；为空表示最近一次加载没有出错。 */
const sourceError = ref('')
const retryingSource = ref(false)
let suggestionTimer: ReturnType<typeof setTimeout> | null = null
/**
 * 联想词与首页数据各自独立的竞态守卫：
 * 连续输入时只认最后一次联想结果；切换音源时只认最后一次榜单/分类结果。
 */
const suggestionRequests = createRequestGuard()
const sourceDataRequests = createRequestGuard()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const selectedSource = computed(() => {
  const source = settings.settings.lastSource
  return pluginStore.sources.find((item) => item.id === source) ?? pluginStore.sources[0]
})
const selectedSourceName = computed(() => selectedSource.value?.name ?? '选择音源')
// 同一 `kind`（playlists / charts）只展示一个插件，与桌面 `homeSections` 同口径；
// 此前把每个插件声明的栏目全列出来，首页会出现两份几乎一样的栏目。
const pluginSections = computed(() => collectHomeSections(pluginStore.plugins))

function openPluginSection(section: { pluginKey: string; view: string }) {
  router.push(
    '/plugin-surface/' +
      encodeURIComponent(section.pluginKey) +
      '/' +
      encodeURIComponent(section.view)
  )
}

const favoriteTracks = computed(() => library.favorites.map((item) => item.track))
const recent = computed(() => library.recentTracks)

function trackKey(track: any): string {
  return `${track.ref?.providerId}:${track.ref?.id}`
}

function chartKey(chart: any): string {
  return `chart:${chart.ref?.providerId}:${chart.ref?.id}`
}

function collectionKey(item: any): string {
  return `${item.ref?.providerId}:${item.ref?.id}`
}

function artworkOf(item: any): string | undefined {
  return item.metadata?.artworkUrl || item.playlist?.artworkUrl || item.chart?.artworkUrl
}

async function chooseSource() {
  const sheet = await actionSheetController.create({
    header: '选择音源',
    buttons: [
      ...pluginStore.sources.map((source) => ({
        text: `${source.name}${source.implementations.length > 1 ? ` · ${source.implementations.length} 个实现` : ''}`,
        handler: () => {
          settings.settings.lastSource = source.id
          void loadSourceData()
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

function goSearch(value?: string) {
  const q = String(value ?? query.value ?? '').trim()
  void router.push({ path: '/tabs/search', query: q ? { q } : {} })
}

function onSearchInput(event: any) {
  const value = String(event.detail?.value ?? query.value ?? '')
  query.value = value
  if (suggestionTimer) clearTimeout(suggestionTimer)
  if (!value.trim() || !pluginStore.sources.length) {
    suggestionRequests.invalidate()
    suggestions.value = []
    return
  }
  suggestionTimer = setTimeout(async () => {
    const token = suggestionRequests.beginLatest(`${selectedSource.value?.id ?? ''}|${value}`)
    try {
      const result = await pluginStore.suggest(selectedSource.value?.id ?? '', value)
      if (!suggestionRequests.isCurrent(token, `${selectedSource.value?.id ?? ''}|${value}`)) return
      if (Array.isArray(result)) suggestions.value = result.map(String)
      else if (Array.isArray(result?.items)) suggestions.value = result.items.map((item: any) => String(item.title ?? item))
      else suggestions.value = []
    } catch {
      if (!suggestionRequests.isCurrent(token, `${selectedSource.value?.id ?? ''}|${value}`)) return
      suggestions.value = []
    }
  }, 260)
}

async function loadSourceData() {
  const source = selectedSource.value?.id
  if (!source) {
    sourceDataRequests.invalidate()
    charts.value = []
    categories.value = []
    sourceError.value = ''
    loading.value = false
    return
  }
  const token = sourceDataRequests.beginLatest(source)
  loading.value = true
  sourceError.value = ''
  /**
   * 两个请求各自 `catch` 成空列表，可插件报错（未授权、限流、网络断了）时
   * 首页会安静地变成「还没有可展示的内容」——用户只会以为这个音源没内容，
   * 不知道是需要去授权或换网络。这里把失败原因留下来交给统一的错误提示。
   * 只有一边失败时另一边照常展示，所以取第一个错误即可。
   */
  const failures: unknown[] = []
  const settle = <T,>(promise: Promise<T>) =>
    promise.catch((cause: unknown) => {
      failures.push(cause)
      return { items: [] as T[] }
    })
  try {
    const [chartPage, categoryPage] = await Promise.all([
      settle(pluginStore.charts(source)),
      settle(pluginStore.playlistCategories(source))
    ])
    if (!sourceDataRequests.isCurrent(token, selectedSource.value?.id ?? '')) return
    charts.value = chartPage.items ?? []
    categories.value = categoryPage.items ?? []
    if (failures.length) sourceError.value = playlistLoadErrorMessage(failures[0])
  } finally {
    if (sourceDataRequests.isCurrent(token, selectedSource.value?.id ?? '')) loading.value = false
  }
}

function openRemote(kind: string, item: any) {
  const source = selectedSource.value?.id ?? ''
  if (kind === 'playlist-category') {
    void router.push({
      path: `/category/remote-${encodeURIComponent(source)}-${encodeURIComponent(item.ref?.id ?? '')}`,
      query: {
        source,
        providerId: item.ref?.providerId ?? source,
        categoryId: item.ref?.id ?? '',
        title: item.title ?? '歌单分类',
        subtitle: item.subtitle ?? '',
        cover: artworkOf(item) ?? ''
      }
    })
    return
  }
  void router.push({
    path: `/playlist/remote-${encodeURIComponent(source)}-${encodeURIComponent(item.ref?.id ?? '')}`,
    query: {
      source,
      providerId: item.ref?.providerId ?? source,
      remoteId: item.ref?.id ?? '',
      kind,
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      cover: artworkOf(item) ?? '',
      description: item.playlist?.description ?? ''
    }
  })
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

/** 错误卡片上的「重新加载」：拉取期间禁用按钮，避免连点叠加请求。 */
async function retrySourceData(): Promise<void> {
  if (retryingSource.value || loading.value) return
  retryingSource.value = true
  try {
    await loadSourceData()
  } finally {
    retryingSource.value = false
  }
}

async function refresh(event: any) {
  try {
    await loadSourceData()
  } finally {
    event.target.complete()
  }
}

watch(
  () => settings.settings.lastSource,
  () => void loadSourceData()
)

onMounted(() => {
  if (!settings.settings.lastSource && pluginStore.sources.length) {
    settings.settings.lastSource = pluginStore.sources[0].id
  }
  void loadSourceData()
})

onBeforeUnmount(() => {
  if (suggestionTimer) clearTimeout(suggestionTimer)
  suggestionRequests.dispose()
  sourceDataRequests.dispose()
})
</script>

<style scoped>
.discover-header ion-toolbar {
  --min-height: 52px;
}
.top-logo {
  width: 28px;
  height: 28px;
  /* logo.png 是「透明底 + 品牌色音符」，不再需要圆角卡片，直接留白即可。 */
  object-fit: contain;
  margin-left: 8px;
}
.hero {
  padding-top: 20px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 650;
  color: var(--ceru-brand);
  letter-spacing: 0.08em;
}
.hero-sub {
  color: var(--ceru-text-secondary);
  font-size: 14px;
  margin: 10px 0 0;
  line-height: 1.55;
}
.hero-search {
  margin: 18px 0 0;
  padding: 0;
  --background: var(--ceru-bg-elevated);
  --border-radius: 16px;
  --box-shadow: none;
  --placeholder-color: var(--ceru-text-secondary);
  --color: var(--ceru-text);
  --icon-color: var(--ceru-text-secondary);
  border: 1px solid var(--ceru-border);
  border-radius: 16px;
  overflow: hidden;
}
.suggestions {
  margin-top: 8px;
  overflow: hidden;
  padding: 4px 0;
}
.suggestion {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  font-size: 14px;
  text-align: left;
}
.suggestion ion-icon {
  color: var(--ceru-text-secondary);
}
.source-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
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
.source-pill.muted {
  color: var(--ceru-text-secondary);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ceru-brand);
  box-shadow: 0 0 0 4px rgba(0, 179, 155, 0.14);
}
.install-card {
  margin: 26px 16px 0;
  padding: 24px 20px;
  text-align: center;
}
.install-icon {
  width: 58px;
  height: 58px;
  margin: 0 auto 14px;
  border-radius: 18px;
  background: rgba(0, 218, 192, 0.13);
  color: var(--ceru-brand);
  display: grid;
  place-items: center;
  font-size: 28px;
}
.install-card h2 {
  font-size: 20px;
  margin: 0;
  letter-spacing: -0.02em;
}
.install-card p {
  color: var(--ceru-text-secondary);
  line-height: 1.6;
  font-size: 13px;
  margin: 10px 0 18px;
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
.plugin-section-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 16px 6px;
  scrollbar-width: none;
}
.plugin-section-row::-webkit-scrollbar {
  display: none;
}
.plugin-section-card {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 260px;
  padding: 12px;
  border-radius: 16px;
  color: var(--ceru-text);
  text-align: left;
}
.plugin-section-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--ceru-brand);
  background: rgba(0, 218, 192, 0.1);
  font-size: 20px;
  flex: 0 0 auto;
}
.plugin-section-copy {
  flex: 1;
  min-width: 0;
}
.plugin-section-copy strong,
.plugin-section-copy small {
  display: block;
}
.plugin-section-copy strong {
  font-size: 13px;
}
.plugin-section-copy small {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.horizontal-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 0 16px 4px;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
}
.horizontal-list::-webkit-scrollbar {
  display: none;
}
.collection-card {
  flex: 0 0 148px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: var(--ceru-text);
  scroll-snap-align: start;
}
.collection-meta {
  margin-top: 8px;
}
.collection-title {
  font-size: 13px;
  font-weight: 650;
}
.collection-sub {
  font-size: 11px;
  color: var(--ceru-text-secondary);
  margin-top: 3px;
}
.category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.category-card {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 16px;
  background: var(--ceru-bg-elevated);
  padding: 10px;
  color: var(--ceru-text);
  text-align: left;
  min-width: 0;
}
.category-copy {
  min-width: 0;
  flex: 1;
}
.category-title {
  font-size: 13px;
  font-weight: 650;
}
.category-sub {
  font-size: 11px;
  color: var(--ceru-text-secondary);
  margin-top: 3px;
}
.category-card ion-icon {
  color: var(--ceru-text-secondary);
  flex: 0 0 auto;
}
.list-block {
  margin: 0 8px;
}
.bottom-space {
  height: 150px;
}
.empty-title {
  font-weight: 700;
  color: var(--ceru-text);
}
.empty-desc {
  max-width: 260px;
  line-height: 1.55;
  font-size: 13px;
}
@media (min-width: 700px) {
  .category-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .plugin-section-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 16px 6px;
  scrollbar-width: none;
}
.plugin-section-row::-webkit-scrollbar {
  display: none;
}
.plugin-section-card {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 260px;
  padding: 12px;
  border-radius: 16px;
  color: var(--ceru-text);
  text-align: left;
}
.plugin-section-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--ceru-brand);
  background: rgba(0, 218, 192, 0.1);
  font-size: 20px;
  flex: 0 0 auto;
}
.plugin-section-copy {
  flex: 1;
  min-width: 0;
}
.plugin-section-copy strong,
.plugin-section-copy small {
  display: block;
}
.plugin-section-copy strong {
  font-size: 13px;
}
.plugin-section-copy small {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.horizontal-list {
    padding-left: 24px;
    padding-right: 24px;
  }
}
</style>
