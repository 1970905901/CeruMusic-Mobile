import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'

/**
 * `ui.navigation.open({ page: 'playlist', sectionId })` 的宿主落点。
 *
 * SDK 只允许 `sectionId` 出现在歌单导航上，并且必须由本插件声明过
 * （`assertNavigationRequest` 已经校验）。移动端此前校验完就把 sectionId 丢了，
 * 用户被带到歌单列表的默认视图——插件以为打开了它自己的栏目。
 *
 * 返回插件 Surface 的路径；`sectionId` 没有对应 Surface 时返回 null，
 * 由调用方回落到歌单列表。
 */
export function playlistSectionPath(
  pluginKey: string,
  manifest: Pick<PluginManifest, 'contributes'> | null | undefined,
  sectionId: unknown
): string | null {
  const id = String(sectionId ?? '')
  if (!id) return null
  const section = (manifest?.contributes?.playlistSections ?? []).find((item) => item.id === id)
  if (!section?.view) return null
  return (
    '/plugin-surface/' + encodeURIComponent(pluginKey) + '/' + encodeURIComponent(section.view)
  )
}
