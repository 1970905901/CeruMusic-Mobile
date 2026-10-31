/**
 * `files.pick(request)` 选择器选项。
 *
 * 桌面 `handleFileService` 只在 `request.multiple` 为真时允许一次选多个；
 * 移动端此前写成 `multiple !== false`：插件**没传** multiple（或传了 0、空串、
 * 其他假值）时照样弹多选。用户一次选一堆文件，插件却按单文件契约只取第一个，
 * 剩下的静默丢掉——用户以为都导入/处理了。
 */
export interface FilePickerOptions {
  /** 严格按 `request.multiple === true`，与桌面同口径 */
  multiple: boolean
  /** `accept` 属性；空字符串表示不过滤 */
  accept: string
}

export function filePickerOptions(request: unknown): FilePickerOptions {
  const value =
    request && typeof request === 'object' && !Array.isArray(request)
      ? (request as { multiple?: unknown; extensions?: unknown })
      : {}
  const extensions = Array.isArray(value.extensions)
    ? value.extensions
        .map((item) => String(item ?? '').trim().replace(/^\./, ''))
        .filter((item) => Boolean(item))
    : []
  return {
    multiple: value.multiple === true,
    accept: extensions.map((ext) => `.${ext}`).join(',')
  }
}
