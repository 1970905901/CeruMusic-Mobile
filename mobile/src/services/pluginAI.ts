import { AI_SYSTEM_PROMPT, askAI, type AIChatMessage, type AIConfig } from '@/services/aiService'

export interface PluginAIRequest {
  prompt?: unknown
  maxOutputChars?: unknown
}

export interface PluginAIResult {
  text: string
}

const MAX_PROMPT_CHARS = 20_000
const DEFAULT_OUTPUT_CHARS = 20_000
const MAX_OUTPUT_CHARS = 50_000

export function validatePluginAIRequest(request: PluginAIRequest): {
  prompt: string
  maxOutputChars: number
} {
  const prompt = String(request?.prompt ?? '')
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`AI 提示词长度必须在 1 到 ${MAX_PROMPT_CHARS} 字符之间`)
  }
  const rawLimit = request?.maxOutputChars ?? DEFAULT_OUTPUT_CHARS
  const maxOutputChars = Number(rawLimit)
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1 || maxOutputChars > MAX_OUTPUT_CHARS) {
    throw new Error(`AI 输出上限必须在 1 到 ${MAX_OUTPUT_CHARS} 字符之间`)
  }
  return { prompt, maxOutputChars }
}

export async function generatePluginAI(
  request: PluginAIRequest,
  config: AIConfig
): Promise<PluginAIResult> {
  const { prompt, maxOutputChars } = validatePluginAIRequest(request)
  const messages: AIChatMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ]
  const text = await askAI(messages, config)
  return { text: text.slice(0, maxOutputChars) }
}
