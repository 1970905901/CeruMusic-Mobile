/**
 * 插件的低层 HTTP 出口（`ctx.http.request`）。
 *
 * 桌面口径分两层，移动端此前合成了一层：
 * - 低层 `request` **原样返回**非 2xx 状态（文档：「低层请求通常保留非 2xx
 *   状态；业务自行处理」）。插件靠它读 429 的响应体、错误码。
 * - 便捷客户端 `ctx.http.create(...)` 才在非 2xx 抛 `HttpError`。
 *
 * 权限检查留在 worker（`requestPermission` 里，带授权缓存），这里只负责
 * 参数转发与形状。返回的 `{ status, headers, body }` 是 SDK 声明的名字。
 */

export interface HostHttpDeps {
  /** 向宿主发一条 `http.request` RPC。 */
  rpc: (method: string, params: any) => Promise<any>
  /** 授权检查；不通过时抛错。`input` 里带 `operation`，用于把用户意图交给授权框。 */
  ensurePermission: (key: string, input: any) => Promise<void>
}

export function createHostHttpRequest(deps: HostHttpDeps) {
  return async function request(input: any): Promise<any> {
    if (!input?.url) throw new Error('HTTP 请求缺少 URL')
    const permissionKey = String(input.permissionKey || 'network')
    await deps.ensurePermission(permissionKey, input)
    return deps.rpc('http.request', {
      url: input.url,
      method: input.method || 'GET',
      headers: input.headers,
      query: input.query,
      json: input.json,
      form: input.form,
      body: input.body,
      timeoutMs: input.timeoutMs,
      responseType: input.responseType,
      // 宿主侧据此判断内网访问是否另有授权；不传会让局域网请求一律被拒。
      permissionKey,
      // 宿主按 `operation.id` 登记在途请求，`operations.cancel` 据此中止。
      // 只转 id 与截止时间：`signal` 属于 worker 的 realm，过不了 postMessage
      // 的结构化克隆（桌面宿主也只读 `data.operation?.id`）。
      operation: input.operation
        ? { id: input.operation.id, deadlineAt: input.operation.deadlineAt }
        : undefined
    })
  }
}
