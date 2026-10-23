<template>
  <div class="eq-spectrum">
    <canvas ref="canvasRef" />
    <span v-if="!analyserReady" class="spectrum-hint">{{ hint }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 均衡器页的实时频谱，对齐桌面版 `Settings/EqualizerSettings.vue` 顶部的 canvas。
 *
 * 桌面版直接画 `getByteFrequencyData` 的原始频段；这里同样从左到右画，
 * 但把柱子对齐到 10 段均衡器的中心频率附近，让「拖哪一段、哪根柱子动」
 * 有可读的对应关系。拿不到分析节点（跨域直链、尚未起播）时画一条静止的
 * 基线并给出说明，不伪造跳动的数据——桌面版此时是一片空白，容易误以为坏了。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ensureVisualizerAnalyser } from '@/services/audioEffects'
import { barBinRange, peakInRange } from '@/services/eqSpectrum'

const props = withDefaults(defineProps<{ bars?: number; height?: number }>(), {
  bars: 32,
  height: 120
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const analyserReady = ref(false)
const hint = '播放音乐后显示实时频谱'

const FRAME_MS = 1000 / 30
const RETRY_MS = 2000

let analyser: AnalyserNode | null = null
let buffer = new Uint8Array(new ArrayBuffer(0))
let frameId: number | null = null
let lastFrame = 0
let lastAttempt = 0
let stopped = false

function resize(): void {
  const canvas = canvasRef.value
  const container = canvas?.parentElement
  if (!canvas || !container) return
  const width = container.getBoundingClientRect().width
  if (!width) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(props.height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${props.height}px`
  const context = canvas.getContext('2d')
  if (context) {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.scale(dpr, dpr)
  }
}

/**
 * 页面是否仍然可见。
 *
 * Ionic 把离开的页面留在 DOM 里（`.ion-page-hidden` 只设 `visibility: hidden`），
 * 组件不会卸载，`requestAnimationFrame` 照样每帧回调。设置页压在栈里时
 * 频谱仍在 30fps 地读频域数据、重绘 canvas，纯属白烧电。
 */
function pageVisible(canvas: HTMLCanvasElement): boolean {
  if (typeof document !== 'undefined' && document.hidden) return false
  const check = (canvas as HTMLCanvasElement & { checkVisibility?: () => boolean }).checkVisibility
  if (typeof check === 'function') return check.call(canvas)
  return canvas.offsetParent !== null
}

function draw(timestamp?: number): void {
  if (stopped) return
  const canvas = canvasRef.value
  if (!canvas || !pageVisible(canvas)) {
    // 不可见时不做任何采样或绘制，但仍保留循环：回到页面后立即恢复。
    frameId = requestAnimationFrame(draw)
    return
  }
  const context = canvas.getContext('2d')
  if (!context) return
  const now = timestamp ?? performance.now()
  if (now - lastFrame < FRAME_MS) {
    frameId = requestAnimationFrame(draw)
    return
  }
  lastFrame = now

  if (!analyser && now - lastAttempt > RETRY_MS) {
    lastAttempt = now
    // 与播放页共用同一条链路；拿不到（跨域直链、未起播）就保持静止。
    analyser = ensureVisualizerAnalyser(1024)
    analyserReady.value = Boolean(analyser)
  }

  const width = canvas.clientWidth || canvas.width
  const height = props.height
  context.clearRect(0, 0, width, height)

  // 基线：即使没有音频也让面板看起来是「一个频谱」，而不是一块黑。
  context.fillStyle = 'rgba(0, 217, 192, 0.18)'
  context.fillRect(0, height - 1, width, 1)

  if (analyser) {
    if (buffer.length !== analyser.frequencyBinCount) {
      buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    }
    analyser.getByteFrequencyData(buffer)
    const bars = props.bars
    const gap = 2
    const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars)
    const gradient = context.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, 'rgba(0, 217, 192, 0.95)')
    gradient.addColorStop(1, 'rgba(0, 242, 96, 0.35)')
    context.fillStyle = gradient
    for (let index = 0; index < bars; index++) {
      const { from, to } = barBinRange(
        index,
        bars,
        buffer.length,
        analyser.context.sampleRate,
        analyser.fftSize
      )
      // 0.6 gamma：安静的频段也看得见，与播放页频谱同一口径。
      const peak = peakInRange(buffer, { from, to })
      const ratio = Math.pow(Math.min(1, peak / 255), 0.6)
      const barHeight = ratio * (height - 6)
      context.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight)
    }
  }

  frameId = requestAnimationFrame(draw)
}

onMounted(() => {
  resize()
  frameId = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  stopped = true
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
  analyser = null
})
</script>

<style scoped>
.eq-spectrum {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.28);
  margin-bottom: 12px;
}
canvas {
  display: block;
  width: 100%;
}
.spectrum-hint {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
</style>
