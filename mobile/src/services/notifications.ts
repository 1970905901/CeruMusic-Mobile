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