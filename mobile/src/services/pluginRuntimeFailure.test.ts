import { describe, expect, it } from 'vitest'
import { describeRuntimeFailure, RUNTIME_STOPPED_REASON } from './pluginRuntimeFailure'

/**
 * 插件运行时停止后的提示文案，对齐桌面 `PluginHost.event('closed')` →
 * 主进程 `setPluginEnabled(false)` → 渲染进程 `globaPlayList` 的
 * `MessagePlugin.error`。
 *
 * 「要不要停用」的判定在运行时侧：主动 dispose 的 error 直接忽略，激活期间的
 * 失败走 `onFailed`，只有激活之后的停止才会触发 `onStopped`。这里只钉文案，
 * 因为它是用户唯一能看到的东西——写错一句，用户就不知道插件为什么被关掉。
 */

describe('describeRuntimeFailure', () => {
  it('uses the desktop wording verbatim', () => {
    expect(describeRuntimeFailure(RUNTIME_STOPPED_REASON)).toBe(
      '插件已被禁用：插件运行环境已停止。请检查插件是否包含死循环或异常逻辑，必要时重新加载或卸载该插件。'
    )
  })

  it('keeps the runtime-specific reason when there is one', () => {
    // worker 抛出的具体错误（例如内存耗尽被回收）比笼统的「已停止」更有用。
    expect(describeRuntimeFailure('Maximum call stack size exceeded')).toContain(
      '插件已被禁用：Maximum call stack size exceeded。'
    )
  })

  it('falls back to the neutral reason when the runtime gave none', () => {
    // worker 被系统直接杀掉时 `event.message` 可能是空串或 undefined。
    for (const empty of ['', '   ', undefined, null]) {
      expect(describeRuntimeFailure(empty)).toContain(RUNTIME_STOPPED_REASON)
      expect(describeRuntimeFailure(empty)).not.toContain('插件已被禁用：。')
    }
  })
})
