<template>
  <ion-page>
    <ion-content :fullscreen="true" class="welcome-content">
      <div class="ambient ambient-a" />
      <div class="ambient ambient-b" />
      <div class="welcome ceru-safe-top">
        <div class="brand">
          <div class="logo-shell">
            <img src="/logo.png" alt="澜音 Ceru Music" class="logo" />
          </div>
          <div class="brand-copy">
            <h1>澜音</h1>
            <p>Ceru Music · Mobile</p>
          </div>
        </div>

        <div class="hero">
          <h2>把音乐留在<br /><span>自己的设备里</span></h2>
          <p>
            安装你信任的 Ceru v2 音源插件，搜索、播放、下载与管理音乐。移动端不内置任何音乐源。
          </p>
        </div>

        <div class="feature-grid">
          <div class="feature ceru-card">
            <ion-icon :icon="phonePortraitOutline" />
            <div>
              <strong>为手机而生</strong>
              <span>iOS 与 Android 各自的原生界面规范</span>
            </div>
          </div>
          <div class="feature ceru-card">
            <ion-icon :icon="extensionPuzzleOutline" />
            <div>
              <strong>v2 插件</strong>
              <span>在隔离 Worker 中运行，权限逐项确认</span>
            </div>
          </div>
          <div class="feature ceru-card">
            <ion-icon :icon="cloudOfflineOutline" />
            <div>
              <strong>离线优先</strong>
              <span>收藏、歌单、下载与本地文件都保存在设备</span>
            </div>
          </div>
        </div>

        <div class="actions">
          <ion-button expand="block" size="large" :disabled="pluginStore.importing" @click="pickPlugin">
            <ion-icon slot="start" :icon="addCircleOutline" />
            导入插件文件
          </ion-button>
          <ion-button expand="block" fill="outline" size="large" :disabled="pluginStore.importing" @click="importFromUrl">
            <ion-icon slot="start" :icon="linkOutline" />
            从 URL 安装
          </ion-button>
          <ion-button expand="block" fill="clear" @click="skipToLocal">
            仅使用本地音乐
          </ion-button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <p class="legal">
          插件由第三方提供。请仅使用合法、合规且你有权访问的音乐服务。应用不存储或分发音乐文件。
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonButton, IonContent, IonIcon, IonPage, alertController } from '@ionic/vue'
import {
  addCircleOutline,
  cloudOfflineOutline,
  extensionPuzzleOutline,
  linkOutline,
  phonePortraitOutline
} from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { usePluginStore } from '@/stores/plugins'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const pluginStore = usePluginStore()
const settings = useSettingsStore()
const error = ref<string | null>(null)

function pickPlugin() {
  error.value = null
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
      settings.settings.onboardingDone = true
      await router.replace('/tabs/discover')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }
  input.oncancel = () => input.remove()
  input.click()
}

async function importFromUrl() {
  const alert = await alertController.create({
    header: '从 URL 安装插件',
    message: '请输入指向 Ceru v2 plugin.js 的 HTTPS 地址。请只安装你信任的插件。',
    inputs: [
      {
        name: 'url',
        type: 'url',
        placeholder: 'https://example.com/plugin.js'
      }
    ],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '安装', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  const url = String(data?.values?.url ?? '').trim()
  if (role !== 'confirm' || !url) return
  error.value = null
  try {
    const record = await pluginStore.importFromUrl(url)
    await pluginStore.setEnabled(record.key, true)
    settings.settings.onboardingDone = true
    await router.replace('/tabs/discover')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function skipToLocal() {
  settings.settings.onboardingDone = true
  await router.replace('/tabs/library')
}
</script>

<style scoped>
.welcome-content {
  --background: #0a0f14;
  color: #f2f6f8;
}
.ambient {
  position: fixed;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
  pointer-events: none;
}
.ambient-a {
  width: 320px;
  height: 320px;
  left: -120px;
  top: -80px;
  background: radial-gradient(circle, rgba(0, 218, 192, 0.55), transparent 68%);
}
.ambient-b {
  width: 360px;
  height: 360px;
  right: -160px;
  top: 180px;
  background: radial-gradient(circle, rgba(86, 120, 255, 0.38), transparent 68%);
}
.welcome {
  position: relative;
  z-index: 1;
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 20px 44px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.logo-shell {
  width: 64px;
  height: 64px;
  border-radius: 19px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 36px rgba(0, 218, 192, 0.16);
}
.logo {
  width: 100%;
  height: 100%;
  /* 透明底音符用 contain，cover 会把音符裁掉边缘。 */
  object-fit: contain;
  padding: 10px;
  box-sizing: border-box;
}
.brand-copy h1 {
  font-size: 26px;
  margin: 0;
  letter-spacing: -0.04em;
}
.brand-copy p {
  margin: 3px 0 0;
  font-size: 12px;
  color: rgba(242, 246, 248, 0.58);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hero {
  margin-top: 44px;
}
.hero h2 {
  font-size: 40px;
  line-height: 1.04;
  letter-spacing: -0.055em;
  margin: 0;
  font-weight: 800;
}
.hero h2 span {
  color: #00dac0;
}
.hero p {
  margin: 18px 0 0;
  max-width: 520px;
  color: rgba(242, 246, 248, 0.68);
  line-height: 1.7;
  font-size: 14px;
}
.feature-grid {
  display: grid;
  gap: 10px;
  margin-top: 30px;
}
.feature {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  background: rgba(255, 255, 255, 0.055);
  border-color: rgba(255, 255, 255, 0.08);
}
.feature ion-icon {
  color: #00dac0;
  font-size: 22px;
  margin-top: 1px;
}
.feature strong {
  display: block;
  font-size: 14px;
}
.feature span {
  display: block;
  margin-top: 4px;
  color: rgba(242, 246, 248, 0.58);
  font-size: 12px;
  line-height: 1.5;
}
.actions {
  display: grid;
  gap: 10px;
  margin-top: 30px;
}
.error {
  margin: 16px 0 0;
  color: #ff8c90;
  font-size: 13px;
  line-height: 1.5;
}
.legal {
  margin: 24px 0 0;
  color: rgba(242, 246, 248, 0.42);
  font-size: 11px;
  line-height: 1.65;
}
html.ios .feature-grid {
  gap: 12px;
}
html.md .logo-shell {
  border-radius: 16px;
}
@media (min-width: 700px) {
  .feature-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
