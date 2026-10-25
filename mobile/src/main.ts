import { createApp, watch } from 'vue'
import { IonicVue } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { Device } from '@capacitor/device'
import { SplashScreen } from '@capacitor/splash-screen'
import { createPinia } from 'pinia'
import { applyIonicPrimary } from '@/services/accentTheme'

import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'
import '@ionic/vue/css/palettes/dark.class.css'
import '@/theme/variables.css'
import '@/theme/global.css'
import '@/theme/tablet.css'

import App from './App.vue'
import router from './router'
import { startRoutePreloading } from './router'
import { useSettingsStore } from '@/stores/settings'
import { usePluginStore } from '@/stores/plugins'
import { useLibraryStore } from '@/stores/library'
import { useDownloadStore } from '@/stores/downloads'
import { usePlayerStore } from '@/stores/player'
import { useAudioEffectsStore } from '@/stores/audioEffects'
import { useShareStore } from '@/stores/share'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { restartSettingsSync, startSettingsSync, stopSettingsSync } from '@/services/settingsSync'
import { installLegacyPolyfills } from '@/utils/polyfills'
import { pluginRuntimeManager } from '@/services/plugin/runtime'
import { settingsChangedKeys } from '@/services/pluginEvents'
import { initAppVisibility, setNativeActive } from '@/services/appVisibility'
import { showListenTogetherInvite } from '@/services/listenTogetherInvite'

installLegacyPolyfills()

initAppVisibility()

function applyLayoutCapabilities() {
  const flex = document.createElement('div')
  flex.style.cssText = 'display:flex;gap:1px;position:absolute;visibility:hidden;left:-9999px;top:-9999px'
  const first = document.createElement('div')
  const second = document.createElement('div')
  first.style.cssText = second.style.cssText = 'width:10px;height:1px'
  flex.append(first, second)
  document.body.appendChild(flex)
  const gap = second.getBoundingClientRect().left - first.getBoundingClientRect().right
  flex.remove()
  if (gap < 1) document.documentElement.classList.add('no-flex-gap')
}

applyLayoutCapabilities()

const platform = Capacitor.getPlatform()
const forcedMode = new URLSearchParams(location.search).get('mode')
const ionicMode = forcedMode === 'ios' || platform === 'ios' ? 'ios' : 'md'
document.documentElement.classList.add(ionicMode)
document.documentElement.classList.add('capacitor')

function applyResponsiveLayout() {
  const shortestSide = Math.min(window.innerWidth, window.innerHeight)
  document.documentElement.classList.toggle('android-tablet', ionicMode === 'md' && shortestSide >= 600)
  document.documentElement.classList.toggle('ios-tablet', ionicMode === 'ios' && shortestSide >= 744)
}

applyResponsiveLayout()
window.addEventListener('resize', applyResponsiveLayout)
window.addEventListener('orientationchange', applyResponsiveLayout)

async function applyIosVersionStyles() {
  if (platform !== 'ios') return
  try {
    const info = await Device.getInfo()
    const major = Number(String(info.osVersion || '').split('.')[0])
    if (!Number.isFinite(major) || major < 14) return
    document.documentElement.classList.add(`ios-${major}`)
    document.documentElement.classList.add(major >= 26 ? 'ios-liquid' : major >= 15 ? 'ios-modern' : 'ios-legacy')
  } catch {
    // Device information is optional; Ionic's iOS mode remains the fallback.
  }
}

void applyIosVersionStyles()

const pinia = createPinia()
const app = createApp(App).use(IonicVue, { mode: ionicMode }).use(pinia)

const settings = useSettingsStore(pinia)

/**
 * 强调色不只是一个 CSS 变量：Ionic 组件的颜色全部走 `--ion-color-primary*`，
 * 按钮、开关、进度条、分段控件都只认这一组。此前只改了 `--ceru-brand`，
 * 于是应用内自绘的模块变了色，Ionic 控件仍是默认的青绿，两套强调色并存。
 * 这里把强调色同时写进 Ionic 的 primary 系列，并按 shade/tint 规则生成深浅变体。
 */
function applyTheme() {
  document.documentElement.classList.toggle('dark', settings.isDark)
  document.documentElement.style.setProperty('--ceru-brand', settings.settings.accent)
  applyIonicPrimary(settings.settings.accent)
  if (Capacitor.isNativePlatform()) {
    void StatusBar.setStyle({ style: settings.isDark ? Style.Dark : Style.Light }).catch(() => undefined)
    void StatusBar.setBackgroundColor({ color: settings.isDark ? '#0b0f14' : '#f5f7f8' }).catch(
      () => undefined
    )
  }
}

applyTheme()
watch(() => settings.isDark, applyTheme)
watch(() => settings.settings.accent, applyTheme)

app.use(router)

void (async () => {
  await router.isReady()
  try {
    await useAuthStore(pinia).init()
    const notifications = useNotificationsStore(pinia)
    notifications.startRealtime()
    watch(
      () => useAuthStore(pinia).authenticated,
      (authenticated) => {
        if (authenticated) {
          notifications.startRealtime()
          restartSettingsSync()
        } else {
          notifications.stopRealtime()
          // 只断连接不够：列表与角标还在内存里，换账号登录后会先看到
          // 上一个账号的私信与评论内容。
          notifications.resetInbox()
          stopSettingsSync()
        }
      }
    )
    const plugins = usePluginStore(pinia)
    await plugins.init()
    // 设置/主题变化推给插件（ctx.events.on('settings.changed' / 'theme.changed')）
    plugins.startSettingsEvents()
    if (settings.settings.autoUpdatePlugins) {
      setTimeout(async () => {
        try {
          const { findPluginUpdates, installPluginUpdate } = await import('@/services/pluginUpdates')
          const updates = await findPluginUpdates()
          for (const update of updates) await installPluginUpdate(update)
        } catch {
          // Automatic plugin updates stay silent; manual check reports errors.
        }
      }, 8000)
    }
    await useLibraryStore(pinia).init()
    await useDownloadStore(pinia).init()
    const player = usePlayerStore(pinia)
    player.loadPersisted()
    // 上次选的输出设备要在这里应用：只有设置页会调 setSinkId，
    // 不进设置页的话每次启动都退回系统默认输出。
    void player.applyStoredOutputDevice()
    await player.restoreIfAvailable()
    useAudioEffectsStore(pinia)
  } catch (error) {
    console.error('应用初始化失败', error)
  }

  if (!usePluginStore(pinia).enabledPlugins.length && !settings.settings.onboardingDone) {
    await router.replace('/welcome')
  }

  if (import.meta.env.DEV) {
    ;(window as any).__ceru = {
      pluginStore: usePluginStore(pinia),
      library: useLibraryStore(pinia),
      downloads: useDownloadStore(pinia),
      player: usePlayerStore(pinia),
      auth: useAuthStore(pinia),
      share: useShareStore(pinia)
    }
  }

  app.mount('#app')

// 首屏挂载后再启动空闲预加载，避免与初始化抢主线程。
startRoutePreloading(() => settings.settings.routePreloadEnabled)
  startSettingsSync()

  if (Capacitor.isNativePlatform()) {
    await StatusBar.setOverlaysWebView({ overlay: platform === 'ios' }).catch(() => undefined)
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => undefined)
    await SplashScreen.hide().catch(() => undefined)
  }
})()

/**
 * 处理 `cerumusic://` 深链：一起听邀请、歌单分享、单曲分享。
 * 无法解析或非本应用的地址一律忽略（OAuth 回调由 Logto 自己处理）。
 */
async function handleDeepLink(url: string): Promise<void> {
  try {
    await router.isReady()
    const parsed = new URL(url)
    if (parsed.protocol !== 'cerumusic:') return
    if (parsed.hostname === 'lt' || parsed.hostname === 'listen-together') {
      const code = parsed.pathname.replace(/^\/+/, '').split('/')[0]
      if (code) {
        // 深链邀请先走预览确认框（对齐桌面版 deeplink 路径）；已在房间里或
        // 口令无效时由邀请服务自行回落到房间页并带上口令。
        await showListenTogetherInvite('deeplink', code)
      }
      return
    }
    if (parsed.hostname === 'playlist') {
      const parts = parsed.pathname.replace(/^\/+/, '').split('/')
      if (parts[0] === 'share' && parts[1]) {
        await router.push({ path: '/shared/playlist/' + encodeURIComponent(parts[1]) })
      }
      return
    }
    if (parsed.hostname === 'share') {
      const parts = parsed.pathname.replace(/^\/+/, '').split('/')
      if (parts[0] === 'playlist' && parts[1]) {
        await router.push({ path: '/shared/playlist/' + encodeURIComponent(parts[1]) })
      } else if (parts[0]) {
        await router.push({ path: '/shared/song/' + encodeURIComponent(parts[0]) })
      }
    }
  } catch {
    // 非法深链忽略；不让一次点击把应用留在错误页。
  }
}

if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    setNativeActive(isActive)
    if (!isActive) usePlayerStore(pinia).persistState()
    else useNotificationsStore(pinia).wakeRealtime()
  })

  void CapacitorApp.addListener('appUrlOpen', ({ url }) => handleDeepLink(url))

  /**
   * 冷启动深链。
   *
   * `appUrlOpen` 只在应用**已经运行**时触发。用户从聊天里点一个
   * `cerumusic://share/...` 链接、应用当时是关闭状态时，系统直接把应用拉起来，
   * 这条 URL 只会出现在 `getLaunchUrl()` 里——此前没有读它，于是应用停在首页，
   * 分享链接看着像没反应（再点一次才会好，因为那时进程已在运行）。
   */
  void CapacitorApp.getLaunchUrl()
    .then((result) => {
      if (result?.url) void handleDeepLink(result.url)
    })
    .catch(() => undefined)

  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    const route = router.currentRoute.value
    if (route.path === '/player') {
      window.history.back()
      return
    }
    if (canGoBack) {
      void router.back()
    } else if (route.path !== '/tabs/discover') {
      void router.replace('/tabs/discover')
    } else {
      void CapacitorApp.exitApp()
    }
  })
}
