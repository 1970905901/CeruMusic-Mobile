import { reactive } from 'vue'

export interface PluginProgressItem {
  id: string
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

export function createPluginProgress(request: any): string {
  const id = `plugin-progress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  pluginProgressState.items.push({
    id,
    title: String(request?.title || request?.message || '插件任务'),
    message: request?.message ? String(request.message) : undefined,
    value: normalizeValue(request?.value ?? request?.progress),
    createdAt: Date.now()
  })
  return id
}

export function updatePluginProgress(id: string, value: any): void {
  const item = pluginProgressState.items.find((entry) => entry.id === id)
  if (!item) return
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (record.title != null) item.title = String(record.title)
  if (record.message != null) item.message = String(record.message)
  const next = normalizeValue(value)
  if (next !== null) item.value = next
}

export function closePluginProgress(id: string): void {
  const index = pluginProgressState.items.findIndex((entry) => entry.id === id)
  if (index >= 0) pluginProgressState.items.splice(index, 1)
}