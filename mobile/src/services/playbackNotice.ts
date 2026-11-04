import { toastController } from '@ionic/vue'

/**
 * 播放链路的即时提示（自动换源、自动跳过、自动下一首失败）。
 *
 * 播放 store 会在解析失败后自己恢复，用户可能正停在播放页、也可能在别的页面，
 * 所以提示不能挂在某个页面的局部状态上。这里与 `settingsSync` /
 * `listenTogetherInvite` 同一做法，直接用 Ionic 的 toast 控制器。
 *
 * 失败要静默：toast 弹不出来（例如应用正在退出）不该让恢复流程抛错。
 */
export async function notifyPlayback(
  message: string,
  color: 'success' | 'warning' | 'danger' | 'medium' = 'medium'
): Promise<void> {
  try {
    const element = await toastController.create({ message, duration: 2600, color })
    await element.present()
  } catch {
    // 提示失败不影响播放恢复本身。
  }
}
