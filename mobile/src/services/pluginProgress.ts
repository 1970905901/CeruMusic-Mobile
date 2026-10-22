import { reactive } from 'vue'

export interface PluginProgressItem {
  id: string
  /** 创建它的插件。插件被卸载/停用时据此清理，避免卡片永远留在屏幕上。 */
  owner?: string
  title: string
  message?: string
  value: number | null
  createdAt: number
}

export const pluginProgressState = reactive<{ items: PluginProgressItem[] }>({
  items: []
})

function normalizeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value > 1 ? value / 100 : value))
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['value', 'progress', 'percent']) {
      const parsed = normalizeValue(record[key])
      if (parsed !== null) return parsed
    }
  }
  return null
}

/** 单个插件最多同时挂起的进度卡片数；超出时自动丢弃最旧的一张。 */
export const MAX_PROGRESS_PER_OWNER = 8

/** 标题与文案的长度上限：插件传超长字符串会把卡片撑爆整个界面。 */
const MAX_TITLE_LENGTH = 120
const MAX_MESSAGE_LENGTH = 300

function clampText(value: unknown, limit: number): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value)
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

export function createPluginProgress(request: any, owner?: string): string {
  const id = `plugin-progress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  pluginProgressState.items.push({
    id,
    ...(owner ? { owner } : {}),
    title: clampText(request?.title || request?.message, MAX_TITLE_LENGTH) || '插件任务',
    message: clampText(request?.message, MAX_MESSAGE_LENGTH),
    value: normalizeValue(request?.value ?? request?.progress),
    createdAt: Date.now()
  })
  // 插件在循环里创建卡片却不关闭时，界面会被几十张「正在处理…」淹没。
  if (owner) {
    const mine = pluginProgressState.items.filter((entry) => entry.owner === owner)
    if (mine.length > MAX_PROGRESS_PER_OWNER) {
      const drop = new Set(
        mine
          .slice(0, mine.length - MAX_PROGRESS_PER_OWNER)
          .map((entry) => entry.id)
      )
      pluginProgressState.items = pluginProgressState.items.filter(
        (entry) => !drop.has(entry.id)
      )
    }
  }
  return id
}

/**
 * 插件运行时停止时清理它留下的进度卡片。
 *
 * 插件崩溃、被禁用或热重载时，`ui.progress.close` 永远不会再被调用；
 * 不主动清理的话那张「正在处理…」的卡片会一直挂在界面上。
 */
export function clearPluginProgress(owner: string): void {
  if (!owner) return
  pluginProgressState.items = pluginProgressState.items.filter((entry) => entry.owner !== owner)
}

/**
 * 只允许操作自己创建的卡片。
 *
 * 卡片 id 是可预测的；不校验归属时，任何插件猜到 id 就能改掉或关掉
 * 别的插件（乃至宿主自己）的任务进度。`owner` 缺省表示「宿主自己」，
 * 这类卡片同样不接受插件操作。
 */
function findOwned(id: string, owner: string | undefined): PluginProgressItem | undefined {
  const item = pluginProgressState.items.find((entry) => entry.id === id)
  if (!item) return undefined
  if (!owner || item.owner !== owner) return undefined
  return item
}

export function updatePluginProgress(id: string, value: any, owner?: string): void {
  const item = findOwned(id, owner)
  if (!item) return
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (record.title != null) item.title = clampText(record.title, MAX_TITLE_LENGTH) || item.title
  if (record.message != null) item.message = clampText(record.message, MAX_MESSAGE_LENGTH)
  const next = normalizeValue(value)
  if (next !== null) item.value = next
}

export function closePluginProgress(id: string, owner?: string): void {
  const item = findOwned(id, owner)
  if (!item) return
  pluginProgressState.items = pluginProgressState.items.filter((entry) => entry.id !== item.id)
}

/** 宿主界面上的关闭按钮：用户自己点的，不需要归属校验。 */
export function dismissPluginProgress(id: string): void {
  pluginProgressState.items = pluginProgressState.items.filter((entry) => entry.id !== id)
}