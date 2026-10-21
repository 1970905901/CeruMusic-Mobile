/**
 * 音源实现的展示辅助（桌面端 `Settings/PluginRoutingPanel.vue` 的移动端对应部分）。
 *
 * 移动端此前只在 action sheet 里列出候选插件，没有标出「当前生效的是哪个」，
 * 用户切换后无法确认结果。这里把状态文案抽成纯函数，页面只负责渲染。
 */

export interface RoutingImplementation {
  pluginKey: string
  pluginName: string
}

export interface RoutingSourceSummary {
  id: string
  name: string
  implementations: readonly RoutingImplementation[]
}

export interface RoutingSourceView {
  id: string
  name: string
  /** 当前实际生效的实现（显式选择或自动回落），没有实现时为 undefined */
  current?: RoutingImplementation
  /** 是否存在多个实现；只有多个时才值得展示切换入口 */
  hasChoice: boolean
  /** 副标题：自动选择 / 指定插件 / 无可用实现 */
  subtitle: string
}

/**
 * 计算某音源当前的生效实现与副标题。
 *
 * `selectedKey` 来自 `settings.providerOwner(source)`；它可能指向已卸载的插件，
 * 此时按宿主实际行为回落到第一个实现（与 `plugins.selectedProvider` 一致），
 * 并在副标题里明确写成「自动」，避免用户误以为自己指定的插件仍在生效。
 */
export function describeSourceRouting(
  source: RoutingSourceSummary,
  selectedKey: string | undefined
): RoutingSourceView {
  const implementations = source.implementations ?? []
  const key = String(selectedKey ?? '').trim()
  const explicit = key ? implementations.find((item) => item.pluginKey === key) : undefined
  const current = explicit ?? implementations[0]
  return {
    id: source.id,
    name: source.name,
    current,
    hasChoice: implementations.length > 1,
    subtitle: !current
      ? '没有可用实现'
      : explicit
        ? `当前使用 ${explicit.pluginName}`
        : `自动（${current.pluginName}）`
  }
}

/** 设置页「音源实现」行的一行摘要，例如「2 个可切换」。 */
export function summarizeSourceRouting(views: readonly RoutingSourceView[]): string {
  const switchable = views.filter((view) => view.hasChoice).length
  if (!views.length) return '还没有可路由的音源'
  if (!switchable) return `${views.length} 个音源，均只有唯一实现`
  return `${switchable} 个音源可切换实现`
}