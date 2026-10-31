/**
 * `ui.toast` 的 `level` 映射（桌面 `PluginHostBridge` 的同一条白名单）。
 *
 * 桌面把 `info / success / warning / error` 交给 MessagePlugin，着色区分
 * 「成功了」与「出错了」。移动端此前把 `level` 整个丢掉，所有插件的提示
 * 都是同一个中性色——插件报错时用户看到的是普通提示，很容易当成成功。
 */
export type ToastColor = 'primary' | 'success' | 'warning' | 'danger' | 'medium'

const LEVEL_COLORS: Record<string, ToastColor> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'primary'
}

/** 只认文档列出的值；其它一律按 info（与桌面白名单同口径）。 */
export function toastColorFor(level: unknown): ToastColor {
  const key = typeof level === 'string' ? level.trim().toLowerCase() : ''
  return LEVEL_COLORS[key] ?? 'medium'
}

/** Level 是否被识别——用于区分「插件没传」与「传了不认识的值」。 */
export function isKnownToastLevel(level: unknown): boolean {
  const key = typeof level === 'string' ? level.trim().toLowerCase() : ''
  return key in LEVEL_COLORS
}
