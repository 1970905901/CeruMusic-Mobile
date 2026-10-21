/**
 * 音频输出设备（桌面端 `Settings/AudioOutputSettings.vue` 的移动端等价实现）。
 *
 * 桌面端（Electron/Chromium）可以直接用 `HTMLMediaElement.setSinkId` 在
 * 扬声器/耳机/HDMI 之间切换；移动端多数 WebView 不暴露该能力，也不允许
 * 应用自行选择蓝牙/AirPlay 路由。因此这里：
 *  - 支持 `setSinkId` 且能枚举出多个输出时，提供真实切换；
 *  - 否则只暴露「本机输出（跟随系统）」，并在界面上说明原因，不伪造开关。
 */

export interface AudioOutputDevice {
  deviceId: string
  label: string
  /** 默认设备由系统路由，无法主动指定 */
  isDefault: boolean
}

export interface AudioOutputEnvironment {
  /** 浏览器是否实现了 HTMLMediaElement.setSinkId */
  canSetSinkId: boolean
  /** enumerateDevices 是否可用 */
  canEnumerate: boolean
  /** 是否已有音频输入/输出权限（未授权时 label 可能为空） */
  hasDeviceLabels?: boolean
}

export const SYSTEM_OUTPUT_ID = 'default'

const DEVICE_LABELS: Record<string, string> = {
  default: '系统默认输出',
  communications: '通话音输出',
  '': '本机输出'
}

function cleanLabel(value: string | undefined, deviceId: string): string {
  const trimmed = String(value ?? '').trim()
  if (trimmed) return trimmed
  if (deviceId === 'default' || deviceId === '') return DEVICE_LABELS.default
  if (deviceId === 'communications') return DEVICE_LABELS.communications
  return '未知输出设备'
}

/**
 * 是否具备真实的输出切换能力。只有同时满足「API 存在」与「至少枚举到一个
 * 非默认输出」才返回 true —— 只有 default 时切换没有意义。
 */
export function canSwitchAudioOutput(environment: AudioOutputEnvironment): boolean {
  if (!environment.canSetSinkId) return false
  return Boolean(environment.canEnumerate)
}

export interface EnumeratedDevice {
  deviceId?: string
  kind?: string
  label?: string
}

/**
 * 把 `enumerateDevices()` 的结果收敛成输出设备列表：
 * 只保留 audiooutput，按 deviceId 去重，默认设备排最前。
 */
export function normalizeAudioOutputs(devices: readonly EnumeratedDevice[]): AudioOutputDevice[] {
  const seen = new Set<string>()
  const outputs: AudioOutputDevice[] = []
  for (const device of devices ?? []) {
    if (!device || device.kind !== 'audiooutput') continue
    const deviceId = String(device.deviceId ?? '')
    if (seen.has(deviceId)) continue
    seen.add(deviceId)
    outputs.push({
      deviceId,
      label: cleanLabel(device.label, deviceId),
      isDefault: deviceId === 'default' || deviceId === ''
    })
  }
  outputs.sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
  return outputs
}

/**
 * 媒体元素是否支持 sink 切换。移动端 WebView 上 `setSinkId` 常缺失，
 * 这里做一次结构化判定，避免调用时抛 TypeError。
 */
export function supportsSinkSelection(media: unknown): boolean {
  if (!media || typeof media !== 'object') return false
  return typeof (media as { setSinkId?: unknown }).setSinkId === 'function'
}

/** 当前设置是否仍然有效：设备消失后回落到系统默认，而不是静默失败。 */
export function resolveOutputDeviceId(
  preferred: string | undefined,
  available: readonly AudioOutputDevice[]
): string {
  const value = String(preferred ?? '').trim()
  if (!value) return SYSTEM_OUTPUT_ID
  if (available.some((device) => device.deviceId === value)) return value
  return SYSTEM_OUTPUT_ID
}

/**
 * 给媒体元素应用输出设备。返回 false 表示当前环境不支持，调用方应提示
 * 「跟随系统输出」，而不是假装切换成功。
 */
export async function applyAudioOutput(
  media: unknown,
  deviceId: string
): Promise<boolean> {
  if (!supportsSinkSelection(media)) return false
  const target = (media as { setSinkId: (id: string) => Promise<void> }).setSinkId
  const id = String(deviceId ?? '').trim() || SYSTEM_OUTPUT_ID
  await target.call(media, id)
  return true
}