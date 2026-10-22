import { describe, expect, it } from 'vitest'
import {
  MISSING_DOWNLOAD_MESSAGE,
  isMissingFileError,
  tasksNeedingValidation
} from './downloadValidation'

const task = (
  id: string,
  overrides: Partial<{
    status: string
    directory: 'data' | 'documents' | 'saf'
    relativePath: string
  }> = {}
) => ({
  id,
  status: 'completed',
  directory: 'data' as const,
  relativePath: `downloads/${id}.mp3`,
  ...overrides
})

describe('download validation targets', () => {
  it('only checks completed tasks', () => {
    // 进行中/失败的任务本来就可能没有文件，校验它们只会制造假失败。
    const result = tasksNeedingValidation([
      task('done'),
      task('running', { status: 'running' }),
      task('paused', { status: 'paused' }),
      task('failed', { status: 'failed' })
    ])
    expect(result.map((item) => item.id)).toEqual(['done'])
  })

  it('skips SAF tasks because the file lives outside the app sandbox', () => {
    // SAF 目录里只有 document URI，没有 stat 能力；误判会把导出的歌全标成失败。
    expect(
      tasksNeedingValidation([task('saf', { directory: 'saf' })]).length
    ).toBe(0)
  })

  it('skips records without a relative path', () => {
    expect(
      tasksNeedingValidation([task('legacy', { relativePath: '' })]).length
    ).toBe(0)
  })

  it('keeps documents and data tasks', () => {
    const result = tasksNeedingValidation([
      task('data-task', { directory: 'data' }),
      task('docs-task', { directory: 'documents' })
    ])
    expect(result.map((item) => item.id)).toEqual(['data-task', 'docs-task'])
  })
})

describe('missing file detection', () => {
  it('recognizes the not-found shapes both platforms report', () => {
    expect(isMissingFileError({ code: 'NOT_FOUND', message: 'nope' })).toBe(true)
    expect(isMissingFileError(new Error('Entry does not exist.'))).toBe(true)
    expect(isMissingFileError(new Error('ENOENT: no such file or directory'))).toBe(true)
  })

  it('does not treat a permission or bridge failure as a deleted file', () => {
    // 权限抖动、原生桥接异常都不代表文件没了；据此改判失败会毁掉整个下载列表。
    expect(isMissingFileError({ code: 'PERMISSION_DENIED', message: 'denied' })).toBe(false)
    expect(isMissingFileError(new Error('Unable to read file'))).toBe(false)
    expect(isMissingFileError(null)).toBe(false)
    expect(isMissingFileError('Entry does not exist.')).toBe(false)
  })

  it('uses the desktop wording for the error', () => {
    expect(MISSING_DOWNLOAD_MESSAGE).toBe('文件已删除或移动')
  })
})
