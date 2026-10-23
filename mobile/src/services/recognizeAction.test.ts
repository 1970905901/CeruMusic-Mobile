import { describe, expect, it } from 'vitest'
import { isRecognizeAction, pickRecognizeAction } from './recognizeAction'

const command = (pluginKey: string, action: string, title = '') => ({
  pluginKey,
  action,
  id: action,
  title
})

describe('recognize action matching', () => {
  it('matches the exact action name', () => {
    expect(isRecognizeAction({ action: 'recognize' })).toBe(true)
  })

  it('accepts a namespaced variant but not an unrelated action', () => {
    expect(isRecognizeAction({ action: 'music.recognize' })).toBe(true)
    expect(isRecognizeAction({ action: 'recognize.hires' })).toBe(false)
    expect(isRecognizeAction({ action: 'search.tips' })).toBe(false)
    expect(isRecognizeAction({ action: '' })).toBe(false)
    expect(isRecognizeAction({})).toBe(false)
    expect(isRecognizeAction(null)).toBe(false)
  })

  it('does not pick a command just because its title mentions 识别', () => {
    // 移动端旧实现按标题模糊匹配，一个叫「识别旧文件」的整理命令会被当成识曲动作。
    const entries = [command('p1', 'library.cleanup', '识别旧文件并归档')]
    expect(pickRecognizeAction(entries)).toBeUndefined()
  })
})

describe('pickRecognizeAction', () => {
  const entries = [
    command('p1', 'recognize', '听歌识曲'),
    command('p2', 'recognize', '识别'),
    command('p3', 'search.tips', '搜索建议')
  ]

  it('returns the first declared action when nothing is routed', () => {
    expect(pickRecognizeAction(entries)?.pluginKey).toBe('p1')
  })

  it('honours the explicit capability route', () => {
    // 设置页里把「听歌识曲」指到 p2 之后必须真的用 p2。
    expect(pickRecognizeAction(entries, { ownerKey: 'p2' })?.pluginKey).toBe('p2')
  })

  it('prefers the current provider implementation over the rest', () => {
    expect(pickRecognizeAction(entries, { selectedKey: 'p2' })?.pluginKey).toBe('p2')
  })

  it('ignores a route pointing at a plugin that does not implement it', () => {
    expect(pickRecognizeAction(entries, { ownerKey: 'gone' })?.pluginKey).toBe('p1')
    expect(pickRecognizeAction(entries, { ownerKey: 'p3' })?.pluginKey).toBe('p1')
  })

  it('returns undefined when no plugin declares the action', () => {
    expect(pickRecognizeAction([command('p3', 'search.tips')])).toBeUndefined()
    expect(pickRecognizeAction([])).toBeUndefined()
  })
})
