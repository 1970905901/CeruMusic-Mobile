<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/plugins" text="" />
        </ion-buttons>
        <ion-title>插件详情</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="plugin" fill="clear" @click="openMoreMenu">
            <ion-icon slot="icon-only" :icon="ellipsisHorizontal" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <template v-if="plugin">
        <div class="hero ceru-pad">
          <div class="plugin-icon">
            <ion-icon :icon="extensionPuzzleOutline" />
          </div>
          <div class="hero-copy">
            <h1 class="plugin-name">{{ plugin.manifest.name }}</h1>
            <p class="plugin-line">
              v{{ plugin.manifest.version }} · {{ plugin.manifest.author || '未知作者' }}
              <span v-if="plugin.signatureStatus === 'unsigned'"> · 未签名</span>
            </p>
            <p v-if="plugin.manifest.description" class="plugin-desc">{{ plugin.manifest.description }}</p>
          </div>
          <ion-toggle :checked="plugin.enabled" @ionChange="toggleEnabled($event.detail.checked)" />
        </div>

        <p v-if="plugin.lastError" class="error-box">{{ plugin.lastError }}</p>

        <ion-list class="group">
          <div class="group-title">基本信息</div>
          <ion-item>
            <ion-label>插件 ID</ion-label>
            <ion-note slot="end">{{ plugin.manifest.id }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>文件</ion-label>
            <ion-note slot="end">{{ plugin.fileName }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>运行时</ion-label>
            <ion-note slot="end">{{ runtimeLabel }}</ion-note>
          </ion-item>
          <ion-item v-if="plugin.sourceUrl" button @click="openExternal(plugin.sourceUrl)">
            <ion-label>来源 URL</ion-label>
            <ion-note slot="end">打开</ion-note>
          </ion-item>
        </ion-list>

        <ion-list class="group">
          <div class="group-title">音源</div>
          <ion-item v-for="provider in plugin.manifest.contributes?.providers || []" :key="provider.id">
            <ion-label>
              <h2>{{ provider.name }}</h2>
              <p>{{ provider.id }} · {{ (provider.protocols || []).join(', ') }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="!(plugin.manifest.contributes?.providers || []).length">
            <ion-label color="medium">该插件没有声明音源 Provider</ion-label>
          </ion-item>
        </ion-list>

        <ion-list v-if="configFields.length" class="group">
          <div class="group-title">配置</div>
          <ion-item v-for="field in configFields" :key="field.key">
            <ion-label position="stacked">
              {{ field.key }}
              <p v-if="field.hint" class="field-hint">{{ field.hint }}</p>
            </ion-label>
            <ion-toggle
              v-if="field.type === 'boolean'"
              :checked="!!configModel[field.key]"
              @ionChange="configModel[field.key] = $event.detail.checked"
            />
            <ion-input
              v-else-if="field.type === 'number'"
              type="number"
              :value="configModel[field.key]"
              @ionInput="configModel[field.key] = Number($event.detail.value)"
            />
            <ion-input
              v-else-if="field.type === 'string'"
              :type="field.secret ? 'password' : 'text'"
              :value="configModel[field.key]"
              @ionInput="configModel[field.key] = $event.detail.value"
            />
            <ion-textarea
              v-else
              :value="stringify(configModel[field.key])"
              auto-grow
              @ionChange="configModel[field.key] = parseJson($event.detail.value)"
            />
          </ion-item>
          <ion-item>
            <ion-button expand="block" @click="saveConfig">保存配置</ion-button>
          </ion-item>
        </ion-list>

        <ion-list class="group">
          <div class="group-title">权限</div>
          <ion-item v-for="permission in plugin.manifest.permissions || []" :key="permission.key">
            <ion-label>
              <h2>{{ permission.key }}</h2>
              <p>{{ permission.name }} · {{ permission.reason }}</p>
            </ion-label>
            <ion-badge slot="end" :color="settings.isPermissionGranted(plugin?.key || '', permission.key) ? 'success' : settings.isPermissionDenied(plugin?.key || '', permission.key) ? 'danger' : 'medium'">
              {{ settings.isPermissionGranted(plugin.key, permission.key) ? '已允许' : settings.isPermissionDenied(plugin.key, permission.key) ? '已拒绝' : '未询问' }}
            </ion-badge>
          </ion-item>
          <ion-item v-if="!(plugin.manifest.permissions || []).length">
            <ion-label color="medium">该插件没有声明额外权限</ion-label>
          </ion-item>
          <ion-item v-if="plugin.manifest.permissions?.length">
            <ion-button fill="outline" size="small" @click="grantAll">全部允许</ion-button>
            <ion-button fill="clear" size="small" color="danger" @click="resetPermissions">清除授权</ion-button>
          </ion-item>
        </ion-list>

        <ion-list v-if="commands.length" class="group">
          <div class="group-title">插件命令</div>
          <ion-item v-for="command in commands" :key="command.id" button @click="runCommand(command)">
            <ion-label>
              <h2>{{ command.title }}</h2>
              <p v-if="command.description">{{ command.description }}</p>
            </ion-label>
            <ion-icon slot="end" :icon="playCircleOutline" />
          </ion-item>
        </ion-list>

        <ion-list v-if="settingsPages.length" class="group">
          <div class="group-title">插件页面</div>
          <ion-item v-for="page in settingsPages" :key="page.id">
            <ion-label>
              <h2>{{ page.title }}</h2>
              <p>该 v2 插件页面已声明，移动端配置表单可覆盖常用设置</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list v-if="logs.length" class="group">
          <div class="group-title">最近日志</div>
          <ion-item v-for="log in logs.slice(0, 20)" :key="log.at + log.message">
            <ion-label>
              <p class="log-line">
                <span class="log-level">{{ log.level }}</span>
                {{ log.message }}
              </p>
            </ion-label>
          </ion-item>
        </ion-list>

        <div class="danger-zone ceru-pad">
          <ion-button expand="block" color="danger" fill="outline" @click="confirmRemove">
            卸载插件
          </ion-button>
          <p>卸载会停止插件并删除其插件级存储，不会删除已下载的音乐文件。</p>
        </div>
      </template>

      <EmptyState v-else title="插件不存在" description="它可能已被卸载。" :icon="extensionPuzzleOutline" />

      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import {
  ellipsisHorizontal,
  extensionPuzzleOutline,
  playCircleOutline
} from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import { usePluginStore } from '@/stores/plugins'
import { useSettingsStore } from '@/stores/settings'
import type { PluginRecord } from '@/types/plugin'

const route = useRoute()
const router = useRouter()
const pluginStore = usePluginStore()
const settings = useSettingsStore()
const key = String(route.params.key || '')
const plugin = computed<PluginRecord | undefined>(() => pluginStore.plugins.find((item) => item.key === key))
const configModel = ref<Record<string, any>>({})

const runtimeLabel = computed(() => {
  const info = pluginStore.runtimeInfo[key]
  return info ? '已激活' : plugin.value?.enabled ? '未激活' : '已停用'
})
const commands = computed(() => plugin.value?.manifest.contributes?.commands || [])
const settingsPages = computed(() => plugin.value?.manifest.contributes?.settingsPages || [])
const logs = computed(() => pluginStore.logs.filter((item) => item.pluginKey === key))

const configFields = computed(() => {
  const config = plugin.value?.manifest.config
  if (!config || typeof config !== 'object' || Array.isArray(config)) return []
  return Object.entries(config).map(([fieldKey, value]) => {
    const type =
      typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'string'
            ? 'string'
            : 'json'
    return {
      key: fieldKey,
      type,
      secret: /password|token|secret|key|credential/i.test(fieldKey),
      hint: type === 'json' ? '请输入合法 JSON' : ''
    }
  })
})

function stringify(value: any): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? '')
  }
}

function parseJson(value: any): any {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

async function loadConfig() {
  if (!plugin.value) return
  configModel.value = await pluginStore.loadConfig(plugin.value.key)
}

watch(
  () => plugin.value?.key,
  () => void loadConfig(),
  { immediate: true }
)

async function toggleEnabled(enabled: boolean) {
  if (!plugin.value) return
  try {
    await pluginStore.setEnabled(plugin.value.key, enabled)
    await toast(enabled ? '插件已启用' : '插件已停用')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function saveConfig() {
  if (!plugin.value) return
  try {
    await pluginStore.saveConfig(plugin.value.key, configModel.value)
    await toast('配置已保存，插件已重启')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

function grantAll() {
  if (!plugin.value) return
  for (const permission of plugin.value.manifest.permissions || []) {
    settings.grantPermission(plugin.value.key, permission.key)
  }
  void toast('已允许全部权限')
}

function resetPermissions() {
  if (!plugin.value) return
  settings.resetPermissions(plugin.value.key)
  void toast('已清除授权，下次使用时重新询问')
}

async function runCommand(command: any) {
  if (!plugin.value) return
  try {
    const result = await pluginStore.invokeAction(plugin.value.key, command.action, {})
    if (result === null || result === undefined) {
      await toast('命令已执行')
    } else {
      const alert = await alertController.create({
        header: command.title,
        message: JSON.stringify(result, null, 2),
        buttons: ['确定']
      })
      await alert.present()
    }
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function openExternal(url?: string) {
  if (!url) return
  await Browser.open({ url })
}

async function openMoreMenu() {
  if (!plugin.value) return
  const sheet = await actionSheetController.create({
    header: plugin.value.manifest.name,
    buttons: [
      {
        text: '检查更新 URL',
        handler: () => {
          void updateFromUrl()
        }
      },
      {
        text: '复制插件 ID',
        handler: () => {
          void navigator.clipboard?.writeText(plugin.value?.manifest.id || '')
          void toast('已复制')
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function updateFromUrl() {
  if (!plugin.value) return
  try {
    await pluginStore.updateFromUrl(plugin.value.key)
    await toast('插件已更新')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function confirmRemove() {
  if (!plugin.value) return
  const alert = await alertController.create({
    header: '卸载插件？',
    message: '插件将停止运行，配置与插件级存储会被删除。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '卸载', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  await pluginStore.remove(plugin.value.key)
  await router.replace('/tabs/plugins')
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2100, color })
  await element.present()
}
</script>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 18px;
}
.plugin-icon {
  width: 64px;
  height: 64px;
  border-radius: 19px;
  background: rgba(0, 218, 192, 0.12);
  color: var(--ceru-brand);
  display: grid;
  place-items: center;
  font-size: 31px;
  flex: 0 0 auto;
}
.hero-copy {
  min-width: 0;
  flex: 1;
}
.plugin-name {
  margin: 0;
  font-size: 23px;
  letter-spacing: -0.03em;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plugin-line {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.plugin-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ceru-text-secondary);
  line-height: 1.5;
}
.error-box {
  margin: 16px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
}
.group {
  margin-top: 20px;
  --ion-item-background: var(--ceru-bg-elevated);
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
}
.group-title {
  padding: 0 18px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ceru-text-secondary);
}
ion-item h2 {
  font-size: 14px;
  font-weight: 650;
}
ion-item p {
  font-size: 11px;
  color: var(--ceru-text-secondary);
  line-height: 1.45;
  margin-top: 3px;
}
.field-hint {
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.log-line {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  white-space: break-spaces;
}
.log-level {
  color: var(--ceru-brand);
  text-transform: uppercase;
  font-weight: 700;
  margin-right: 6px;
}
.danger-zone {
  margin-top: 26px;
}
.danger-zone p {
  margin: 10px 0 0;
  font-size: 10px;
  color: var(--ceru-text-secondary);
  line-height: 1.5;
}
.bottom-space {
  height: 140px;
}
</style>
