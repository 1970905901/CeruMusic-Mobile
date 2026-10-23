<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>账号</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="auth.authenticated" fill="clear" @click="openNotifications">
            <ion-icon slot="icon-only" :icon="notificationsOutline" />
            <ion-badge v-if="notifications.counts.all" class="bell-badge">{{ notifications.counts.all > 99 ? '99+' : notifications.counts.all }}</ion-badge>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="!auth.authenticated" class="logged-out ceru-pad">
        <div class="account-icon"><ion-icon :icon="personCircleOutline" /></div>
        <h1 class="ceru-title">登录 Ceru 账号</h1>
        <p>登录后可同步个人资料、接收消息通知，并使用社区功能。</p>
        <ion-button expand="block" :disabled="auth.loading" @click="login">
          {{ auth.loading ? '正在打开登录页…' : '使用 Logto 登录' }}
        </ion-button>
        <p v-if="auth.error" class="error">{{ auth.error }}</p>
      </div>

      <template v-else>
        <div class="account-head ceru-pad">
          <button class="avatar-button" type="button" aria-label="更换头像" @click="avatarInput?.click()">
            <CoverImage :src="auth.avatarUrl" :size="86" :radius="43" :alt="auth.displayName" />
            <span class="avatar-edit"><ion-icon :icon="cameraOutline" /></span>
          </button>
          <div class="account-copy">
            <h1 class="ceru-title">{{ auth.displayName }}</h1>
            <p>{{ auth.user?.username ? '@' + auth.user.username : auth.user?.email || 'Ceru Music 用户' }}</p>
          </div>
        </div>
        <input ref="avatarInput" class="file-input" type="file" accept="image/*" @change="onAvatarPicked" />

        <p v-if="intro" class="intro ceru-pad">{{ intro }}</p>

        <ion-list class="group">
          <ion-item button detail @click="openEdit">
            <ion-icon slot="start" :icon="createOutline" color="primary" />
            <ion-label><h2>编辑个人资料</h2><p>昵称、简介、性别、生日和地区</p></ion-label>
          </ion-item>
          <ion-item button detail @click="openNotifications">
            <ion-icon slot="start" :icon="notificationsOutline" color="primary" />
            <ion-label><h2>消息通知</h2><p>{{ notifications.counts.all }} 条未读</p></ion-label>
          </ion-item>
          <ion-item button detail @click="$router.push('/community')">
            <ion-icon slot="start" :icon="peopleOutline" color="primary" />
            <ion-label><h2>社区</h2><p>分享音乐和动态</p></ion-label>
          </ion-item>
        </ion-list>

        <ion-list v-if="pluginAccounts.length" class="group">
          <div class="group-title">插件账号</div>
          <ion-item
            v-for="entry in pluginAccounts"
            :key="entry.key"
            button
            detail
            @click="openPluginAccount(entry)"
          >
            <CoverImage
              slot="start"
              :src="entry.summary?.avatarUrl || ''"
              :size="38"
              :radius="19"
              :alt="entry.summary?.displayName || entry.item.title"
            />
            <ion-label>
              <h2>{{ entry.summary?.displayName || entry.item.title }}</h2>
              <p>{{ entry.item.title }}<span v-if="entry.summary?.badge"> · {{ entry.summary.badge }}</span><span v-else> · {{ entry.summary?.signedIn ? '已登录' : '未登录' }}</span></p>
            </ion-label>
            <ion-button
              v-if="entry.summary?.signedIn && entry.item.logoutAction"
              slot="end"
              fill="clear"
              size="small"
              color="danger"
              @click.stop="logoutPluginAccount(entry)"
            >
              退出
            </ion-button>
          </ion-item>
        </ion-list>

        <div class="security-section ceru-pad">
          <h2 class="section-title">账号安全</h2>
          <p class="section-hint">
            以下设置会在系统浏览器中跳转到澜音认证服务器（{{ authHost }}）完成，
            密码与设备凭据不会经过本应用。
          </p>
        </div>
        <ion-list v-for="group in SECURITY_GROUPS" :key="group.id" class="group">
          <div class="group-title">{{ group.title }}</div>
          <ion-item
            v-for="item in group.items"
            :key="item.id"
            button
            detail
            @click="openAccountFlow(item)"
          >
            <ion-label>
              <h2>{{ item.label }}</h2>
              <p>{{ resolveSecuritySub(auth.user, item) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <div class="logout-wrap">
          <ion-button expand="block" color="danger" fill="outline" :disabled="auth.loading" @click="logout">
            退出登录
          </ion-button>
        </div>
      </template>
      <div class="bottom-space" />
    </ion-content>

    <ion-modal :is-open="editing" @didDismiss="editing = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start"><ion-button @click="editing = false">取消</ion-button></ion-buttons>
          <ion-title>编辑资料</ion-title>
          <ion-buttons slot="end"><ion-button :disabled="saving" @click="saveProfile">保存</ion-button></ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="form-content">
        <ion-list>
          <ion-item><ion-label position="stacked">昵称</ion-label><ion-input v-model="form.name" /></ion-item>
          <ion-item><ion-label position="stacked">简介</ion-label><ion-textarea v-model="form.intro" auto-grow :maxlength="300" /></ion-item>
          <ion-item>
            <ion-label>性别</ion-label>
            <ion-select v-model="form.gender" interface="action-sheet" cancel-text="取消">
              <ion-select-option value="male">男</ion-select-option>
              <ion-select-option value="female">女</ion-select-option>
              <ion-select-option value="secret">保密</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item><ion-label position="stacked">生日</ion-label><ion-input v-model="form.birthday" placeholder="YYYY-MM-DD" /></ion-item>
          <ion-item><ion-label position="stacked">地区</ion-label><ion-input v-model="form.region" placeholder="例如：福建·厦门" /></ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
  IonModal,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  onIonViewWillEnter,
  alertController,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  cameraOutline,
  createOutline,
  notificationsOutline,
  peopleOutline,
  personCircleOutline
} from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import CoverImage from '@/components/CoverImage.vue'
import { LOGTO_ENDPOINT } from '@/services/authClient'
import {
  SECURITY_GROUPS,
  buildAccountSecurityUrl,
  logtoEndpointHost,
  resolveSecuritySub,
  type SecurityItem
} from '@/services/accountSecurity'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { usePluginStore } from '@/stores/plugins'
import type { AccountSummary } from '@shiqianjiang/ceru-plugin-sdk'

const auth = useAuthStore()
const notifications = useNotificationsStore()
const pluginStore = usePluginStore()
const pluginSummaries = ref<Record<string, AccountSummary>>({})
const router = useIonRouter()
const editing = ref(false)
const saving = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const form = reactive({ name: '', intro: '', gender: 'secret', birthday: '', region: '' })
const intro = computed(() => String(auth.customData.intro || ''))
const authHost = computed(() => logtoEndpointHost(LOGTO_ENDPOINT))
const pluginAccounts = computed(() =>
  pluginStore.plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      (plugin.manifest.contributes?.accountItems || []).map((item) => {
        const key = plugin.key + ':' + item.id
        return { key, plugin, item, summary: pluginSummaries.value[key] }
      })
    )
)

async function refreshPluginAccounts() {
  if (!auth.authenticated) {
    pluginSummaries.value = {}
    return
  }
  const entries = pluginAccounts.value
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const summary = await pluginStore.invokeAction(entry.plugin.key, entry.item.action, {})
        if (summary && typeof summary === 'object') {
          pluginSummaries.value = { ...pluginSummaries.value, [entry.key]: summary }
        }
      } catch {
        // A plugin that cannot summarize its account is shown as signed out.
      }
    })
  )
}

function openPluginAccount(entry: { plugin: { key: string }; item: { view: string } }) {
  router.push(
    '/plugin-surface/' +
      encodeURIComponent(entry.plugin.key) +
      '/' +
      encodeURIComponent(entry.item.view)
  )
}

async function logoutPluginAccount(entry: {
  plugin: { key: string }
  item: { logoutAction?: string }
}) {
  if (!entry.item.logoutAction) return
  try {
    await pluginStore.invokeAction(entry.plugin.key, entry.item.logoutAction, {})
    await refreshPluginAccounts()
    await toast('已退出插件账号')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '退出失败', 'danger')
  }
}

function syncForm() {
  form.name = auth.displayName
  form.intro = String(auth.customData.intro || '')
  form.gender = String(auth.customData.gender || 'secret')
  form.birthday = String(auth.customData.birthday || '')
  form.region = String(auth.customData.region || '')
}

function openEdit() {
  syncForm()
  editing.value = true
}

async function login() {
  try {
    await auth.login()
    await notifications.refreshCounts()
  } catch (error) {
    await toast(error instanceof Error ? error.message : '登录失败', 'danger')
  }
}

/**
 * 退出登录：先确认。
 *
 * 退出会停掉实时消息连接并关闭设置同步，误触后要重新走一遍 Logto 登录；
 * 桌面端同样有二次确认。
 */
async function logout(): Promise<void> {
  const alert = await alertController.create({
    header: '退出登录',
    message: '退出后将停止接收消息通知，并关闭设置同步。确定要退出吗？',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '退出', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  try {
    await auth.logout()
    await toast('已退出登录')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '退出失败', 'danger')
  }
}

/**
 * 账号安全入口在**系统浏览器**里打开，而不是 WebView 内跳转。
 *
 * 桌面版同样用 `window.open` 交给系统浏览器，理由一致：这些页面要求用户
 * 输入密码或验证器码，不应该落在应用自己的 WebView 里；用 `@capacitor/browser`
 * 打开还有独立 cookie 与地址栏，用户能确认自己填的是认证服务器。
 */
async function openAccountFlow(item: SecurityItem): Promise<void> {
  const url = buildAccountSecurityUrl(LOGTO_ENDPOINT, item, auth.user)
  if (!url) {
    await toast('未配置认证服务器地址', 'danger')
    return
  }
  try {
    await Browser.open({ url })
  } catch {
    await toast('无法打开浏览器', 'danger')
  }
}

async function openNotifications() {
  await notifications.refreshCounts()
  await notifications.load(true)
  router.push('/notifications')
}

async function saveProfile() {
  if (!form.name.trim()) {
    await toast('昵称不能为空', 'danger')
    return
  }
  saving.value = true
  try {
    await auth.updateProfile({
      name: form.name.trim(),
      intro: form.intro.trim(),
      gender: form.gender,
      birthday: form.birthday.trim(),
      region: form.region.trim()
    })
    editing.value = false
    await toast('资料已更新')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '保存失败', 'danger')
  } finally {
    saving.value = false
  }
}

async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await auth.uploadAvatar(file)
    await toast('头像已更新')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '头像上传失败', 'danger')
  }
}

onMounted(() => {
  if (auth.authenticated) void refreshPluginAccounts()
})

watch(
  () => auth.authenticated,
  (value) => {
    if (value) void refreshPluginAccounts()
    else pluginSummaries.value = {}
  }
)

onIonViewWillEnter(() => {
  if (auth.authenticated) void refreshPluginAccounts()
})

async function toast(message: string, color = 'medium'): Promise<void> {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}
</script>
<style scoped>
.logged-out {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding-top: 30px;
}
.logged-out p {
  max-width: 320px;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.logged-out ion-button {
  width: min(340px, 100%);
}
.account-icon {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 179, 155, 0.12);
  color: var(--ceru-brand);
  font-size: 58px;
}
.error {
  color: var(--ceru-danger);
}
.account-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 24px;
}
.avatar-button {
  position: relative;
  border: 0;
  background: transparent;
  padding: 0;
  border-radius: 50%;
}
.avatar-edit {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--ceru-brand);
  border: 2px solid var(--ceru-bg);
  font-size: 14px;
}
.account-copy {
  min-width: 0;
}
.account-copy p {
  margin: 6px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.intro {
  margin: 18px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}
.group {
  margin-top: 24px;
  --ion-item-background: var(--ceru-bg-elevated);
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
}
.group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ceru-text-secondary);
  letter-spacing: 0.04em;
  padding: 14px 18px 8px;
}
.group h2 {
  font-size: 15px;
  font-weight: 650;
}
.group p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.security-section {
  margin-top: 28px;
}
.section-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--ceru-text);
}
.section-hint {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.logout-wrap {
  padding: 28px 16px 0;
}
.bottom-space {
  height: 120px;
}
.file-input {
  display: none;
}
.form-content {
  --background: var(--ceru-bg);
}
.bell-badge {
  position: absolute;
  top: 0;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 9px;
  background: var(--ceru-danger);
  color: #fff;
}
</style>