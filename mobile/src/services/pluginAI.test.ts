import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validatePluginAIRequest, generatePluginAI } from '@/services/pluginAI'
import { askAI, type AIConfig } from '@/services/aiService'

const config: AIConfig = {
  provider: 'custom',
  apiKey: 'test-key',
  baseURL: 'https://ai.example.com/v1',
  model: 'test-model'
}

vi.mock('@/services/aiService', () => ({
  AI_SYSTEM_PROMPT: 'system prompt',
  askAI: vi.fn()
}))

const mockedAskAI = vi.mocked(askAI)

describe('plugin AI', () => {
  beforeEach(() => {
    mockedAskAI.mockReset()
  })

  it('validates prompt and output bounds', () => {
    expect(validatePluginAIRequest({ prompt: 'hello' })).toEqual({
      prompt: 'hello',
      maxOutputChars: 20_000
    })
    expect(() => validatePluginAIRequest({ prompt: '' })).toThrow(
      'AI 提示词长度必须在 1 到 20000 字符之间'
    )
    expect(() => validatePluginAIRequest({ prompt: 'x', maxOutputChars: 0 })).toThrow(
      'AI 输出上限必须在 1 到 50000 字符之间'
    )
    expect(() => validatePluginAIRequest({ prompt: 'x', maxOutputChars: 50_001 })).toThrow(
      'AI 输出上限必须在 1 到 50000 字符之间'
    )
  })

  it('uses the host AI service and truncates the reply', async () => {
    mockedAskAI.mockResolvedValueOnce('x'.repeat(31))
    await expect(
      generatePluginAI({ prompt: '推荐歌曲', maxOutputChars: 30 }, config)
    ).resolves.toEqual({ text: 'x'.repeat(30) })
    expect(mockedAskAI).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: '推荐歌曲' }
      ],
      config
    )
  })
})
