<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>设置</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="settings-head ceru-pad">
        <p class="eyebrow">CERU MUSIC</p>
        <h1 class="ceru-title">按你的方式听</h1>
        <p class="head-sub">插件、音质、外观与本地数据都保存在这台设备上。</p>
      </div>

      <ion-list class="group">
        <div class="group-title">账号与社区</div>
        <ion-item button detail @click="$router.push('/account')">
          <ion-icon slot="start" :icon="personCircleOutline" color="primary" />
          <ion-label>
            <h2>账号</h2>
            <p>{{ auth.authenticated ? auth.displayName : '登录 Ceru 账号，同步个人资料' }}</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/notifications')">
          <ion-icon slot="start" :icon="notificationsOutline" color="primary" />
          <ion-label>
            <h2>消息通知</h2>
            <p>{{ notifications.counts.all ? notifications.counts.all + ' 条未读' : '点赞、回复和系统通知' }}</p>
          </ion-label>
          <ion-badge v-if="notifications.counts.all" color="danger">{{ notifications.counts.all > 99 ? '99+' : notifications.counts.all }}</ion-badge>
        </ion-item>
        <ion-item v-if="auth.authenticated">
          <ion-icon slot="start" :icon="cloudDoneOutline" color="primary" />
          <ion-label>
            <h2>云端设置同步</h2>
            <p>{{ syncStatusText }}</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.cloudSyncEnabled"
            @ionChange="settings.settings.cloudSyncEnabled = $event.detail.checked"
          />
        </ion-item>
        <ion-item v-if="auth.authenticated" button :disabled="settingsSyncState.status === 'checking' || settingsSyncState.status === 'uploading'" @click="syncNow">
          <ion-icon slot="start" :icon="syncOutline" color="primary" />
          <ion-label>
            <h2>立即同步设置</h2>
            <p>主题、音质、下载偏好与播放模式</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/community')">
          <ion-icon slot="start" :icon="peopleOutline" color="primary" />
          <ion-label>
            <h2>社区</h2>
            <p>分享音乐、图片与此刻的心情</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/listen-together')">
          <ion-icon slot="start" :icon="headsetOutline" color="primary" />
          <ion-label>
            <h2>一起听</h2>
            <p>创建或加入房间，同步播放、聊天与点歌</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">音源与插件</div>

        <ion-item button detail @click="$router.push('/tabs/plugins')">
          <ion-icon slot="start" :icon="extensionPuzzleOutline" color="primary" />
          <ion-label>
            <h2>插件管理</h2>
            <p>{{ pluginStore.enabledPlugins.length }} 个已启用 · {{ pluginStore.plugins.length }} 个已安装</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="syncOutline" color="primary" />
          <ion-label>
            <h2>自动更新插件</h2>
            <p>启动时检查有来源 URL 的插件并安装新版本</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.autoUpdatePlugins"
            @ionChange="settings.settings.autoUpdatePlugins = $event.detail.checked"
          />
        </ion-item>
        <ion-item button :disabled="checkingUpdates || !pluginStore.plugins.some((plugin) => plugin.sourceUrl)" @click="checkPluginUpdates">
          <ion-icon slot="start" :icon="cloudDownloadOutline" color="primary" />
          <ion-label>
            <h2>{{ checkingUpdates ? '正在检查…' : '立即检查插件更新' }}</h2>
            <p>{{ pluginStore.plugins.filter((plugin) => plugin.sourceUrl).length }} 个插件可检查</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="pluginStore.sources.length" button detail @click="openSourceRouting">
          <ion-icon slot="start" :icon="gitNetworkOutline" color="primary" />
          <ion-label>
            <h2>音源实现</h2>
            <p>为相同来源选择由哪个插件提供</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">播放</div>
        <ion-item>
          <ion-icon slot="start" :icon="sparklesOutline" color="primary" />
          <ion-label>
            <h2>首选音质</h2>
            <p>插件支持时优先使用</p>
          </ion-label>
          <ion-select v-model="settings.settings.preferredQuality" interface="action-sheet" cancel-text="取消">
            <ion-select-option value="">自动（最高）</ion-select-option>
            <ion-select-option value="128k">128k</ion-select-option>
            <ion-select-option value="320k">320k</ion-select-option>
            <ion-select-option value="flac">FLAC</ion-select-option>
            <ion-select-option value="hires">Hi-Res</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="volumeHighOutline" color="primary" />
          <ion-label>
            <h2>播放音量</h2>
            <p>{{ Math.round(player.volume * 100) }}%</p>
          </ion-label>
          <ion-range
            :value="player.volume"
            :min="0"
            :max="1"
            :step="0.01"
            @ionInput="player.setVolume(Number($event.detail.value))"
          />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="speedometerOutline" color="primary" />
          <ion-label>
            <h2>播放速度</h2>
            <p>当前 {{ player.playbackRate }}×</p>
          </ion-label>
          <ion-select
            :value="player.playbackRate"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="setPlaybackRate($event.detail.value)"
          >
            <ion-select-option :value="0.5">0.5×</ion-select-option>
            <ion-select-option :value="0.75">0.75×</ion-select-option>
            <ion-select-option :value="1">1×（正常）</ion-select-option>
            <ion-select-option :value="1.25">1.25×</ion-select-option>
            <ion-select-option :value="1.5">1.5×</ion-select-option>
            <ion-select-option :value="2">2×</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="moonOutline" color="primary" />
          <ion-label>
            <h2>睡眠定时</h2>
            <p>{{ sleepLabel }}</p>
          </ion-label>
          <ion-select
            :value="settings.settings.sleepTimerMinutes ?? 0"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="setSleep($event.detail.value)"
          >
            <ion-select-option :value="0">关闭</ion-select-option>
            <ion-select-option :value="15">15 分钟</ion-select-option>
            <ion-select-option :value="30">30 分钟</ion-select-option>
            <ion-select-option :value="60">60 分钟</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">下载与存储</div>
        <ion-item>
          <ion-icon slot="start" :icon="cloudDownloadOutline" color="primary" />
          <ion-label>
            <h2>下载音质</h2>
            <p>下载队列会使用该音质请求插件</p>
          </ion-label>
          <ion-select v-model="settings.settings.downloadQuality" interface="action-sheet" cancel-text="取消">
            <ion-select-option value="">跟随首选音质</ion-select-option>
            <ion-select-option value="128k">128k</ion-select-option>
            <ion-select-option value="320k">320k</ion-select-option>
            <ion-select-option value="flac">FLAC</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="layersOutline" color="primary" />
          <ion-label>
            <h2>同时下载</h2>
            <p>最多 {{ settings.settings.maxConcurrentDownloads }} 个任务</p>
          </ion-label>
          <ion-range
            :value="settings.settings.maxConcurrentDownloads"
            :min="1"
            :max="4"
            :step="1"
            @ionInput="settings.settings.maxConcurrentDownloads = Number($event.detail.value)"
          />
        </ion-item>
        <ion-item button detail @click="$router.push('/downloads')">
          <ion-icon slot="start" :icon="downloadOutline" color="primary" />
          <ion-label>
            <h2>下载管理</h2>
            <p>{{ downloadStore.tasks.length }} 个任务 · {{ downloadStore.completed.length }} 个已完成</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="clearDownloads">
          <ion-icon slot="start" :icon="trashOutline" color="danger" />
          <ion-label color="danger">
            <h2>清除已完成下载</h2>
            <p>同时删除应用内下载文件</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="editFilenameTemplate">
          <ion-icon slot="start" :icon="documentTextOutline" color="primary" />
          <ion-label>
            <h2>下载文件名</h2>
            <p>{{ settings.settings.downloadFilenameTemplate }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="pricetagOutline" color="primary" />
          <ion-label>
            <h2>写入 MP3 标签</h2>
            <p>下载完成后写入标题、艺术家和专辑</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.downloadWriteTags"
            @ionChange="settings.settings.downloadWriteTags = $event.detail.checked"
          />
        </ion-item>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">本地音乐</div>
        <ion-item button @click="scanLocal">
          <ion-icon slot="start" :icon="folderOpenOutline" color="primary" />
          <ion-label>
            <h2>扫描 Documents 目录</h2>
            <p>识别放入应用文档目录的音频文件，自动去重</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">外观</div>
        <ion-item>
          <ion-icon slot="start" :icon="colorPaletteOutline" color="primary" />
          <ion-label>
            <h2>主题</h2>
            <p>跟随系统，或固定浅色 / 深色</p>
          </ion-label>
          <ion-segment :value="settings.settings.theme" @ionChange="setTheme($event.detail.value)">
            <ion-segment-button value="system"><ion-label>系统</ion-label></ion-segment-button>
            <ion-segment-button value="light"><ion-label>浅色</ion-label></ion-segment-button>
            <ion-segment-button value="dark"><ion-label>深色</ion-label></ion-segment-button>
          </ion-segment>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="colorWandOutline" color="primary" />
          <ion-label>
            <h2>强调色</h2>
            <p>用于按钮、进度与高亮</p>
          </ion-label>
        </ion-item>
        <div class="accent-row">
          <button
            v-for="color in accents"
            :key="color"
            class="accent-dot"
            :class="{ active: settings.settings.accent === color }"
            :style="{ background: color }"
            type="button"
            @click="settings.settings.accent = color"
          />
        </div>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">工具</div>
        <ion-item button detail @click="$router.push('/ai')">
          <ion-icon slot="start" :icon="sparklesOutline" color="primary" />
          <ion-label>
            <h2>AI 音乐助手</h2>
            <p>推荐音乐、分析歌曲与生成歌单建议</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/recognize')">
          <ion-icon slot="start" :icon="micOutline" color="primary" />
          <ion-label>
            <h2>听歌识曲</h2>
            <p>录制或上传音频，由插件识别歌曲</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/playlist-converter')">
          <ion-icon slot="start" :icon="swapHorizontalOutline" color="primary" />
          <ion-label>
            <h2>歌单转换器</h2>
            <p>把 JSON / LXMC 歌单转换为 .cpl</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list class="group">
        <div class="group-title">关于</div>
        <ion-item>
          <ion-icon slot="start" :icon="informationCircleOutline" color="primary" />
          <ion-label>
            <h2>澜音 Ceru Music</h2>
            <p>移动端 v{{ version }} · iOS 14+ / Android arm64</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="openLink('https://github.com/timeshiftsauce/CeruMusic')">
          <ion-icon slot="start" :icon="logoGithub" color="primary" />
          <ion-label>
            <h2>项目主页</h2>
            <p>源代码与 AGPL-3.0 许可证</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="openLink('https://ceru.docs.shiqianjiang.cn')">
          <ion-icon slot="start" :icon="bookOutline" color="primary" />
          <ion-label>
            <h2>插件文档</h2>
            <p>了解 Ceru v2 插件协议</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="showLegal">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" color="primary" />
          <ion-label>
            <h2>法律与隐私</h2>
            <p>应用不内置音乐源，不存储或分发音乐文件</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <p class="version-note">
        桌面端专属功能（桌面歌词、全局快捷键、托盘、DLNA、系统音频采集）已替换为移动端能力：
        后台播放、锁屏控制、文件导入与系统分享。
      </p>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import {
  bookOutline,
  cloudDownloadOutline,
  documentTextOutline,
  folderOpenOutline,
  colorPaletteOutline,
  cloudDoneOutline,
  colorWandOutline,
  downloadOutline,
  extensionPuzzleOutline,
  gitNetworkOutline,
  headsetOutline,
  informationCircleOutline,
  layersOutline,
  notificationsOutline,
  peopleOutline,
  personCircleOutline,
  logoGithub,
  micOutline,
  moonOutline,
  pricetagOutline,
  shieldCheckmarkOutline,
  speedometerOutline,
  sparklesOutline,
  swapHorizontalOutline,
  syncOutline,
  trashOutline,
  volumeHighOutline
} from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { useSettingsStore } from '@/stores/settings'
import { usePluginStore } from '@/stores/plugins'
import { usePlayerStore } from '@/stores/player'
import { useDownloadStore } from '@/stores/downloads'
import { useLibraryStore } from '@/stores/library'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { checkCloudSettings, settingsSyncState } from '@/services/settingsSync'
import { findPluginUpdates, installPluginUpdate } from '@/services/pluginUpdates'

const settings = useSettingsStore()
const pluginStore = usePluginStore()
const player = usePlayerStore()
const downloadStore = useDownloadStore()
const library = useLibraryStore()
const auth = useAuthStore()
const notifications = useNotificationsStore()

watch(() => auth.authenticated, (value) => { if (value) void notifications.refreshCounts() }, { immediate: true })
const version = __APP_VERSION__
const accents = ['#00b39b', '#00dac0', '#4f7cff', '#a259ff', '#ff7a45', '#ff5470']

const checkingUpdates = ref(false)

const syncStatusText = computed(() => {
  const status = settingsSyncState.status
  if (status === 'checking') return '正在检查云端设置…'
  if (status === 'uploading') return '正在上传本机设置…'
  if (status === 'downloading') return '正在应用云端设置…'
  if (status === 'error') return settingsSyncState.message || '同步失败'
  if (!settings.settings.cloudSyncEnabled) return '已关闭自动同步'
  if (settingsSyncState.lastSync) return '上次同步：' + new Date(settingsSyncState.lastSync).toLocaleString()
  return '登录后自动同步'
})

async function syncNow() {
  const ok = await checkCloudSettings(true)
  await toast(ok ? '设置已同步' : settingsSyncState.message || '同步失败', ok ? 'success' : 'danger')
}

const sleepLabel = computed(() => {
  if (!player.sleepRemainingMs) return '关闭'
  const minutes = Math.ceil(player.sleepRemainingMs / 60000)
  return `约 ${minutes} 分钟后暂停`
})

function setTheme(value: any) {
  if (value === 'system' || value === 'light' || value === 'dark') settings.setTheme(value)
}

function setSleep(value: any) {
  const minutes = Number(value) || 0
  player.setSleepTimer(minutes > 0 ? minutes : null)
}

function setPlaybackRate(value: any) {
  player.setPlaybackRate(Number(value) || 1)
}

async function editFilenameTemplate() {
  const alert = await alertController.create({
    header: '下载文件名模板',
    message: '可用变量：{title} {artist} {album} {quality} {ext}',
    inputs: [
      {
        name: 'template',
        type: 'text',
        value: settings.settings.downloadFilenameTemplate
      }
    ],
    buttons: [
      {
        text: '恢复默认',
        handler: () => {
          settings.settings.downloadFilenameTemplate = '{artist} - {title}'
        }
      },
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const template = String(data?.values?.template ?? '').trim()
  if (template) settings.settings.downloadFilenameTemplate = template
}

async function scanLocal() {
  try {
    const records = await library.scanLocalMusic()
    await toast(records.length ? `已导入 ${records.length} 首本地歌曲` : '没有发现新的音频文件')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function checkPluginUpdates() {
  if (checkingUpdates.value) return
  checkingUpdates.value = true
  try {
    const updates = await findPluginUpdates()
    if (!updates.length) {
      await toast('所有插件都是最新版本')
      return
    }
    const alert = await alertController.create({
      header: '发现插件更新',
      message: updates
        .map((item) => item.name + '：' + item.currentVersion + ' → ' + item.version)
        .join('\n'),
      buttons: [
        { text: '稍后', role: 'cancel' },
        { text: '全部更新', role: 'confirm' }
      ]
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    if (role !== 'confirm') return
    for (const update of updates) await installPluginUpdate(update)
    await toast('插件已更新')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '检查更新失败', 'danger')
  } finally {
    checkingUpdates.value = false
  }
}

async function openSourceRouting() {
  const sheet = await actionSheetController.create({
    header: '音源实现',
    buttons: [
      ...pluginStore.sources.map((source) => ({
        text: `${source.name}${source.implementations.length > 1 ? ` (${source.implementations.length})` : ''}`,
        handler: () => {
          void chooseImplementation(source)
        }
      })),
      { text: '关闭', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function chooseImplementation(source: any) {
  const sheet = await actionSheetController.create({
    header: source.name,
    buttons: [
      ...source.implementations.map((implementation: any) => ({
        text: implementation.pluginName,
        handler: () => {
          settings.setProviderOwner(source.id, implementation.pluginKey)
          void toast('已切换音源实现')
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function clearDownloads() {
  const alert = await alertController.create({
    header: '清除已完成下载？',
    message: '应用内下载文件会被删除，历史记录中的歌曲不会删除。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '清除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  await downloadStore.clearCompleted()
  await toast('已清除')
}

async function openLink(url: string) {
  await Browser.open({ url })
}

async function showLegal() {
  const alert = await alertController.create({
    header: '法律与隐私',
    message:
      '澜音仅提供插件运行框架与播放功能，不存储、提供或分发任何音乐源文件。插件由第三方提供，使用前请确认你有权访问相应服务。本地数据保存在设备内。',
    buttons: ['知道了']
  })
  await alert.present()
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 1800, color })
  await element.present()
}
</script>

<style scoped>
.settings-head {
  padding-top: 16px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.head-sub {
  margin: 10px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.group {
  margin-top: 22px;
  --ion-item-background: var(--ceru-bg-elevated);
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
}
.group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ceru-text-secondary);
  letter-spacing: 0.04em;
  padding: 0 18px 8px;
}
ion-item h2 {
  font-size: 15px;
  font-weight: 650;
}
ion-item p {
  font-size: 12px;
  color: var(--ceru-text-secondary);
  margin-top: 3px;
}
ion-select {
  max-width: 48%;
  font-size: 13px;
}
ion-range {
  max-width: 46%;
  padding-left: 12px;
}
ion-segment {
  max-width: 58%;
}
.accent-row {
  display: flex;
  gap: 14px;
  padding: 12px 20px 18px;
  background: var(--ceru-bg-elevated);
}
.accent-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid transparent;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}
.accent-dot.active {
  border-color: var(--ceru-bg-elevated);
  outline: 2px solid var(--ceru-text);
}
.version-note {
  padding: 22px 20px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.65;
}
.bottom-space {
  height: 140px;
}
</style>
