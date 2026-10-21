import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * 应用前后台状态（桌面端 `useAppBackground` 的移动端等价实现）。
 *
 * 桌面端需要同时看主进程推送与 `document.hidden`，因为「隐藏到托盘」不会改变
 * visibilityState；移动端同理：Capacitor 切后台时 WebView 仍在，所以原生
 * `appStateChange` 与 `document.hidden` 任一为后台都算后台。
 *
 * 用途：后台时暂停高开销渲染（播放页背景动画、音频可视化、全局视频壁纸），
 * 避免系统节流下仍全速跑 rAF / 视频解码。
 */
export interface VisibilitySignals {
  nativeActive: boolean
  documentHidden: boolean
}

/** 状态归约：任一信号为后台即视为后台。纯函数，便于单测。 */
export function reduceVisibility(signals: VisibilitySignals): boolean {
  return !signals.nativeActive || signals.documentHidden
}

const nativeActive = ref(true)
const documentHidden = ref(typeof document !== 'undefined' ? document.hidden : false)
let initialized = false

function apply(): void {
  isAppInactive.value = reduceVisibility({
    nativeActive: nativeActive.value,
    documentHidden: documentHidden.value
  })
}

/** 是否处于后台（App 切后台或页面不可见）。 */
export const isAppInactive: Ref<boolean> = ref(
  reduceVisibility({
    nativeActive: true,
    documentHidden: typeof document !== 'undefined' ? document.hidden : false
  })
)

/**
 * 注册页面可见性监听。幂等：`main.ts` 与组件初始化都可安全调用。
 * 不依赖 Capacitor，Web 预览同样可用。
 */
export function initAppVisibility(): void {
  if (initialized || typeof document === 'undefined') return
  initialized = true
  documentHidden.value = document.hidden
  apply()
  document.addEventListener('visibilitychange', () => {
    documentHidden.value = document.hidden
    apply()
  })
}

/** 供 `main.ts` 的 `appStateChange` 事件转发。 */
export function setNativeActive(active: boolean): void {
  nativeActive.value = active
  apply()
}

/** 组合式入口，与桌面端 `useAppBackground` 的返回形态保持一致。 */
export function useAppBackground(): { isAppBackground: ComputedRef<boolean> } {
  initAppVisibility()
  return { isAppBackground: computed(() => isAppInactive.value) }
}
