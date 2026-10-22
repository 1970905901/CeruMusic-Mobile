<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>插件管理</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" aria-label="添加插件" @click="importMenu">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="head ceru-pad">
        <p class="eyebrow">CERU PLUGINS</p>
        <h1 class="ceru-title">音源插件</h1>
        <p class="head-sub">
          插件在隔离 Worker 中运行。每个网络与文件权限会在首次使用时询问。
        </p>
        <div class="head-actions">
          <ion-button @click="pickPlugin">
            <ion-icon slot="start" :icon="documentAttachOutline" />
            导入文件
          </ion-button>
          <ion-button fill="outline" @click="importFromUrl">
            <ion-icon slot="start" :icon="linkOutline" />
            从 URL
          </ion-button>
        </div>
      </div>

      <div v-if="pluginStore.plugins.length" class="plugin-filter ceru-pad">
        <ion-searchbar
          v-model="pluginQuery"
          placeholder="搜索插件名称、作者或音源"
          :debounce="150"
          class="plugin-search"
        />
        <ion-segment :value="pluginStatus" @ionChange="setPluginStatus($event.detail.value)">
          <ion-segment-button value="all">全部</ion-segment-button>
          <ion-segment-button value="enabled">已启用</ion-segment-button>
          <ion-segment-button value="disabled">已禁用</ion-segment-button>
        </ion-segment>
      </div>

      <div v-if="pluginStore.plugins.length && !filteredPlugins.length" class="ceru-pad">
        <EmptyState
          title="没有匹配的插件"
          description="换个关键词，或清除筛选查看全部插件。"
          :icon="extensionPuzzleOutline"
        >
          <ion-button @click="clearPluginFilter">清除筛选</ion-button>
        </EmptyState>
      </div>

      <div v-if="filteredPlugins.length" class="plugin-list ceru-pad">
        <div
          v-for="plugin in filteredPlugins"
          :key="plugin.key"
          class="plugin-card ceru-card"
          role="button"
          tabindex="0"
          @click="openPlugin(plugin.key)"
          @keyup.enter="openPlugin(plugin.key)"
        >
          <div class="plugin-icon">
            <ion-icon :icon="extensionPuzzleOutline" />
          </div>
          <div class="plugin-copy">
            <div class="plugin-title-row">
              <strong class="ceru-truncate">{{ plugin.manifest.name }}</strong>
              <span class="version">v{{ plugin.manifest.version }}</span>
            </div>
            <p class="plugin-desc ceru-truncate">
              {{ plugin.manifest.description || plugin.manifest.author || plugin.fileName }}
            </p>
            <div v-if="sourceSummary(plugin.manifest).total" class="plugin-source-tags">
              <span
                v-for="tag in sourceSummary(plugin.manifest).tags"
                :key="tag.id"
                class="plugin-source-tag"
              >
                {{ tag.name }}
              </span>
              <span v-if="sourceSummary(plugin.manifest).overflow" class="plugin-source-tag more">
                +{{ sourceSummary(plugin.manifest).overflow }}
              </span>
            </div>
            <div class="plugin-meta">
              <span>{{ plugin.manifest.contributes?.providers?.length || 0 }} 个音源</span>
              <span v-if="plugin.manifest.permissions?.length">{{ plugin.manifest.permissions.length }} 项权限</span>
              <span v-if="plugin.lastError" class="plugin-error">运行失败</span>
            </div>
          </div>
          <div class="plugin-tail" @click.stop>
            <ion-toggle
              :checked="plugin.enabled"
              :disabled="pluginStore.importing"
              @ionChange="togglePlugin(plugin, $event.detail.checked)"
            />
            <ion-icon :icon="chevronForward" class="chevron" />
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        title="还没有安装插件"
        description="Ceru 移动端不内置音乐源。导入可信的 v2 plugin.js 后即可开始。"
        :icon="extensionPuzzleOutline"
      >
        <ion-button @click="pickPlugin">导入插件文件</ion-button>
      </EmptyState>

      <p v-if="pluginStore.error" class="error">{{ pluginStore.error }}</p>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  toastController
} from '@ionic/vue'
import {
  addOutline,
  chevronForward,
  documentAttachOutline,
  extensionPuzzleOutline,
  linkOutline
} from 'ionicons/icons'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import { usePluginStore } from '@/stores/plugins'
import type { PluginRecord } from '@/types/plugin'
import { summarizePluginSources } from '@/services/pluginSources'
import { filterPlugins, type PluginStatusFilter } from '@/services/pluginFilter'

const router = useRouter()
const pluginStore = usePluginStore()
/** 插件支持的音源名标签（桌面版 plugins.vue 的 supportedSources）。 */
function sourceSummary(manifest: PluginRecord['manifest']) {
  return summarizePluginSources(manifest)
}

/** 插件搜索与状态筛选（桌面版 plugins.vue 的 filteredPlugins）。 */
const pluginQuery = ref('')
const pluginStatus = ref<PluginStatusFilter>('all')
const filteredPlugins = computed(() =>
  filterPlugins(pluginStore.plugins, pluginQuery.value, pluginStatus.value)
)

function clearPluginFilter() {
  pluginQuery.value = ''
  pluginStatus.value = 'all'
}

/** ion-segment 的值是宽泛类型，收敛成过滤器的三个合法取值。 */
function setPluginStatus(value: unknown) {
  pluginStatus.value =
    value === 'enabled' || value === 'disabled' ? (value as PluginStatusFilter) : 'all'
}

function openPlugin(key: string) {
  void router.push('/plugin/' + encodeURIComponent(key))
}

async function togglePlugin(plugin: PluginRecord, enabled: boolean) {
  try {
    await pluginStore.setEnabled(plugin.key, enabled)
    await toast(enabled ? '插件已启用' : '插件已停用')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

function pickPlugin() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.js,text/javascript,application/javascript'
  input.style.display = 'none'
  document.body.appendChild(input)
  input.onchange = async () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    try {
      const record = await pluginStore.importFromFile(file)
      await pluginStore.setEnabled(record.key, true)
      await toast('插件已安装并启用')
    } catch (error) {
      await toast(error instanceof Error ? error.message : String(error), 'danger')
    }
  }
  input.oncancel = () => input.remove()
  input.click()
}

async function importFromUrl() {
  const alert = await alertController.create({
    header: '从 URL 安装',
    message: '请输入指向 Ceru v2 plugin.js 的 HTTPS 地址。',
    inputs: [{ name: 'url', type: 'url', placeholder: 'https://example.com/plugin.js' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '安装', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  const url = String(data?.values?.url ?? '').trim()
  if (role !== 'confirm' || !url) return
  try {
    const record = await pluginStore.importFromUrl(url)
    await pluginStore.setEnabled(record.key, true)
    await toast('插件已安装并启用')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function importMenu() {
  const sheet = await alertController.create({
    header: '添加插件',
    message: '请选择导入方式。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '本地文件', handler: () => pickPlugin() },
      { text: '从 URL', handler: () => void importFromUrl() }
    ]
  })
  await sheet.present()
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}
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
  margin: 10px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.head-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.plugin-filter {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}
.plugin-search {
  --background: var(--ceru-card, rgba(255, 255, 255, 0.06));
  --border-radius: 12px;
  padding: 0;
}
.plugin-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}
.plugin-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--ceru-border);
  padding: 14px;
  text-align: left;
  color: var(--ceru-text);
  background: var(--ceru-bg-elevated);
  border-radius: 18px;
}
.plugin-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: rgba(0, 218, 192, 0.11);
  color: var(--ceru-brand);
  display: grid;
  place-items: center;
  font-size: 23px;
  flex: 0 0 auto;
}
.plugin-copy {
  min-width: 0;
  flex: 1;
}
.plugin-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.plugin-title-row strong {
  font-size: 15px;
}
.version {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--ceru-text-secondary);
}
.plugin-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.plugin-source-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.plugin-source-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 218, 192, 0.14);
  color: var(--ceru-accent, #00dac0);
  font-size: 10px;
  line-height: 1.6;
}
.plugin-source-tag.more {
  background: transparent;
  color: var(--ceru-text-secondary);
}
.plugin-meta {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  font-size: 10px;
  color: var(--ceru-text-secondary);
}
.plugin-error {
  color: var(--ceru-danger);
}
.plugin-tail {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.chevron {
  color: var(--ceru-text-secondary);
  font-size: 16px;
}
.error {
  color: var(--ceru-danger);
  font-size: 12px;
  padding: 14px 16px;
}
.bottom-space {
  height: 140px;
}
</style>
