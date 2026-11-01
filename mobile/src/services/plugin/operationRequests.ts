/**
 * 进行中插件请求的登记表，按 **operation.id** 分组。
 *
 * 桌面 `PluginHost` 给每条 `http.request` 建一个 `AbortController`，按
 * `data.operation?.id` 收进集合；收到 `operations.cancel` 就把该 id 名下的
 * 全部 abort。移动端此前既没有这张表，也没有 `operations.cancel` 分支：
 * 插件那边已经因为超时/放弃收到错误，网络请求却还在手机后台跑完，
 * 白耗流量与电量。
 *
 * 登记返回一个 `release`，请求结束时调用即可摘掉，避免表里堆着已结束的项。
 */
export interface OperationRequests {
  /** 登记一个控制器，返回结束时的释放函数。没有 id 时是空操作。 */
  track(operationId: string, controller: AbortController): () => void
  /** 中止该操作名下的全部请求，返回中止了几个。 */
  cancel(operationId: string): number
  /** 运行时销毁时清空：所有在途请求一起中止。 */
  cancelAll(): number
}

export function createOperationRequests(): OperationRequests {
  const groups = new Map<string, Set<AbortController>>()

  return {
    track(operationId, controller) {
      const id = String(operationId ?? '')
      // 没有 operation 的调用（老插件或宿主自造上下文）不该被登记，
      // 否则一条 `cancel('')` 就能误伤所有同类请求。
      if (!id) return () => {}

      const group = groups.get(id) ?? new Set<AbortController>()
      group.add(controller)
      groups.set(id, group)

      let released = false
      return () => {
        if (released) return
        released = true
        group.delete(controller)
        if (!group.size) groups.delete(id)
      }
    },

    cancel(operationId) {
      const group = groups.get(String(operationId ?? ''))
      if (!group) return 0
      // 先摘表再 abort：abort 会同步触发插件的 signal 监听，那里可能又调进来。
      groups.delete(String(operationId ?? ''))
      for (const controller of group) controller.abort()
      return group.size
    },

    cancelAll() {
      const all = [...groups.values()]
      groups.clear()
      let count = 0
      for (const group of all) {
        for (const controller of group) {
          controller.abort()
          count++
        }
      }
      return count
    }
  }
}
