import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPluginProgress,
  closePluginProgress,
  createPluginProgress,
  pluginProgressState,
  updatePluginProgress
} from './pluginProgress'

beforeEach(() => {
  pluginProgressState.items = []
})

describe('plugin progress ownership', () => {
  it('records which plugin created a card', () => {
    const id = createPluginProgress({ title: '扫描歌单' }, 'com.example.plugin')
    const item = pluginProgressState.items.find((entry) => entry.id === id)
    expect(item?.owner).toBe('com.example.plugin')
  })

  it('clears only the stopped plugin’s cards', () => {
    // 插件崩溃或被禁用时不会再调用 ui.progress.close，
    // 但同一时间别的插件可能还有任务在跑，不能一起清掉。
    createPluginProgress({ title: 'A 任务' }, 'plugin-a')
    createPluginProgress({ title: 'B 任务' }, 'plugin-b')
    clearPluginProgress('plugin-a')
    expect(pluginProgressState.items.map((item) => item.title)).toEqual(['B 任务'])
  })

  it('does nothing for an empty or unknown owner', () => {
    createPluginProgress({ title: 'A 任务' }, 'plugin-a')
    clearPluginProgress('')
    clearPluginProgress('missing')
    expect(pluginProgressState.items).toHaveLength(1)
  })

  it('leaves host-created cards (no owner) alone', () => {
    // LibraryPage 主动创建的批量匹配进度没有 owner，不能被插件清理顺手删掉。
    createPluginProgress({ title: '批量匹配' })
    createPluginProgress({ title: '插件任务' }, 'plugin-a')
    clearPluginProgress('plugin-a')
    expect(pluginProgressState.items.map((item) => item.title)).toEqual(['批量匹配'])
  })

  it('still supports closing a single card explicitly', () => {
    const id = createPluginProgress({ title: 'A 任务' }, 'plugin-a')
    closePluginProgress(id)
    expect(pluginProgressState.items).toHaveLength(0)
  })
})

describe('plugin progress values', () => {
  it('normalises fractions and percentages into 0..1', () => {
    const id = createPluginProgress({ title: 't', value: 0.5 }, 'p')
    updatePluginProgress(id, { value: 42 })
    expect(pluginProgressState.items[0].value).toBeCloseTo(0.42)
    updatePluginProgress(id, { progress: 1 })
    expect(pluginProgressState.items[0].value).toBe(1)
  })

  it('ignores junk values instead of resetting the bar', () => {
    const id = createPluginProgress({ title: 't', value: 0.6 }, 'p')
    updatePluginProgress(id, { value: 'nope' })
    expect(pluginProgressState.items[0].value).toBe(0.6)
  })
})
