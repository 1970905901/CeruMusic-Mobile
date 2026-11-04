import { describe, expect, it } from 'vitest'
import {
  MAX_DOWNLOAD_RETRIES,
  isTransientDownloadError,
  planDownloadFailure
} from './downloadRetry'

/**
 * 下载失败的自动重试，对齐桌面 `DownloadManager.handleTaskError`：
 *
 * ```ts
 * if (task.retries < 3) {
 *   task.retries++
 *   task.status = Queued
 *   this.queue.unshift(taskId)      // 重试排到队首，不让它排到队尾
 * } else {
 *   task.status = Error
 *   task.error = error.message
 * }
 * ```
 *
 * 移动端在第一次失败时就把任务标成「失败」：网络抖一下、插件短暂 429、
 * 原生 HTTP 偶发超时，整首歌就要用户手动点「重试」——一批下载里网络一抖，
 * 十几首一起变红。
 *
 * 重试的边界必须守住，否则会把用户的等待变成「一直转圈」：
 * - 只重试**临时性**失败。歌曲文件不存在、内容类型不是音频、文件超限这类
 *   换个时间再下也一样的结果，重试三次只是让失败晚到 30 秒；
 * - 用户取消 / 暂停的绝不能重试（重试等于无视用户操作）；
 * - 次数到上限后如实报错，并把最后一次失败原因带上。
 */

describe('planDownloadFailure', () => {
  it('requeues a transient failure while retries remain', () => {
    expect(
      planDownloadFailure({ retries: 0, cancelled: false, transient: true, message: 'HTTP 503' })
    ).toEqual({ action: 'retry', retries: 1, atFront: true })
  })

  it('stops retrying at the desktop limit and reports the last error', () => {
    expect(
      planDownloadFailure({
        retries: MAX_DOWNLOAD_RETRIES,
        cancelled: false,
        transient: true,
        message: 'HTTP 503'
      })
    ).toEqual({ action: 'fail', error: 'HTTP 503' })
  })

  it('never retries a failure the user caused', () => {
    // 暂停 / 取消后请求仍会返回错误（CapacitorHttp 不能中止），不能因此拉起来。
    expect(
      planDownloadFailure({ retries: 0, cancelled: true, transient: true, message: 'aborted' })
    ).toEqual({ action: 'fail', error: 'aborted' })
  })

  it('never retries a permanent failure', () => {
    // 歌曲不在资料库、内容不是音频、文件超限：重试三次只会让失败晚到。
    expect(
      planDownloadFailure({
        retries: 0,
        cancelled: false,
        transient: false,
        message: '下载内容不是音频（text/html），请检查音源是否可用'
      })
    ).toEqual({ action: 'fail', error: '下载内容不是音频（text/html），请检查音源是否可用' })
  })

  it('carries a fallback message when the failure has none', () => {
    expect(
      planDownloadFailure({ retries: 99, cancelled: false, transient: true, message: '   ' })
    ).toEqual({ action: 'fail', error: '下载失败' })
  })
})

describe('transient classification', () => {
  it('treats network and rate-limit failures as transient', () => {
    for (const message of [
      'HTTP 429',
      'HTTP 500',
      'HTTP 502',
      '请求超时',
      'net::ERR_INTERNET_DISCONNECTED',
      'Failed to fetch',
      'Network request failed',
      'Socket timeout'
    ]) {
      expect(isTransientDownloadError(new Error(message))).toBe(true)
    }
  })

  it('treats permanent failures as permanent', () => {
    for (const message of [
      '下载内容不是音频（text/html），请检查音源是否可用',
      '歌曲已不在资料库中',
      '文件超过 200 MB',
      '无法解析播放地址',
      'HTTP 404'
    ]) {
      expect(isTransientDownloadError(new Error(message))).toBe(false)
    }
  })
})
