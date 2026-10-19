import { HOST_SERVICE_EVENT_NAMES } from '@shiqianjiang/ceru-plugin-sdk'

export type HostEventName = (typeof HOST_SERVICE_EVENT_NAMES)[number]

export function isHostEventName(value: string): value is HostEventName {
  return (HOST_SERVICE_EVENT_NAMES as readonly string[]).includes(value)
}

export function settingsChangedKeys(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined
): string[] {
  if (!next) return []
  const before = previous ?? {}
  return Object.keys(next).filter((key) => !Object.is(before[key], next[key]))
}
