import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_SEARCHES,
  matchSettingsText,
  normalizeRecentSearches,
  pushRecentSearch,
  searchSettings,
  settingsSearchItems
} from './settingsSearch'

/** 设置页与 GlobalBackgroundSettings.vue 中真实存在的分组锚点。 */
const GROUP_ANCHORS = new Set([
  'group-account',
  'group-plugin',
  'group-playback',
  'group-cache',
  'group-lyric',
  'group-output',
  'group-storage',
  'group-local',
  'group-appearance',
  'group-wallpaper',
  'group-tools',
  'group-about'
])

describe('settings search matching', () => {
  it('matches case-insensitively on substrings', () => {
    expect(matchSettingsText('Cache Limit', 'cache')).toBe(true)
    expect(matchSettingsText('Cache Limit', 'CACHE')).toBe(true)
    expect(matchSettingsText('Cache Limit', 'nothing')).toBe(false)
  })

  it('only enables ordered fuzzy matching for 2-4 character queries', () => {
    // 子串命中不受长度限制；单字符永远等价于子串命中。
    expect(matchSettingsText('Crossfade', 'c')).toBe(true)
    expect(matchSettingsText('Crossfade', 'z')).toBe(false)
    // 顺序字符后缀匹配只在 2-4 个字符时启用，避免长查询误命中。
    expect(matchSettingsText('Crossfade', 'cf')).toBe(true)
    expect(matchSettingsText('Crossfade', 'crsfd')).toBe(false)
  })

  it('returns false for empty text or query', () => {
    expect(matchSettingsText('', 'cache')).toBe(false)
    expect(matchSettingsText('Cache', '')).toBe(false)
  })
})

describe('settings search index', () => {
  it('covers every settings group anchor', () => {
    expect(new Set(settingsSearchItems.map((item) => item.id))).toEqual(GROUP_ANCHORS)
  })

  it('keeps ids, categories and titles unique per entry', () => {
    const keys = settingsSearchItems.map((item) => item.id + '|' + item.title)
    expect(new Set(keys).size).toBe(settingsSearchItems.length)
    for (const item of settingsSearchItems) {
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.category.length).toBeGreaterThan(0)
    }
  })
})

describe('settings search index coverage', () => {
  /**
   * 模块注释写明「新增设置项时同步补一条，避免搜索漏项」，但没有任何东西
   * 强制这条约定：路由预加载、下载占用、春节主题三项此前就漏在索引外，
   * 只能在设置页手动翻。
   *
   * 这里直接读设置页源码做对账——不是复述索引，而是拿页面上真实存在的
   * `<h2>` 标题逐条比对。新增设置项忘了补索引时，这条测试会直接指出漏了哪个。
   */
  // happy-dom 会把 import.meta.url 改写成 http 地址，读源码要用工作目录拼绝对路径
  // （vitest 以 mobile 为根目录）。
  const SOURCES = ['src/views/SettingsPage.vue', 'src/components/GlobalBackgroundSettings.vue']

  function indexedTitles(groupId: string): string[] {
    return settingsSearchItems.filter((item) => item.id === groupId).map((item) => item.title)
  }

  it('indexes every settings label that lives under a group', async () => {
    const { readFileSync } = await import('node:fs')
    const missing: string[] = []
    for (const file of SOURCES) {
      const text = readFileSync(file, 'utf8')
      // 按分组切块：`<ion-list id="group-x">` 到下一个分组之前。
      const chunks = text.split(/<ion-list id="(group-[a-z]+)"/)
      for (let index = 1; index < chunks.length; index += 2) {
        const groupId = chunks[index]
        const body = chunks[index + 1]
        for (const raw of body.match(/<h2>(.*?)<\/h2>/gs) ?? []) {
          const label = raw.replace(/<h2>|<\/h2>/g, '').trim()
          // 动态标题（插件页面等）没有固定文案，不参与对账。
          if (label.includes('{{')) continue
          if (!indexedTitles(groupId).includes(label)) missing.push(`${groupId}: ${label}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe('settings search', () => {
  it('matches a Chinese title', () => {
    const results = searchSettings('歌词偏移')
    expect(results.map((item) => item.title)).toContain('歌词偏移')
    expect(results.every((item) => item.id === 'group-lyric')).toBe(true)
  })

  it('matches English keywords case-insensitively', () => {
    expect(searchSettings('crossfade').map((item) => item.title)).toEqual(['无感过渡'])
    expect(searchSettings('wallpaper').map((item) => item.id)).toContain('group-wallpaper')
    expect(searchSettings('LOGTO').map((item) => item.title)).toContain('账号')
  })

  it('matches Chinese synonyms supplied through keywords', () => {
    // 索引不内置拼音字典（与桌面版一致），别名只能靠 keywords 显式声明。
    expect(searchSettings('倍速').map((item) => item.title)).toEqual(['播放速度'])
    expect(searchSettings('罗马音').map((item) => item.title)).toEqual(['显示音译'])
  })

  it('matches a group name and returns the whole group', () => {
    const results = searchSettings('下载与存储')
    // 断言「整组返回」而不是某个固定条数：新增设置项不应让这条测试失败。
    const wholeGroup = settingsSearchItems.filter((item) => item.id === 'group-storage')
    expect(wholeGroup.length).toBeGreaterThan(0)
    expect(results).toEqual(wholeGroup)
  })

  it('trims the query and returns an empty list for blank input', () => {
    expect(searchSettings('')).toEqual([])
    expect(searchSettings('   ')).toEqual([])
    expect(searchSettings('  无感过渡  ').map((item) => item.title)).toEqual(['无感过渡'])
  })

  it('preserves the declared order and can search a custom index', () => {
    const results = searchSettings('过滤')
    const indexes = results.map((item) => settingsSearchItems.indexOf(item))
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
    expect(searchSettings('cache', [
      { id: 'group-a', category: 'A', title: '缓存', keywords: ['cache'] },
      { id: 'group-b', category: 'B', title: '别的', keywords: [] }
    ])).toEqual([{ id: 'group-a', category: 'A', title: '缓存', keywords: ['cache'] }])
  })
})

describe('recent settings searches', () => {
  it('moves a repeated id to the front and caps the list', () => {
    const list = ['group-a', 'group-b', 'group-c']
    expect(pushRecentSearch(list, 'group-c')).toEqual(['group-c', 'group-a', 'group-b'])
    const full = ['a', 'b', 'c', 'd', 'e']
    expect(pushRecentSearch(full, 'f')).toEqual(['f', 'a', 'b', 'c', 'd'])
    expect(pushRecentSearch(full, 'f').length).toBe(MAX_RECENT_SEARCHES)
  })

  it('keeps the list unchanged for an empty id', () => {
    expect(pushRecentSearch(['a'], '')).toEqual(['a'])
  })

  it('drops unknown, duplicated and non-string persisted entries', () => {
    const known = new Set(['group-a', 'group-b'])
    expect(normalizeRecentSearches(['group-a', 'group-a', 'group-z', 5, null], known)).toEqual([
      'group-a'
    ])
    expect(normalizeRecentSearches('nope', known)).toEqual([])
    expect(normalizeRecentSearches(undefined, known)).toEqual([])
  })

  it('accepts only ids that exist in the shipped index by default', () => {
    expect(normalizeRecentSearches(['group-wallpaper', 'group-unknown'])).toEqual([
      'group-wallpaper'
    ])
  })
})
