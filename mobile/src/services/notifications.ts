import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

let sequence = 0
let channelReady = false

function nextId(): number {
  sequence = (sequence + 1) % 100000
  return Math.floor((Date.now() + sequence) % 2147483647)
}

async function ensureChannel(): Promise<void> {
  if (channelReady || Capacitor.getPlatform() !== 'android') return
  try {
    await LocalNotifications.createChannel({
      id: 'ceru-plugin',
      name: '插件通知',
      description: '来自音乐插件的提醒',
      importance: 3,
      visibility: 1,
      vibration: true
    })
    channelReady = true
  } catch {
    // Older Android versions do not need an explicit channel.
  }
}
/**
 * 提前申请通知权限。
 *
 * 插件的系统通知只在 App 处于后台时发送，而**后台无法弹出权限对话框**：
 * 第一次真正需要发通知时申请权限，请求会被系统直接吞掉，用户什么也不会看到，
 * 插件以为通知已送达。所以在用户启用「一起听通知」这类开关时（App 在前台）
 * 就把权限要到手。
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display === 'granted') return true
    // `denied` 是用户已经拒绝过，再问也不会弹框，只会得到同样的结果。
    if (permission.display === 'denied') return false
    const requested = await LocalNotifications.requestPermissions()
    return requested.display === 'granted'
  } catch {
    return false
  }
}

/** Shows a system notification when the OS grants permission; callers may fall back to a toast. */
export async function showSystemNotification(title: string, body: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions()
    }
    if (permission.display !== 'granted') return false
    await ensureChannel()
    await LocalNotifications.schedule({
      notifications: [
        {
          id: nextId(),
          title: title.slice(0, 120),
          body: body.slice(0, 500),
          channelId: 'ceru-plugin',
          schedule: { at: new Date(Date.now() + 800) }
        }
      ]
    })
    return true
  } catch {
    return false
  }
}