/**
 * 无感过渡（智能交叉淡化）编排层。
 *
 * 触发时序对齐桌面版 `utils/audio/crossfade.ts`：进入尾段 15s 观察窗口后开始采样平均
 * RMS；安静时刻（RMS < 0.04）可从剩余 13s 起触发，剩余 12s 保底触发，剩余 8s 兜底
 * 触发；过渡时长按剩余时间在 6s ~ 12s 之间取值。
 *
 * 移动端只有一条播放链路（`stores/player.ts` 的单例 <audio>），因此沿用桌面版
 * “提前翻转槽位”的语义：交接瞬间主元素就换成新歌，进度条、歌词、媒体会话与队列立即
 * 指向新歌；旧歌转到临时尾巴元素上继续播放并做等功率淡出，淡出结束后销毁。
 * 这样无需给 store 引入双槽抽象，也不会在过渡收尾时留下重新加载的断点。
 *
 * 交接顺序（全程不断声）：
 *   1. 进入观察窗口时就把尾巴元素建好并预载旧歌，只留极小起播延迟；
 *   2. 触发时尾巴先静音起播，再把主元素静音、尾巴同步到当前音量，交接发生在同一帧；
 *   3. 之后才去装载新歌；装载期间由尾巴继续播放旧歌，因此网络再慢也不会出现空档；
 *   4. 新歌就绪后开始等功率包络：主元素 0→满，尾巴 满→0。
 *
 * 已知取舍：尾巴元素不接 Web Audio 效果链（可视化、均衡器只挂在主元素上），
 * 淡出中的旧歌尾段不带音效；该段音量本身在归零，听感影响有限。
 */
import { reactive } from 'vue'
import { ensureTailEffectChain, releaseTailEffectChain } from './audioEffects'
import type { Track } from '@/types/music'
import {
  OBSERVATION_WINDOW_SEC,
  canCrossfade,
  crossfadeCurves,
  fadeDuration,
  markRange,
  pushRmsSample,
  shouldTrigger
} from './crossfadeCurve'

/** 与 `volumeTransition` 使用相同的步进，便于用假定时器测试。 */
const ENVELOPE_STEP_MS = 50
/** 桌面版以 100ms 采样一次 RMS。 */
const RMS_STEP_MS = 100
/** 兜底收尾：包络定时器被后台节流时，也不会让旧歌一直响下去。 */
const ENVELOPE_SLACK_MS = 250
/** 桌面版在淡入结束后仍保留 8 秒的淡入区间标记。 */
const FADE_IN_MARK_HOLD_SEC = 8

/**
 * 编排层只用到这几个成员，因此测试可传普通对象；
 * 真实调用方传 `HTMLAudioElement`（结构兼容）。
 */
export interface CrossfadeElement {
  src: string
  volume: number
  currentTime: number
  playbackRate: number
  duration: number
  play(): Promise<void> | void
  pause(): void
  load(): void
  removeAttribute(name: string): void
  addEventListener(type: 'ended', listener: () => void): void
}

export interface CrossfadeHost {
  /** 始终代表“当前歌曲”的主播放元素。 */
  getElement(): CrossfadeElement
  /** 生效音量（静音时为 0）。 */
  getVolume(): number
  getPlaybackRate(): number
  /** 设置项与运行环境是否允许过渡（一起听房间内不做过渡）。 */
  isEnabled(): boolean
  /** 下一首；单曲循环或列表末尾返回 null。 */
  peekNext(): Track | null
  /**
   * 把下一首装载到主元素并起播；成功返回 true。
   * 失败时返回 false，由调用方回退（store 自身的错误状态照常上报）。
   * 传入的 track 就是进入观察窗口时选定的那一首，避免随机模式下前后选到不同歌曲。
   */
  advanceToNext(track: Track): Promise<boolean>
  /** 保留当前音源交给尾巴元素；没有可播放音源时返回 null。 */
  retainOutgoing(): { source: string; positionSec: number } | null
  /** 交接完成后收尾：主元素已不再使用该音源，可以回收。 */
  releaseOutgoing(): void
  /** 回滚或提前取消：由播放器自行判断能否回收，仍在使用时绝不能撤销。 */
  restoreOutgoing(): void
  /** 平均 RMS；拿不到分析节点时返回 Infinity，于是只有保底的时间规则生效。 */
  readAverageRms(): number
  createTailElement(): CrossfadeElement
}

let host: CrossfadeHost | null = null
/** 包络已启动。 */
let active = false
/** 已进入观察窗口，尾巴已预载。 */
let scheduled = false
/** 正在交接（尚未进入包络）。 */
let starting = false
let tail: CrossfadeElement | null = null
/** 已占用旧音源：收尾/取消时必须走 release 或 restore。 */
let retained = false
/** 主元素是否已经换成新歌：决定收尾时能否直接回收旧音源。 */
let handedOver = false
let rmsTimer: ReturnType<typeof setInterval> | null = null
let envelopeTimer: ReturnType<typeof setInterval> | null = null
let finishTimer: ReturnType<typeof setTimeout> | null = null
/** 淡入区间标记的自动清除定时器。 */
let fadeInMarkTimer: ReturnType<typeof setTimeout> | null = null
let rmsWindow: number[] = []
/** 进入观察窗口时选定的下一首；交接时按它装载，保证前后一致。 */
let pendingNext: Track | null = null

/**
 * 供进度条订阅的标记状态（对应桌面版 `crossfadeState`）。
 * - `scheduled`：已进入观察窗口，预告区间在进度条末尾以斜纹块显示；
 * - `active`：交集淡化进行中；
 * - `fadeInMarkEnd`：淡入完成后新歌开头 0 ~ 该秒数标为淡入段，8 秒后清除。
 * 桌面版在早期翻转槽位后 `fadeStart/fadeDuration` 不再有意义（老歌不再可见），
 * 这里保持一致，不再暴露“当前正在淡化的区段”。
 */
export const crossfadeState = reactive({
  active: false,
  scheduled: false,
  markStart: 0,
  markEnd: 0,
  fadeInMarkEnd: 0
})

function liveRemainingSec(element: CrossfadeElement): number {
  const duration = element.duration
  if (!Number.isFinite(duration) || duration <= 0) return -1
  const current = Number.isFinite(element.currentTime) ? element.currentTime : 0
  return duration - current
}

/**
 * 刷新进度条上的过渡预告区间。
 * 与桌面版一致：只看曲目时长，因此整首歌期间都能看到“这里可能发生过渡”的提示；
 * 关闭设置、一起听房间内、曲目过短则清空标记。
 */
function updateMarkRange(): void {
  const current = host
  const duration = current ? current.getElement().duration : 0
  const range = current && current.isEnabled() ? markRange(duration) : null
  crossfadeState.markStart = range ? range.start : 0
  crossfadeState.markEnd = range ? range.end : 0
}

function stopFadeInMarkTimer(): void {
  if (fadeInMarkTimer !== null) {
    clearTimeout(fadeInMarkTimer)
    fadeInMarkTimer = null
  }
}

/** 过渡完成后在新歌开头标记淡入段，并在一段时间后自动清除。 */
function markFadeIn(fadeTime: number): void {
  stopFadeInMarkTimer()
  crossfadeState.fadeInMarkEnd = fadeTime
  fadeInMarkTimer = setTimeout(() => {
    crossfadeState.fadeInMarkEnd = 0
    fadeInMarkTimer = null
  }, (fadeTime + FADE_IN_MARK_HOLD_SEC) * 1000)
}

function stopRmsWatch(): void {
  if (rmsTimer !== null) {
    clearInterval(rmsTimer)
    rmsTimer = null
  }
  rmsWindow = []
}

function stopEnvelope(): void {
  if (envelopeTimer !== null) {
    clearInterval(envelopeTimer)
    envelopeTimer = null
  }
}

function stopFinishTimer(): void {
  if (finishTimer !== null) {
    clearTimeout(finishTimer)
    finishTimer = null
  }
}

function destroyTail(): void {
  const element = tail
  tail = null
  if (!element) return
  releaseTailEffectChain()
  try {
    element.pause()
  } catch {
    // 元素可能已被回收。
  }
  try {
    element.removeAttribute('src')
    element.load()
  } catch {
    // 清理失败不影响主链路播放。
  }
}

/**
 * 结束对旧音源的占用。
 * 已完成交接 → 旧歌只在尾巴上，可以回收；未完成交接 → 主元素还在用它，只能交还。
 */
function settleOutgoing(): void {
  if (!retained) return
  retained = false
  if (handedOver) {
    handedOver = false
    host?.releaseOutgoing()
    return
  }
  host?.restoreOutgoing()
}

/** 收尾：停包络、销毁尾巴、恢复主元素音量，并结算旧音源。 */
function finishCrossfade(): void {
  if (!active && !starting && !tail) return
  stopEnvelope()
  stopFinishTimer()
  destroyTail()
  active = false
  starting = false
  if (host) host.getElement().volume = host.getVolume()
  settleOutgoing()
  crossfadeState.active = false
  crossfadeState.scheduled = false
  // 主元素已经是新歌，预告区间改按新歌时长重新计算。
  updateMarkRange()
}

/**
 * 取消预定或回滚进行中的过渡；可重复调用。
 * `keepVolume` 供暂停/停止使用：调用方紧接着会自己做淡出，
 * 这里不应先把音量跳回满值。
 */
export function cancelCrossfade(options?: { keepVolume?: boolean }): void {
  const element = host?.getElement()
  const target = host?.getVolume() ?? 1
  const wasBusy = active || starting || retained
  stopRmsWatch()
  stopEnvelope()
  stopFinishTimer()
  destroyTail()
  active = false
  starting = false
  scheduled = false
  pendingNext = null
  settleOutgoing()
  if (wasBusy && element && !options?.keepVolume) element.volume = target
  // 与桌面版 resetState 一致：取消时同时清掉进度条标记，等下一次 timeupdate 再重算。
  stopFadeInMarkTimer()
  crossfadeState.active = false
  crossfadeState.scheduled = false
  crossfadeState.fadeInMarkEnd = 0
  crossfadeState.markStart = 0
  crossfadeState.markEnd = 0
}

/** 进入观察窗口：提前把旧歌交给尾巴预载，让交接几乎零延迟。 */
function armTail(): boolean {
  const current = host
  if (!current || tail) return !!tail
  const outgoing = current.retainOutgoing()
  if (!outgoing?.source) return false
  retained = true
  const tailElement = current.createTailElement()
  tailElement.src = outgoing.source
  tailElement.playbackRate = current.getPlaybackRate()
  tailElement.volume = 0
  try {
    tailElement.load()
  } catch {
    // 预载失败仍可能在触发时正常起播，不因此放弃过渡。
  }
  tail = tailElement
  // 主链已接管音频时，让尾巴也走同一条效果链，音色才不会在交接瞬间跳变。
  ensureTailEffectChain(tailElement as unknown as HTMLAudioElement)
  return true
}

function startEnvelope(
  element: CrossfadeElement,
  tailElement: CrossfadeElement,
  fadeTime: number
): void {
  stopEnvelope()
  stopFinishTimer()
  const samples = crossfadeCurves.fadeOut.length
  const steps = Math.max(1, Math.round((fadeTime * 1000) / ENVELOPE_STEP_MS))
  const target = host?.getVolume() ?? 1
  let step = 0

  element.volume = 0
  tailElement.volume = target

  envelopeTimer = setInterval(() => {
    step += 1
    const progress = Math.min(1, step / steps)
    const index = Math.min(samples - 1, Math.floor(progress * (samples - 1)))
    element.volume = target * crossfadeCurves.fadeIn[index]
    tailElement.volume = target * crossfadeCurves.fadeOut[index]
    if (progress >= 1) finishCrossfade()
  }, ENVELOPE_STEP_MS)
  // 兜底：包络定时器被节流、或旧歌提前放完时也要收尾。
  finishTimer = setTimeout(finishCrossfade, fadeTime * 1000 + ENVELOPE_SLACK_MS)
}

async function beginCrossfade(): Promise<void> {
  const current = host
  if (!current || starting || active) return
  if (!tail && !armTail()) return
  const tailElement = tail
  if (!tailElement) return
  starting = true

  const element = current.getElement()
  const fadeTime = fadeDuration(liveRemainingSec(element))
  const target = current.getVolume()

  // 尾巴先静音起播，保证交接时它已经在正确位置输出，不会出现空档。
  tailElement.volume = 0
  tailElement.currentTime = Number.isFinite(element.currentTime) ? element.currentTime : 0
  tailElement.addEventListener('ended', () => finishCrossfade())
  try {
    await tailElement.play()
  } catch (cause) {
    console.warn('无感过渡：旧歌尾巴起播失败，回退为常规切歌', cause)
    cancelCrossfade()
    return
  }
  if (host !== current) {
    cancelCrossfade()
    return
  }

  // 同一帧内把声音从主元素交接到尾巴，不产生重叠也不产生空档。
  tailElement.volume = target
  element.volume = 0

  // 装载期间旧歌由尾巴继续播放，因此这里慢一点也不会断声。
  const nextTrack = pendingNext
  if (!nextTrack) {
    cancelCrossfade()
    return
  }
  const advanced = await current.advanceToNext(nextTrack)
  if (!advanced) {
    console.warn('无感过渡：新歌装载失败，回退为常规切歌')
    cancelCrossfade()
    return
  }

  scheduled = false
  active = true
  starting = false
  handedOver = true
  crossfadeState.scheduled = false
  crossfadeState.active = true
  // 槽位已翻到新歌，进度条标记改按新歌时长重算；开头标出淡入段。
  updateMarkRange()
  markFadeIn(fadeTime)
  startEnvelope(element, tailElement, fadeTime)
}

function startRmsWatch(): void {
  if (rmsTimer !== null) return
  rmsWindow = []
  rmsTimer = setInterval(() => {
    const current = host
    if (!current || active || starting) {
      stopRmsWatch()
      return
    }
    const element = current.getElement()
    const remaining = liveRemainingSec(element)
    if (remaining <= 0) {
      stopRmsWatch()
      return
    }
    const avgRms = pushRmsSample(rmsWindow, current.readAverageRms())
    if (shouldTrigger({ durationSec: element.duration, remainingSec: remaining, avgRms })) {
      stopRmsWatch()
      void beginCrossfade()
    }
  }, RMS_STEP_MS)
}

/**
 * 由 store 的 timeupdate 驱动：维护观察窗口、预载尾巴并启动 RMS 采样。
 * 离开窗口（例如用户向后拖动进度条、关闭开关、列表末尾）会自动取消。
 */
export function notifyCrossfadeTimeUpdate(): void {
  if (!host) return
  // 与桌面版一致：每次 timeupdate 都低成本刷新预告区间（曲目时长可能刚就绪）。
  updateMarkRange()
  if (active || starting) return
  const element = host.getElement()
  const remaining = liveRemainingSec(element)
  const eligible =
    host.isEnabled() &&
    canCrossfade(element.duration) &&
    remaining > 0 &&
    remaining <= OBSERVATION_WINDOW_SEC

  if (!eligible) {
    if (scheduled) cancelCrossfade()
    return
  }
  if (scheduled) return

  // 每一步都可能失败（末尾、单曲循环、拿不到音源），任一失败就整体放弃，
  // 让播放器走原有的常规切歌路径。
  const next = host.peekNext()
  if (!next) return
  if (!armTail()) return
  pendingNext = next
  scheduled = true
  crossfadeState.scheduled = true
  startRmsWatch()
}

/** 由 store 在初始化时注入宿主；重复调用会先清掉上一次的过渡状态。 */
export function initCrossfade(nextHost: CrossfadeHost): void {
  host = nextHost
  cancelCrossfade()
}

export function isCrossfadeBusy(): boolean {
  return active || starting || retained
}
