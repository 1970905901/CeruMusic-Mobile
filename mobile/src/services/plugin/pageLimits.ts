/**
 * 各服务自己的每页上限（SDK 文档里的数字）。
 *
 * `services/plugin/paging` 的 `MAX_PAGE_SIZE = 500` 是**宿主内部**的兜底，
 * 用在罚款前挡住「一次要一千页」的请求。但文档对具体服务另有约定：
 * `history.list` 每页最多 50 条（桌面 `handlePluginHostService` 固定切 50），
 * `localMusic.list` 桌面固定 100 条。移动端此前对两者都用同一个 500 上限，
 * 插件传 `limit: 500` 能一次拿走全部历史——插件的翻页逻辑按 50 写完的，
 * 拿到 500 条反而以为后面还有、继续翻。
 */
export const HISTORY_PAGE_SIZE = 50
export const LOCAL_MUSIC_PAGE_SIZE = 100

export function clampPageLimit(limit: unknown, max: number, fallback: number): number {
  const size = Number(limit)
  if (!Number.isFinite(size) || size <= 0) return fallback
  return Math.min(max, Math.floor(size))
}
