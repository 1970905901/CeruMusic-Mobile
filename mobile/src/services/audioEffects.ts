export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_GAIN_MIN = -12
export const EQ_GAIN_MAX = 12

export type SurroundMode = 'off' | 'small' | 'medium' | 'large'
export type LoudnessTarget = 'gentle' | 'standard' | 'strong'

export interface EqualizerPreset {
  name: string
  gains: number[]
  originalGains?: number[]
}

export interface AudioEffectsState {
  equalizerEnabled: boolean
  equalizerPreset: string
  equalizerGains: number[]
  bassBoost: { enabled: boolean; gain: number }
  surround: { enabled: boolean; mode: SurroundMode }
  balance: { enabled: boolean; value: number }
  loudness: { enabled: boolean; target: LoudnessTarget }
}

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { name: 'Flat(原声)', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Pop(流行)', gains: [4, 3, 2, 0, -2, -2, 0, 2, 3, 4] },
  { name: 'Rock(摇滚)', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
  { name: 'Jazz(爵士)', gains: [3, 2, 1, 2, -2, -2, 0, 2, 3, 4] },
  { name: 'Classical(古典)', gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { name: 'Bass Boost(低音增强)', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Vocal Boost(人声增强)', gains: [-2, -2, -1, 1, 4, 4, 2, 1, 0, -1] },
  { name: 'Treble Boost(高音增强)', gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] }
]

export const DEFAULT_AUDIO_EFFECTS_STATE: AudioEffectsState = {
  equalizerEnabled: false,
  equalizerPreset: 'Flat(原声)',
  equalizerGains: [...EQUALIZER_PRESETS[0].gains],
  bassBoost: { enabled: false, gain: 0 },
  surround: { enabled: false, mode: 'off' },
  balance: { enabled: true, value: 0 },
  loudness: { enabled: false, target: 'standard' }
}

export interface LoudnessPreset {
  threshold: number
  ratio: number
  knee: number
  makeup: number
}

export const LOUDNESS_PRESETS: Record<LoudnessTarget, LoudnessPreset> = {
  gentle: { threshold: -18, ratio: 2, knee: 24, makeup: 1.15 },
  standard: { threshold: -22, ratio: 3, knee: 20, makeup: 1.35 },
  strong: { threshold: -26, ratio: 4, knee: 16, makeup: 1.55 }
}

export interface SurroundPreset {
  duration: number
  decay: number
  wet: number
}

export const SURROUND_PRESETS: Record<Exclude<SurroundMode, 'off'>, SurroundPreset> = {
  small: { duration: 0.5, decay: 3.0, wet: 0.3 },
  medium: { duration: 1.5, decay: 2.0, wet: 0.5 },
  large: { duration: 3.0, decay: 1.5, wet: 0.8 }
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Math.min(max, Math.max(min, 0))
  return Math.min(max, Math.max(min, value))
}

export function clampEqualizerGains(gains: readonly number[]): number[] {
  return EQ_FREQUENCIES.map((_, index) => clampNumber(Number(gains[index] ?? 0), EQ_GAIN_MIN, EQ_GAIN_MAX))
}

export function effectiveEqualizerGains(state: AudioEffectsState): number[] {
  if (!state.equalizerEnabled) return EQ_FREQUENCIES.map(() => 0)
  return clampEqualizerGains(state.equalizerGains)
}

export function effectiveBassGain(state: AudioEffectsState): number {
  return state.bassBoost.enabled ? clampNumber(state.bassBoost.gain, EQ_GAIN_MIN, EQ_GAIN_MAX) : 0
}

export function effectiveBalance(state: AudioEffectsState): number {
  return state.balance.enabled ? clampNumber(state.balance.value, -1, 1) : 0
}

export function effectiveSurroundMode(state: AudioEffectsState): SurroundMode {
  return state.surround.enabled ? state.surround.mode : 'off'
}

export function effectiveLoudness(state: AudioEffectsState): {
  enabled: boolean
  target: LoudnessTarget
} {
  return { enabled: state.loudness.enabled, target: state.loudness.target }
}

export function hasActiveEffects(state: AudioEffectsState): boolean {
  return (
    state.equalizerEnabled ||
    state.bassBoost.enabled ||
    state.surround.enabled ||
    (state.balance.enabled && Math.abs(state.balance.value) > 0.001) ||
    state.loudness.enabled
  )
}

function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return window.AudioContext || (window as any).webkitAudioContext || null
}

function isCrossOriginSource(src: string): boolean {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return false
  try {
    return new URL(src, window.location.href).origin !== window.location.origin
  } catch {
    return false
  }
}

/**
 * Single Web Audio chain bound to the shared <audio> element.
 * The chain is created lazily on first use so playback keeps its native path by default.
 */
class AudioEffectChain {
  private element: HTMLAudioElement | null = null
  private context: AudioContext | null = null
  private filters: BiquadFilterNode[] = []
  private bassBoost: BiquadFilterNode | null = null
  private convolver: ConvolverNode | null = null
  private surroundGain: GainNode | null = null
  private balanceNode: StereoPannerNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private makeup: GainNode | null = null
  private surroundMode: SurroundMode = 'off'
  private analyser: AnalyserNode | null = null
  private beatAnalyser: AnalyserNode | null = null
  private listenersBound = false
  /** 尾巴链共用的上下文（跨实例注入），保证两条链在同一时钟下跑。 */
  private sharedContext: AudioContext | null = null
  /** 尾巴链的输出增益：用于淡出，避免与主链包络叠加后过响。 */
  private outputGain: GainNode | null = null
  private readonly resumeHandler = () => this.resumeContext()

  get active(): boolean {
    return !!this.context && this.context.state !== 'closed'
  }

  /**
   * 建立以该元素为源的完整效果链。
   * 传入 `shared` 时复用其 AudioContext（尾巴链必须与主链同钟），
   * 传入 `output` 时把最终信号接到该节点而不是扬声器。
   */
  ensure(
    element: HTMLAudioElement,
    options: { shared?: AudioContext | null; output?: AudioNode | null } = {}
  ): boolean {
    if (this.element === element && this.active) return true
    if (this.element && this.element !== element) return false

    const shared = options.shared ?? this.sharedContext
    const ContextClass = audioContextConstructor()
    if (!shared && !ContextClass) return false

    try {
      const context = shared ?? new ContextClass!({ latencyHint: 'playback' })
      if (isCrossOriginSource(element.src)) {
        console.warn('音频效果：当前音源为跨域直链，可能无法通过 Web Audio 输出声音')
      }

      const source = context.createMediaElementSource(element)
      const filters = EQ_FREQUENCIES.map((frequency) => {
        const filter = context.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = frequency
        filter.Q.value = 1.0
        filter.gain.value = 0
        return filter
      })

      let lastNode: AudioNode = source
      filters.forEach((filter) => {
        lastNode.connect(filter)
        lastNode = filter
      })

      const bassBoost = context.createBiquadFilter()
      bassBoost.type = 'lowshelf'
      bassBoost.frequency.value = 200
      bassBoost.gain.value = 0
      lastNode.connect(bassBoost)
      lastNode = bassBoost

      const balanceNode = context.createStereoPanner()
      lastNode.connect(balanceNode)

      const convolver = context.createConvolver()
      const surroundGain = context.createGain()
      surroundGain.gain.value = 0
      lastNode.connect(convolver)
      convolver.connect(surroundGain)
      surroundGain.connect(balanceNode)

      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = 0
      compressor.knee.value = 30
      compressor.ratio.value = 1
      compressor.attack.value = 0.003
      compressor.release.value = 0.25

      const makeup = context.createGain()
      makeup.gain.value = 1.0

      balanceNode.connect(compressor)
      compressor.connect(makeup)

      // 尾巴链多一级输出增益，包络淡出时由调用方直接压它。
      const outputGain = options.output ? context.createGain() : null
      if (outputGain) {
        makeup.connect(outputGain)
        outputGain.connect(options.output!)
      } else {
        makeup.connect(context.destination)
      }

      this.element = element
      this.context = context
      this.sharedContext = shared ?? null
      this.filters = filters
      this.bassBoost = bassBoost
      this.convolver = convolver
      this.surroundGain = surroundGain
      this.balanceNode = balanceNode
      this.compressor = compressor
      this.makeup = makeup
      this.outputGain = outputGain
      this.surroundMode = 'off'

      if (!this.listenersBound) {
        element.addEventListener('play', this.resumeHandler)
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', this.resumeHandler)
        }
        this.listenersBound = true
      }
      this.resumeContext()
      return true
    } catch (error) {
      console.warn('初始化音频效果链路失败', error)
      this.context = null
      return false
    }
  }

  apply(state: AudioEffectsState): void {
    const context = this.context
    if (!context || !this.filters.length) return
    this.resumeContext()

    effectiveEqualizerGains(state).forEach((gain, index) => {
      const filter = this.filters[index]
      if (filter) filter.gain.value = gain
    })
    if (this.bassBoost) this.bassBoost.gain.value = effectiveBassGain(state)
    if (this.balanceNode) this.balanceNode.pan.value = effectiveBalance(state)
    this.applySurround(effectiveSurroundMode(state))
    this.applyLoudness(effectiveLoudness(state))
  }

  /** Taps the post-processing node so the visualizer sees the audible signal. */
  attachAnalyser(fftSize: number): AnalyserNode | null {
    const context = this.context
    const tap = this.balanceNode
    if (!context || !tap || context.state === 'closed') return null
    this.resumeContext()
    if (!this.analyser) {
      this.analyser = context.createAnalyser()
      this.analyser.smoothingTimeConstant = 0.6
      tap.connect(this.analyser)
    }
    this.analyser.fftSize = fftSize
    return this.analyser
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser && this.context && this.context.state !== 'closed' ? this.analyser : null
  }

  /**
   * 交叉淡化的 RMS 观察只做“只读借用”：优先用可视化分析节点，其次用鼓点节点。
   * 不新建节点，因此开启无感过渡不会额外把音频推上同源代理路径。
   */
  getEnvelopeAnalyser(): AnalyserNode | null {
    const node = this.analyser ?? this.beatAnalyser
    return node && this.context && this.context.state !== 'closed' ? node : null
  }

  detachAnalyser(): void {
    if (!this.analyser) return
    try {
      this.analyser.disconnect()
    } catch {
      // The node may already be detached by a closed context.
    }
    this.analyser = null
  }

  /**
   * Desktop parity: the background beat uses its own 4096-point analyser with a
   * faster smoothing constant, because a small FFT cannot resolve 80–120 Hz.
   */
  attachBeatAnalyser(): AnalyserNode | null {
    const context = this.context
    const tap = this.balanceNode
    if (!context || !tap || context.state === 'closed') return null
    this.resumeContext()
    if (!this.beatAnalyser) {
      this.beatAnalyser = context.createAnalyser()
      this.beatAnalyser.smoothingTimeConstant = 0.2
      this.beatAnalyser.fftSize = 4096
      tap.connect(this.beatAnalyser)
    }
    return this.beatAnalyser
  }

  detachBeatAnalyser(): void {
    if (!this.beatAnalyser) return
    try {
      this.beatAnalyser.disconnect()
    } catch {
      // The node may already be detached by a closed context.
    }
    this.beatAnalyser = null
  }

  /** 尾巴链复用主链的 AudioContext，保证两条链同钟。 */
  getContext(): AudioContext | null {
    return this.context && this.context.state !== 'closed' ? this.context : null
  }

  /** 断开尾巴链的引用，允许元素被回收。 */
  detach(): void {
    this.element = null
    this.filters = []
    this.bassBoost = null
    this.convolver = null
    this.surroundGain = null
    this.balanceNode = null
    this.compressor = null
    this.makeup = null
    this.outputGain = null
    this.analyser = null
    this.beatAnalyser = null
    this.surroundMode = 'off'
  }

  private resumeContext(): void {
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined)
    }
  }

  private applySurround(mode: SurroundMode): void {
    const context = this.context
    const convolver = this.convolver
    const gainNode = this.surroundGain
    if (!context || !convolver || !gainNode) return

    if (mode === 'off') {
      gainNode.gain.setTargetAtTime(0, context.currentTime, 0.1)
      this.surroundMode = 'off'
      return
    }

    if (mode !== this.surroundMode) {
      const preset = SURROUND_PRESETS[mode]
      const rate = context.sampleRate
      const length = Math.max(1, Math.floor(rate * preset.duration))
      const impulse = context.createBuffer(2, length, rate)
      const left = impulse.getChannelData(0)
      const right = impulse.getChannelData(1)
      for (let i = 0; i < length; i += 1) {
        const progress = i / length
        const volume = Math.pow(1 - progress, preset.decay)
        left[i] = (Math.random() * 2 - 1) * volume
        right[i] = (Math.random() * 2 - 1) * volume
      }
      convolver.buffer = impulse
      this.surroundMode = mode
    }

    gainNode.gain.setTargetAtTime(SURROUND_PRESETS[mode].wet, context.currentTime, 0.2)
  }

  private applyLoudness(options: { enabled: boolean; target: LoudnessTarget }): void {
    const compressor = this.compressor
    const makeup = this.makeup
    const context = this.context
    if (!compressor || !makeup || !context) return

    const now = context.currentTime
    if (!options.enabled) {
      compressor.threshold.setTargetAtTime(0, now, 0.05)
      compressor.ratio.setTargetAtTime(1, now, 0.05)
      compressor.knee.setTargetAtTime(30, now, 0.05)
      makeup.gain.setTargetAtTime(1.0, now, 0.05)
      return
    }

    const preset = LOUDNESS_PRESETS[options.target]
    compressor.threshold.setTargetAtTime(preset.threshold, now, 0.05)
    compressor.ratio.setTargetAtTime(preset.ratio, now, 0.05)
    compressor.knee.setTargetAtTime(preset.knee, now, 0.05)
    compressor.attack.setTargetAtTime(0.003, now, 0.05)
    compressor.release.setTargetAtTime(0.25, now, 0.05)
    makeup.gain.setTargetAtTime(preset.makeup, now, 0.05)
  }
}

export const audioEffectChain = new AudioEffectChain()

export function isAudioEffectsActive(): boolean {
  return audioEffectChain.active
}

let visualizerElement: HTMLAudioElement | null = null
let visualizerEnabled = false

export function supportsWebAudio(): boolean {
  return !!audioContextConstructor()
}

/** The player owns the single <audio> element; the visualizer taps that pipeline. */
export function bindAudioPipelineElement(element: HTMLAudioElement): void {
  visualizerElement = element
}

export function setAudioVisualizerEnabled(enabled: boolean): void {
  visualizerEnabled = enabled && supportsWebAudio()
  if (!visualizerEnabled) {
    audioEffectChain.detachAnalyser()
    audioEffectChain.detachBeatAnalyser()
  }
}

export function isAudioVisualizerEnabled(): boolean {
  return visualizerEnabled
}

export function ensureVisualizerAnalyser(fftSize: number): AnalyserNode | null {
  if (!visualizerEnabled || !visualizerElement) return null
  // Tapping a cross-origin element would silence playback, so wait for the blob proxy.
  const source = visualizerElement.currentSrc || visualizerElement.src
  if (!source.startsWith('blob:') && !source.startsWith('data:')) return null
  if (!audioEffectChain.ensure(visualizerElement)) return null
  return audioEffectChain.attachAnalyser(fftSize)
}

/**
 * 交叉淡化的 RMS 观察接口：只借用可视化/鼓点已有的分析节点，拿不到就返回 null。
 * 这样开启无感过渡不会为音频额外建立效果链。
 */
export function peekEnvelopeAnalyser(): AnalyserNode | null {
  if (!audioEffectChain.active) return null
  return audioEffectChain.getEnvelopeAnalyser()
}

/**
 * Desktop parity for the background beat: its own analyser so the effect works
 * even when the bar visualizer is off and keeps a 4096-point FFT.
 */
/**
 * 无感过渡的尾巴链：让旧歌尾段也经过同一条 EQ / 低音 / 环绕 / 响度处理。
 *
 * 只有主链已经建立（说明音源可被 Web Audio 接管）时才接尾巴链，
 * 且复用主链的 AudioContext，避免两条链各跑一个时钟导致对不齐。
 * 尾巴元素本身仍在主链舞台上淡出，这里只负责让它的音色与主链一致。
 */
const tailChain = new AudioEffectChain()

export function ensureTailEffectChain(tail: HTMLAudioElement): boolean {
  if (!audioEffectChain.active) return false
  const source = tail.currentSrc || tail.src
  if (!source.startsWith('blob:') && !source.startsWith('data:')) return false
  const context = audioEffectChain.getContext()
  if (!context) return false
  return tailChain.ensure(tail, { shared: context })
}

/** 把当前效果设置同步到尾巴链；主链每次 apply 后调用。 */
export function applyTailEffects(state: AudioEffectsState): void {
  if (tailChain.active) tailChain.apply(state)
}

export function releaseTailEffectChain(): void {
  if (!tailChain.active) return
  tailChain.detach()
}

export function ensureBeatAnalyser(): AnalyserNode | null {
  if (!visualizerEnabled || !visualizerElement) return null
  const source = visualizerElement.currentSrc || visualizerElement.src
  if (!source.startsWith('blob:') && !source.startsWith('data:')) return null
  if (!audioEffectChain.ensure(visualizerElement)) return null
  return audioEffectChain.attachBeatAnalyser()
}
