import { Capacitor, CapacitorHttp } from '@capacitor/core'

export type AIProvider = 'deepseek' | 'openai' | 'siliconflow' | 'custom'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  baseURL: string
  model: string
}

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const AI_PROVIDERS: Array<{
  value: AIProvider
  label: string
  baseURL: string
  model: string
}> = [
  {
    value: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat'
  },
  {
    value: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  {
    value: 'siliconflow',
    label: '硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3'
  },
  { value: 'custom', label: '自定义 OpenAI 兼容服务', baseURL: '', model: '' }
]

export const AI_SYSTEM_PROMPT =
  '你是 Ceru Music 的 AI 音乐助手。你熟知古今中外的流行音乐、音乐人和音乐理论，' +
  '可以推荐音乐、解释歌曲含义、分析编曲与歌词、按场景生成歌单建议。' +
  '请用友善、专业、简洁的中文回答；不确定的事实要明确说明。'

export function validateAIConfig(config: AIConfig): string {
  if (!config.apiKey.trim()) return '请先配置 API Key'
  if (!config.baseURL.trim()) return '请填写 API Base URL'
  if (!config.model.trim()) return '请填写模型名称'
  try {
    const url = new URL(config.baseURL)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return 'API 地址必须使用 HTTPS（本地调试除外）'
    }
  } catch {
    return 'API Base URL 格式不正确'
  }
  return ''
}

function endpoint(config: AIConfig): string {
  const base = config.baseURL.trim().replace(/\/+$/, '')
  return base.endsWith('/chat/completions') ? base : base + '/chat/completions'
}

function parseReply(data: any): string {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim()
  }
  const message = data?.error?.message || data?.message
  if (message) throw new Error(String(message))
  throw new Error('AI 服务返回了空回复')
}

export async function askAI(
  messages: AIChatMessage[],
  config: AIConfig,
  signal?: AbortSignal
): Promise<string> {
  const invalid = validateAIConfig(config)
  if (invalid) throw new Error(invalid)
  const body = {
    model: config.model.trim(),
    messages,
    temperature: 0.7,
    max_tokens: 1600,
    stream: false
  }
  const headers = {
    Authorization: 'Bearer ' + config.apiKey.trim(),
    'Content-Type': 'application/json'
  }

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url: endpoint(config),
      headers,
      data: body,
      connectTimeout: 20000,
      readTimeout: 120000
    })
    let payload = response.data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        // Keep the raw body for a useful error below.
      }
    }
    if (response.status < 200 || response.status >= 300) {
      const message =
        (typeof payload === 'object' && (payload?.error?.message || payload?.message)) ||
        'AI 请求失败 (' + response.status + ')'
      throw new Error(String(message))
    }
    return parseReply(payload)
  }

  const response = await fetch(endpoint(config), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  })
  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || 'AI 请求失败 (' + response.status + ')')
  }
  return parseReply(payload)
}

/**
 * 从一段 SSE 文本块里取出增量内容。
 *
 * OpenAI 兼容流式协议每条事件形如 `data: {"choices":[{"delta":{"content":"x"}}]}`，
 * 结束标记是 `data: [DONE]`。抽成纯函数（输入已缓冲的文本，输出 delta 列表与
 * 是否遇到结束标记）是为了能对「半个事件跨 chunk 到达」「注释行/空行」这些
 * 边界做单测——它们在真机上必然出现。
 */
export function extractSseDeltas(chunk: string): { deltas: string[]; done: boolean } {
  const deltas: string[] = []
  let done = false
  for (const rawLine of chunk.split(/\r?\n/)) {
    const line = rawLine.trimStart()
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue
    if (payload === '[DONE]') {
      done = true
      continue
    }
    try {
      const parsed = JSON.parse(payload)
      const delta = parsed?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) deltas.push(delta)
    } catch {
      // 半个事件跨 chunk：留给下一轮拼接，这里跳过而不是抛错。
    }
  }
  return { deltas, done }
}

export interface AskAIStreamOptions {
  signal?: AbortSignal
  onChunk?: (delta: string) => void
}

/**
 * 流式版 askAI（对齐桌面版 ai-ask-stream 的逐字渲染）。
 *
 * 移动端没有 Electron 主进程代发请求：流式只能走 WebView `fetch`，因此受
 * CORS 与 `response.body` 支持度限制（AI 服务多数不发 CORS 头；iOS 14.0–14.4
 * 的 WKWebView 没有 ReadableStream）。任何一步不可用都回落到一次性
 * `askAI`——回答内容一致，只是整段到达；页面永远不会因流式不可用而坏掉。
 */
export async function askAIStream(
  messages: AIChatMessage[],
  config: AIConfig,
  options: AskAIStreamOptions = {}
): Promise<string> {
  const invalid = validateAIConfig(config)
  if (invalid) throw new Error(invalid)

  let response: Response
  try {
    response = await fetch(endpoint(config), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.apiKey.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model.trim(),
        messages,
        temperature: 0.7,
        max_tokens: 1600,
        stream: true
      }),
      signal: options.signal
    })
  } catch {
    // 网络/CORS 层直接失败（没有响应可读）：一次性路径重试。
    return askAI(messages, config, options.signal)
  }

  if (!response.ok || !response.body) {
    // 非 2xx 时尽量读出服务端错误；body 不可读（老 WebView）同样回落。
    if (!response.body) return askAI(messages, config, options.signal)
    const text = await response.text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }
    throw new Error(
      payload?.error?.message || payload?.message || 'AI 请求失败 (' + response.status + ')'
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let carry = ''
  try {
    for (;;) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) break
      carry += decoder.decode(value, { stream: true })
      // 只处理完整行；最后一段可能是不完整事件，留在 carry。
      const lines = carry.split(/\r?\n/)
      carry = lines.pop() ?? ''
      const { deltas, done } = extractSseDeltas(lines.join('\n'))
      for (const delta of deltas) {
        full += delta
        options.onChunk?.(delta)
      }
      if (done) break
    }
  } finally {
    reader.releaseLock?.()
  }
  if (!full.trim()) {
    throw new Error('AI 服务返回了空回复')
  }
  return full
}
