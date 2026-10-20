import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { arrayBufferToBase64 } from '@/services/audioTags'
import { blobToDataUrl } from '@/services/imageUtils'

export type GlobalBackgroundType = 'none' | 'image' | 'video'

export interface GlobalBackgroundSettings {
  enable: boolean
  type: GlobalBackgroundType
  /** Absolute file URI on native platforms, data URL in browser previews. */
  url: string
  opacity: number
  blur: number
  brightness: number
}

/** Desktop GlobalBackground.vue fallbacks. */
export const DEFAULT_GLOBAL_BACKGROUND: GlobalBackgroundSettings = {
  enable: false,
  type: 'none',
  url: '',
  opacity: 0.5,
  blur: 10,
  brightness: 0.8
}

export const WALLPAPER_DIRECTORY = 'wallpapers'
/** Whole files are read into memory as base64, so keep the ceiling modest. */
export const MAX_WALLPAPER_BYTES = 32 * 1024 * 1024
/** Browser previews keep a data URL in settings, so the pick is capped and resized. */
export const MAX_WEB_WALLPAPER_BYTES = 12 * 1024 * 1024
/** Browser-only: longest edge after resizing, keeping the settings payload small. */
const WEB_MAX_EDGE = 1600

const MAX_BLUR = 50
const MAX_BRIGHTNESS = 2
const WALLPAPER_FILE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'ogg', 'mov', 'm4v']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif']

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function extensionOf(name: string): string {
  const clean = name.split('?')[0].split('#')[0]
  return (clean.split('.').pop() || '').toLowerCase()
}

/** Resolves the wallpaper kind from the MIME type, falling back to the extension. */
export function mediaTypeForFile(name: string, mime?: string): 'image' | 'video' | null {
  const type = (mime || '').toLowerCase()
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('image/')) return 'image'
  const ext = extensionOf(name)
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  return null
}

/** Keeps persisted settings usable even after a hand-edited or partial payload. */
export function normalizeGlobalBackground(value: unknown): GlobalBackgroundSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<GlobalBackgroundSettings>
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  const declared = raw.type === 'image' || raw.type === 'video' ? raw.type : null
  const type: GlobalBackgroundType = url ? declared ?? mediaTypeForFile(url) ?? 'none' : 'none'
  return {
    enable: typeof raw.enable === 'boolean' ? raw.enable : DEFAULT_GLOBAL_BACKGROUND.enable,
    type,
    url,
    opacity: clampNumber(raw.opacity, 0, 1, DEFAULT_GLOBAL_BACKGROUND.opacity),
    blur: clampNumber(raw.blur, 0, MAX_BLUR, DEFAULT_GLOBAL_BACKGROUND.blur),
    brightness: clampNumber(raw.brightness, 0, MAX_BRIGHTNESS, DEFAULT_GLOBAL_BACKGROUND.brightness)
  }
}

/** Desktop isEnabled: an enabled wallpaper needs both a file and a known kind. */
export function isGlobalBackgroundActive(
  value: Pick<GlobalBackgroundSettings, 'enable' | 'type' | 'url'> | null | undefined
): boolean {
  if (!value) return false
  return Boolean(value.enable && value.url && value.type !== 'none')
}

export function buildGlobalBackgroundFilter(
  value: Pick<GlobalBackgroundSettings, 'blur' | 'brightness'>
): string {
  return 'blur(' + value.blur + 'px) brightness(' + value.brightness + ')'
}

/** Native file URIs need Capacitor's local-server mapping; web URLs pass through. */
export function resolveGlobalBackgroundUrl(url: string): string {
  if (!url) return ''
  if (/^(data|blob|https?):/i.test(url)) return url
  return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(url) : url
}

export function pickGlobalBackgroundFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => {
      const file = input.files?.[0] ?? null
      input.remove()
      resolve(file)
    }
    input.oncancel = () => {
      input.remove()
      resolve(null)
    }
    input.click()
  })
}

function wallpaperFileName(file: File, type: 'image' | 'video'): string {
  const raw = extensionOf(file.name).replace(/[^a-z0-9]/g, '')
  const ext = raw || (type === 'video' ? 'mp4' : 'jpg')
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  return id + '.' + ext
}

/**
 * Browsers persist the wallpaper inside the settings JSON, so oversized camera
 * photos are downscaled before they reach localStorage.
 */
async function downscaleImageForWeb(file: File): Promise<string> {
  const dataUrl = await blobToDataUrl(file)
  if (typeof Image === 'undefined' || typeof document === 'undefined') return dataUrl
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        if (!width || !height) {
          resolve(dataUrl)
          return
        }
        const scale = Math.min(1, WEB_MAX_EDGE / Math.max(width, height))
        if (scale >= 1 && file.size <= MAX_WEB_WALLPAPER_BYTES / 3) {
          resolve(dataUrl)
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          resolve(dataUrl)
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const resized = canvas.toDataURL('image/jpeg', 0.82)
        resolve(resized.length < dataUrl.length ? resized : dataUrl)
      } catch {
        resolve(dataUrl)
      }
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

/**
 * Copies the chosen media into the app data directory and returns the stored
 * reference. Files are copied instead of referenced so the cache/file picker
 * can release the original and the wallpaper survives an app restart.
 */
export async function persistGlobalBackground(
  file: File
): Promise<Pick<GlobalBackgroundSettings, 'type' | 'url'>> {
  const type = mediaTypeForFile(file.name, file.type)
  if (!type) throw new Error('仅支持图片或视频文件')
  const native = Capacitor.isNativePlatform()
  if (!native && type === 'video') throw new Error('浏览器预览暂不支持视频壁纸，请在 App 内设置')
  const limit = native ? MAX_WALLPAPER_BYTES : MAX_WEB_WALLPAPER_BYTES
  if (file.size > limit) {
    const label = type === 'video' ? '视频' : '图片'
    throw new Error('文件过大：请选择小于 ' + Math.round(limit / 1024 / 1024) + ' MB 的' + label)
  }
  if (!native) return { type, url: await downscaleImageForWeb(file) }
  const path = WALLPAPER_DIRECTORY + '/' + wallpaperFileName(file, type)
  await Filesystem.writeFile({
    path,
    data: arrayBufferToBase64(await file.arrayBuffer()),
    directory: Directory.Data,
    recursive: true
  })
  const uri = await Filesystem.getUri({ path, directory: Directory.Data })
  return { type, url: uri.uri }
}

/** Removes a previously stored wallpaper; unknown or external URLs are ignored. */
export async function deleteGlobalBackgroundFile(url: string): Promise<void> {
  if (!url || !Capacitor.isNativePlatform()) return
  const name = url.split('/').pop() || ''
  if (!WALLPAPER_FILE_PATTERN.test(name)) return
  try {
    await Filesystem.deleteFile({
      path: WALLPAPER_DIRECTORY + '/' + name,
      directory: Directory.Data
    })
  } catch {
    // A wallpaper that is already gone needs no cleanup.
  }
}
