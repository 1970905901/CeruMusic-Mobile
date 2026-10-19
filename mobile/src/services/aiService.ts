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
