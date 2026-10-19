import type { AudioDevice } from '@shiqianjiang/ceru-plugin-sdk'

const LOCAL_AUDIO_DEVICE: AudioDevice = {
  id: 'local:default',
  name: '本机扬声器',
  kind: 'local',
  available: true
}

/**
 * Mobile WebViews expose system-routed audio but not reliable per-element sink
 * selection. Declaring the system output lets device-aware plugins stay usable
 * without pretending Bluetooth/DLNA enumeration exists.
 */
export function pluginAudioDevices(): AudioDevice[] {
  return [{ ...LOCAL_AUDIO_DEVICE }]
}

export function selectPluginAudioDevice(id: unknown): void {
  const value = String(id ?? '')
  if (value !== LOCAL_AUDIO_DEVICE.id) {
    throw new Error('音频设备不可用')
  }
}
