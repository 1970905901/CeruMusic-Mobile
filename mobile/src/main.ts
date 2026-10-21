import { createApp, watch } from 'vue'
import { IonicVue } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { Device } from '@capacitor/device'
import { SplashScreen } from '@capacitor/splash-screen'
import { createPinia } from 'pinia'

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

function applyTheme() {
  document.documentElement.classList.toggle('dark', settings.isDark)
  document.documentElement.style.setProperty('--ceru-brand', settings.settings.accent)
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
          stopSettingsSync()
        }
      }
    )
    await usePluginStore(pinia).init()
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

if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    setNativeActive(isActive)
    if (!isActive) usePlayerStore(pinia).persistState()
    else useNotificationsStore(pinia).wakeRealtime()
  })

  void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    try {
      const parsed = new URL(url)
      if (
        parsed.protocol === 'cerumusic:' &&
        (parsed.hostname === 'lt' || parsed.hostname === 'listen-together')
      ) {
        const code = parsed.pathname.replace(/^\/+/, '').split('/')[0]
        if (code) void router.push({ path: '/listen-together', query: { code } })
      }
      if (parsed.protocol === 'cerumusic:' && parsed.hostname === 'playlist') {
        const parts = parsed.pathname.replace(/^\/+/, '').split('/')
        if (parts[0] === 'share' && parts[1]) {
          void router.push({ path: '/shared/playlist/' + encodeURIComponent(parts[1]) })
        }
      }
      if (parsed.protocol === 'cerumusic:' && parsed.hostname === 'share') {
        const parts = parsed.pathname.replace(/^\/+/, '').split('/')
        if (parts[0] === 'playlist' && parts[1]) {
          void router.push({ path: '/shared/playlist/' + encodeURIComponent(parts[1]) })
        } else if (parts[0]) {
          void router.push({ path: '/shared/song/' + encodeURIComponent(parts[0]) })
        }
      }
    } catch {
      // Invalid deep links are ignored; OAuth callbacks are handled by Logto.
    }
  })

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
