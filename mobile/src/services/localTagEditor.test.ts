import { describe, expect, it } from 'vitest'
import {
  applyCandidateToForm,
  coverNeedsFetch,
  emptyTagForm,
  parseYearInput,
  tagFormError
} from './localTagEditor'

describe('tag form validation', () => {
  it('accepts an empty year as "clear the year"', () => {
    expect(parseYearInput('   ')).toEqual({ ok: true, year: null })
    expect(parseYearInput('2004')).toEqual({ ok: true, year: 2004 })
  })

  it('rejects zero, negative and non-numeric years', () => {
    // 0 与负数写进文件标签会变成非法年份；桌面版同样拒绝。
    expect(parseYearInput('0').ok).toBe(false)
    expect(parseYearInput('-1').ok).toBe(false)
    expect(parseYearInput('20x4').ok).toBe(false)
  })

  it('truncates fractional years instead of writing them verbatim', () => {
    expect(parseYearInput('2004.9')).toEqual({ ok: true, year: 2004 })
  })

  it('requires a title because an empty one renders as a blank row', () => {
    expect(tagFormError(emptyTagForm())).toBe('标题不能为空')
    expect(tagFormError({ ...emptyTagForm(), title: '  ' })).toBe('标题不能为空')
  })

  it('reports a bad year before saving', () => {
    expect(tagFormError({ ...emptyTagForm(), title: 'x', year: 'abc' })).toBe('年份格式不正确')
    expect(tagFormError({ ...emptyTagForm(), title: 'x', year: '' })).toBeNull()
  })
})

describe('applying a search candidate', () => {
  const form = { ...emptyTagForm(), title: '旧标题', genre: '手工流派' }

  it('overwrites the fields the candidate actually carries', () => {
    const next = applyCandidateToForm(form, {
      title: '新标题',
      artists: ['A', 'B'],
      album: '专辑',
      year: 2004
    })
    expect(next.title).toBe('新标题')
    expect(next.artist).toBe('A / B')
    expect(next.album).toBe('专辑')
    expect(next.year).toBe('2004')
  })

  it('keeps hand-edited values the candidate does not provide', () => {
    // 候选没有流派时不能把用户手填的流派清空。
    const next = applyCandidateToForm(form, { title: '新标题', artists: ['A'] })
    expect(next.genre).toBe('手工流派')
  })

  it('ignores an empty candidate title instead of blanking the form', () => {
    const next = applyCandidateToForm(form, { title: '   ', artists: [] })
    expect(next.title).toBe('旧标题')
    expect(next.artist).toBe(form.artist)
  })
})

describe('cover handling', () => {
  it('only fetches covers that are not already inline data', () => {
    expect(coverNeedsFetch('https://cdn.example/a.jpg')).toBe(true)
    expect(coverNeedsFetch('blob:abc')).toBe(true)
    expect(coverNeedsFetch('data:image/jpeg;base64,AAAA')).toBe(false)
    expect(coverNeedsFetch('')).toBe(false)
    expect(coverNeedsFetch(undefined)).toBe(false)
  })
})
