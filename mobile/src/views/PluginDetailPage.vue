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
          <template v-for="group in permissionGroups" :key="group.id">
            <ion-item-divider class="permission-group-title">
              <ion-label>{{ group.title }}</ion-label>
              <ion-badge slot="end" :color="groupStatus(group) === 'granted' ? 'success' : groupStatus(group) === 'denied' ? 'danger' : 'medium'">
                {{ groupStatus(group) === 'granted' ? '已允许' : groupStatus(group) === 'denied' ? '已拒绝' : '未询问' }}
              </ion-badge>
            </ion-item-divider>
            <ion-item v-for="permission in group.permissions" :key="permission.key">
              <ion-label>
                <h2>{{ permission.label }}</h2>
                <p v-if="permission.reason">{{ permission.reason }}</p>
                <p v-else-if="permission.name">{{ permission.name }}</p>
              </ion-label>
            </ion-item>
          </template>
          <ion-item v-if="!permissionGroups.length">
            <ion-label color="medium">该插件没有声明额外权限</ion-label>
          </ion-item>
          <ion-item v-if="permissionGroups.length">
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

        <ion-list v-if="surfaces.length" class="group">
          <div class="group-title">插件页面</div>
          <ion-item v-for="surface in surfaces" :key="surface.id" button detail @click="openSurface(surface.id)">
            <ion-icon slot="start" :icon="albumsOutline" color="primary" />
            <ion-label>
              <h2>{{ surfaceTitle(surface) }}</h2>
              <p>{{ surfaceKindLabel(surface.kind) }} · {{ surface.id }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list v-if="settingsPages.length || accountItems.length" class="group">
          <div class="group-title">插件功能</div>
          <ion-item v-for="page in settingsPages" :key="'setting-' + page.id" button detail @click="openSurface(page.view)">
            <ion-icon slot="start" :icon="settingsOutline" color="primary" />
            <ion-label>
              <h2>{{ page.title }}</h2>
              <p>插件设置页面</p>
            </ion-label>
          </ion-item>
          <ion-item v-for="item in accountItems" :key="'account-' + item.id" button detail @click="openSurface(item.view)">
            <ion-icon slot="start" :icon="personCircleOutline" color="primary" />
            <ion-label>
              <h2>{{ item.title }}</h2>
              <p>插件账号</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list v-if="guestAdapters.length" class="group">
          <div class="group-title">兼容子插件</div>
          <ion-item v-for="adapter in guestAdapters" :key="adapter.id">
            <ion-label>
              <h2>{{ adapter.title }}</h2>
              <p>{{ adapter.format }} · {{ (adapter.extensions || []).join(', ') }}</p>
            </ion-label>
            <ion-button fill="outline" size="small" @click="importGuest(adapter.id)">导入</ion-button>
          </ion-item>
          <ion-item v-if="!guestRecords.length">
            <ion-label color="medium">尚未安装子插件</ion-label>
          </ion-item>
          <ion-item v-for="guest in guestRecords" :key="guest.id">
            <ion-label>
              <h2>{{ guest.name }} <span class="guest-version">v{{ guest.version }}</span></h2>
              <p>
                {{ guest.state === 'ready' ? '运行中' : guest.state === 'error' ? '运行失败' : '未运行' }}
                <span v-if="guest.providers.length"> · {{ guest.providers.map((item) => item.name).join(' / ') }}</span>
                <span v-if="guest.error"> · {{ guest.error }}</span>
              </p>
            </ion-label>
            <ion-toggle
              :checked="guest.selected"
              :disabled="guestsLoading"
              @ionChange="toggleGuest(guest, $event.detail.checked)"
            />
            <ion-button slot="end" fill="clear" size="small" color="danger" @click="removeGuest(guest)">删除</ion-button>
          </ion-item>
        </ion-list>

        <ion-list v-if="logs.length" class="group">
          <div class="group-title">最近日志</div>
          <!-- 日志是排障时唯一的一手信息：能整段复制出去，才谈得上贴给作者或贴到 issue -->
          <ion-item lines="none">
            <div class="log-actions">
              <ion-button size="small" fill="clear" @click="copyLogs">复制全部</ion-button>
              <ion-button size="small" fill="clear" color="danger" @click="clearLogs">清空</ion-button>
            </div>
          </ion-item>
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
import { Clipboard } from '@capacitor/clipboard'
import {
  ellipsisHorizontal,
  albumsOutline,
  extensionPuzzleOutline,
  personCircleOutline,
  playCircleOutline,
  settingsOutline
} from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import { usePluginStore } from '@/stores/plugins'
import { useSettingsStore } from '@/stores/settings'
import { guestStoreFor } from '@/services/plugin/guests'
import { groupPermissionDeclarations } from '@/services/plugin/permissions'
import { PERMISSION_GROUPS, permissionGroup } from '@shiqianjiang/ceru-plugin-sdk/permissions'
import type { GuestAdapterView, GuestRecord } from '@/types/plugin'
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

/**
 * 权限按 SDK 的授权组展示。
 *
 * 此前直接列 `key` 原文（`p-player`、`p-lib-2`），用户看不出是什么能力；
 * 同一组（读/改/删歌单）也被拆成三条互不相干的记录。桌面版同样按组展示。
 */
const permissionGroups = computed(() =>
  groupPermissionDeclarations(
    plugin.value?.manifest.permissions,
    (name) => permissionGroup(name as any),
    (id) => PERMISSION_GROUPS[id as keyof typeof PERMISSION_GROUPS]?.title
  )
)

/** 组状态：全部允许才算允许，任一拒绝即标红，其余为未询问。 */
function groupStatus(group: { permissions: Array<{ key: string }> }): 'granted' | 'denied' | 'prompt' {
  const key = plugin.value?.key || ''
  const states = group.permissions.map((permission) =>
    settings.isPermissionGranted(key, permission.key)
      ? 'granted'
      : settings.isPermissionDenied(key, permission.key)
        ? 'denied'
        : 'prompt'
  )
  if (states.some((state) => state === 'denied')) return 'denied'
  if (states.every((state) => state === 'granted')) return 'granted'
  return 'prompt'
}
const settingsPages = computed(() => plugin.value?.manifest.contributes?.settingsPages || [])
const accountItems = computed(() => plugin.value?.manifest.contributes?.accountItems || [])
const surfaces = computed(() => plugin.value?.manifest.modules?.surfaces || [])
const logs = computed(() => pluginStore.logs.filter((item) => item.pluginKey === key))
const guestAdapters = ref<GuestAdapterView[]>([])
const guestRecords = ref<GuestRecord[]>([])
const guestsLoading = ref(false)

async function refreshGuests() {
  if (!plugin.value) return
  const store = guestStoreFor(plugin.value, () => {
    void refreshGuests()
  })
  guestAdapters.value = store.adapters()
  guestRecords.value = await store.list()
}

async function importGuest(adapterId: string) {
  if (!plugin.value || guestsLoading.value) return
  const store = guestStoreFor(plugin.value)
  const file = await store.pickFile(adapterId)
  if (!file) return
  guestsLoading.value = true
  try {
    const record = await store.importFile(adapterId, file)
    if (record) await toast('子插件已安装')
    await refreshGuests()
  } catch (error) {
    await toast(error instanceof Error ? error.message : '子插件安装失败', 'danger')
  } finally {
    guestsLoading.value = false
  }
}

async function toggleGuest(guest: GuestRecord, enabled: boolean) {
  if (!plugin.value || guestsLoading.value) return
  guestsLoading.value = true
  try {
    const store = guestStoreFor(plugin.value)
    await store.select(enabled ? guest.id : null)
    await refreshGuests()
  } catch (error) {
    await toast(error instanceof Error ? error.message : '子插件启动失败', 'danger')
    await refreshGuests()
  } finally {
    guestsLoading.value = false
  }
}

async function removeGuest(guest: GuestRecord) {
  if (!plugin.value) return
  const alert = await alertController.create({
    header: '删除子插件？',
    message: '删除后需要重新导入脚本才能使用。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '删除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  try {
    await guestStoreFor(plugin.value).remove(guest.id)
    await refreshGuests()
    await toast('子插件已删除')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '删除失败', 'danger')
  }
}

watch(
  plugin,
  () => {
    void refreshGuests()
  },
  { immediate: true }
)

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
    // 记录授权时的权限名：插件升级若把同一个 key 改成别的权限，旧授权会被撤销。
    settings.grantPermission(plugin.value.key, permission.key, String(permission.name ?? '') || undefined)
  }
  void toast('已允许全部权限')
}

function resetPermissions() {
  if (!plugin.value) return
  settings.resetPermissions(plugin.value.key)
  void toast('已清除授权，下次使用时重新询问')
}

function openSurface(surfaceId: string) {
  if (!plugin.value) return
  router.push(
    '/plugin-surface/' + encodeURIComponent(plugin.value.key) + '/' + encodeURIComponent(surfaceId)
  )
}

function surfaceTitle(surface: any): string {
  return (
    surface.title ||
    plugin.value?.manifest.contributes?.commands?.find((item) => item.view === surface.id)?.title ||
    surface.id
  )
}

function surfaceKindLabel(kind: string): string {
  if (kind === 'web') return 'Web 页面'
  if (kind === 'native') return '原生页面'
  return '表单页面'
}

async function runCommand(command: any) {
  if (!plugin.value) return
  if (command.view) {
    openSurface(command.view)
    return
  }
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

/** 复制该插件的全部日志（带时间与级别），便于贴给作者或 issue。 */
async function copyLogs(): Promise<void> {
  const text = logs.value
    .map((log) => `[${new Date(log.at).toLocaleString()}] [${log.level}] ${log.message}`)
    .join('\n')
  if (!text) {
    await toast('没有可复制的日志')
    return
  }
  try {
    await Clipboard.write({ string: text })
    await toast(`已复制 ${logs.value.length} 条日志`, 'success')
  } catch {
    await toast('复制失败', 'danger')
  }
}

/** 只清当前插件的日志，不动其它插件。 */
async function clearLogs(): Promise<void> {
  const alert = await alertController.create({
    header: '清空日志',
    message: '只清空这个插件的日志，不影响其它插件。',
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '清空',
        role: 'destructive',
        handler: () => {
          pluginStore.clearLogs(plugin.value?.key || '')
        }
      }
    ]
  })
  await alert.present()
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
.guest-version {
  margin-left: 4px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
  font-weight: 500;
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
.log-actions {
  display: flex;
  gap: 4px;
  width: 100%;
  justify-content: flex-end;
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
