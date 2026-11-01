/**
 * 插件 HTTP 的体积上限，与桌面 `requestNetwork` 的 axios 配置同口径：
 * `maxContentLength: 16 MiB`（响应体）、`maxBodyLength: 4 MiB`（请求体）。
 *
 * 移动端此前没有这道闸。`fetch` 会把整个响应读进内存，`CapacitorHttp` 也是
 * 整段返回；插件指向一个大文件地址就能让 WebView / 原生桥吃满内存，系统
 * 直接杀掉应用——用户只看到闪退，看不出是哪个插件做的。
 */
export const HTTP_MAX_BODY_BYTES = 4 * 1024 * 1024
export const HTTP_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** 请求体按实际要发出去的字节数算（`json` 先序列化，`form` 按编码后长度）。 */
function bodyBytes(input: any): number {
  if (input?.json !== undefined) {
    try {
      return utf8Bytes(JSON.stringify(input.json) ?? '')
    } catch {
      throw new Error('请求体无法序列化')
    }
  }
  if (input?.form !== undefined) {
    const form = new URLSearchParams()
    for (const [key, value] of Object.entries(input.form as Record<string, unknown>)) {
      if (value === null || value === undefined) continue
      form.append(key, String(value))
    }
    return utf8Bytes(form.toString())
  }
  if (typeof input?.body === 'string') return utf8Bytes(input.body)
  return 0
}

/**
 * 发请求之前的校验。`json` / `form` / `body` 三选一（SDK 客户端会拦，
 * 但直接调低层 RPC 的插件绕得过去），请求体超限直接拒绝。
 */
export function assertHttpLimits(input: any): void {
  const chosen = [input?.json, input?.form, input?.body].filter(
    (value) => value !== undefined
  ).length
  if (chosen > 1) throw new Error('请求体只能选择一种：json / form / body')
  const bytes = bodyBytes(input)
  if (bytes > HTTP_MAX_BODY_BYTES) {
    throw new Error(`请求体超过 ${HTTP_MAX_BODY_BYTES / 1024 / 1024} MiB 限制`)
  }
}

/**
 * 响应体是否超限。
 *
 * 判的是**读回之后**的结果：`fetch` 已经把它读进内存了，但至少不让它继续
 * 传给插件、也不让它被缓存。字符串按 UTF-8 字节算，对象按序列化后的字节算。
 */
export function responseExceedsLimit(body: unknown): boolean {
  if (typeof body === 'string') return utf8Bytes(body) > HTTP_MAX_RESPONSE_BYTES
  if (body && typeof body === 'object') {
    try {
      return utf8Bytes(JSON.stringify(body) ?? '') > HTTP_MAX_RESPONSE_BYTES
    } catch {
      return false
    }
  }
  return false
}
