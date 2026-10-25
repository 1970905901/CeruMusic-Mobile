/**
 * 一起听深链邀请（对齐桌面版 services/listenTogetherInvite.ts 的 deeplink 路径）。
 *
 * 桌面版在应用回到前台时会读剪贴板找房间口令；移动端**不做**剪贴板轮询——
 * iOS 14+ 起后台读剪贴板会向用户弹提示，Android 12+ 也会在状态栏报「已读取
 * 剪贴板」，主动扫描成本太高。移动端只处理明确点进来的 `cerumusic://lt/<code>`
 * 深链：拉房间预览（名称、模式、人数上限），已登录且不是自己的房间时弹
 * 「立即加入」确认框；未登录提示去登录；口令无效静默记下不再重复弹。
 */
import { alertController } from '@ionic/vue'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { useListenTogetherStore } from '@/stores/listenTogether'
import { listenTogetherApi } from '@/services/listenTogetherApi'

/** 本会话已处理过的口令：关闭邀请后同一条链接不再反复弹。 */
const dismissedCodes = new Set<string>()
let running = false

export async function showListenTogetherInvite(source: 'deeplink', code: string): Promise<void> {
  const normalized = code.toUpperCase()
  if (!normalized || dismissedCodes.has(normalized)) return
  if (running) return
  running = true
  try {
    const lt = useListenTogetherStore()
    if (lt.inRoom) return

    const auth = useAuthStore()
    let preview
    if (auth.authenticated) {
      try {
        preview = await listenTogetherApi.resolve(normalized)
      } catch {
        // 网络异常：不标记 dismissed，用户重进还能再触发。
        return
      }
    } else {
      try {
        preview = await listenTogetherApi.preview(normalized)
      } catch {
        return
      }
      if (!preview) {
        dismissedCodes.add(normalized)
        return
      }
      dismissedCodes.add(normalized)
      const alert = await alertController.create({
        header: '加入一起听需要登录',
        message: [
          '收到一起听房间邀请',
          `<strong style="font-size:16px">${escapeHtml(preview.name)}</strong>`,
          `房间口令 <code>#${escapeHtml(preview.code)}#</code>`
        ].join('<br>'),
        buttons: [
          { text: '稍后', role: 'cancel' },
          {
            text: '去登录',
            handler: () => {
              void auth.login().catch(() => undefined)
            }
          }
        ]
      })
      await alert.present()
      return
    }

    if (!preview) {
      dismissedCodes.add(normalized)
      return
    }
    const myUserId = String((auth.user as any)?.sub || '')
    if (myUserId && preview.ownerId === myUserId) {
      // 自己的房间：静默放行（桌面版同样如此），只落回房间页。
      dismissedCodes.add(normalized)
      await router.push({ path: '/listen-together', query: { code: normalized } })
      return
    }

    dismissedCodes.add(normalized)
    const modeLabel = preview.mode === 'intimate' ? '亲密模式' : '多人房间'
    const alert = await alertController.create({
      header: '加入一起听',
      message: [
        source === 'deeplink' ? '来自分享链接的一起听邀请' : '朋友邀请你加入一起听房间',
        `<strong style="font-size:17px">${escapeHtml(preview.name)}</strong>`,
        `${modeLabel} · 最多 ${preview.maxMembers} 人`,
        `<code style="letter-spacing:3px">#${escapeHtml(preview.code)}#</code>`
      ].join('<br>'),
      buttons: [
        { text: '稍后', role: 'cancel' },
        {
          text: '立即加入',
          handler: () => {
            void lt
              .resolveAndJoin(preview!.code)
              .then(() => router.push('/listen-together'))
              .catch((cause) => {
                // 加入失败给出原因并回到房间页，输入框带口令可手动重试。
                void router.push({ path: '/listen-together', query: { code: normalized } })
                void alertController
                  .create({
                    header: '加入失败',
                    message: cause instanceof Error ? cause.message : String(cause),
                    buttons: ['知道了']
                  })
                  .then((element) => element.present())
              })
          }
        }
      ]
    })
    await alert.present()
  } finally {
    running = false
  }
}

/** The alert message renders as HTML; codes are alphanumeric but names are user input. */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
