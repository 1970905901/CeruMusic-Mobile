/**
 * 能力路由（桌面端 `Settings/PluginRoutingPanel.vue` 的移动端子集）。
 *
 * 桌面端能路由十余种能力；移动端目前只有评论链路真正读取
 * `settings.capabilityOwner`（`stores/plugins.ts` 的 comments()）。
 * 因此这里只暴露移动端确实会生效的条目，避免出现「选了不生效」的开关。
 * 新增能力时：先在宿主里消费 capabilityOwner，再补进这张表。
 */

export interface CapabilityLabel {
  /** 能力键，与 `capabilityOwner(source, capability)` 的第二个参数一致 */
  capability: string
  label: string
  description: string
  /** 对应的插件 action id，用于判断某插件是否真的实现了它 */
  action: string
}

/** 与 `services/comments.ts` 的 COMMENT_ACTIONS 保持同一份 action 名。 */
export const MOBILE_ROUTABLE_CAPABILITIES: readonly CapabilityLabel[] = [
  {
    capability: 'action:comments.hot',
    label: '热门评论',
    description: '获取歌曲的热门评论',
    action: 'comments.hot'
  },
  {
    capability: 'action:comments.get',
    label: '最新评论',
    description: '分页读取歌曲评论',
    action: 'comments.get'
  }
]

export interface CapabilityImplementation {
  pluginKey: string
  pluginName: string
}

export interface CapabilitySource {
  id: string
  name: string
  implementations: readonly CapabilityImplementation[]
}

export interface CapabilityRow {
  capability: string
  label: string
  description: string
  /** 提供该能力的插件；只有一个时没有选择意义 */
  implementations: CapabilityImplementation[]
  /** 路由后仍需要手动选择，至少两个实现才展示选择入口 */
  selectable: boolean
}

export interface CapabilitySourceGroup {
  source: string
  name: string
  rows: CapabilityRow[]
}

export interface BuildCapabilityGroupsOptions {
  sources: readonly CapabilitySource[]
  /** 返回某插件声明的 action id 列表 */
  actionsOf: (pluginKey: string) => readonly string[]
  capabilities?: readonly CapabilityLabel[]
}

/**
 * 按音源聚合能力行：只保留至少有一个实现声明了该 action 的条目；
 * 统计实现数时按 pluginKey 去重（同一插件可能重复声明 provider）。
 */
export function buildCapabilityGroups(
  options: BuildCapabilityGroupsOptions
): CapabilitySourceGroup[] {
  const capabilities = options.capabilities ?? MOBILE_ROUTABLE_CAPABILITIES
  const groups: CapabilitySourceGroup[] = []
  for (const source of options.sources ?? []) {
    const rows: CapabilityRow[] = []
    for (const entry of capabilities) {
      const seen = new Set<string>()
      const implementations: CapabilityImplementation[] = []
      for (const implementation of source.implementations ?? []) {
        if (seen.has(implementation.pluginKey)) continue
        const actions = options.actionsOf(implementation.pluginKey) ?? []
        if (!actions.includes(entry.action)) continue
        seen.add(implementation.pluginKey)
        implementations.push({ ...implementation })
      }
      if (!implementations.length) continue
      rows.push({
        capability: entry.capability,
        label: entry.label,
        description: entry.description,
        implementations,
        selectable: implementations.length > 1
      })
    }
    if (rows.length) groups.push({ source: source.id, name: source.name, rows })
  }
  return groups
}

/**
 * 某个能力当前实际生效的插件：显式选择优先，否则回落到自动（首个实现）。
 * 选择已失效（插件被卸载/禁用）时同样回落到自动，避免界面显示空值。
 */
export function resolveCapabilityOwner(
  implementations: readonly CapabilityImplementation[],
  selectedKey: string | undefined
): CapabilityImplementation | undefined {
  const value = String(selectedKey ?? '').trim()
  if (value) {
    const found = implementations.find((item) => item.pluginKey === value)
    if (found) return found
  }
  return implementations[0]
}