<template>
  <div class="visualizer" :style="{ height: `${height}px` }">
    <canvas ref="canvasRef" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ensureVisualizerAnalyser } from '@/services/audioEffects'
import {
  barGradientEnd,
  mirroredBarHeights,
  readVisualizerFrame,
  simulatedFrame,
  visualizerFftSize
} from '@/services/audioVisualizer'

const props = withDefaults(
  defineProps<{
    show?: boolean
    height?: number
    barCount?: number
    color?: string
  }>(),
  {
    show: true,
    height: 54,
    barCount: 48,
    color: 'rgba(245, 248, 251, 0.8)'
  }
)

const emit = defineEmits<{ lowFreqUpdate: [value: number] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const FRAME_MS = 33
let analyser: AnalyserNode | null = null
let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0))
let frameId: number | null = null
let lastFrame = 0
let lastAnalyserAttempt = 0
let resizeObserver: ResizeObserver | null = null

function stop(): void {
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
}

function resizeCanvas(): void {
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

function draw(timestamp?: number): void {
  const canvas = canvasRef.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  const now = timestamp ?? performance.now()
  if (now - lastFrame < FRAME_MS) {
    frameId = requestAnimationFrame(draw)
    return
  }
  lastFrame = now

  // A cross-origin source cannot be tapped; retry on track changes so the
  // synthetic fallback gives way to a real analysis once audio is proxied.
  if (!analyser && now - lastAnalyserAttempt > 2000) {
    lastAnalyserAttempt = now
    analyser = ensureVisualizerAnalyser(visualizerFftSize(props.barCount))
  }

  const binCount = Math.max(32, visualizerFftSize(props.barCount) / 2)
  let values: ArrayLike<number>
  let lowFreq: number
  if (analyser) {
    if (buffer.length !== analyser.frequencyBinCount) {
      buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    }
    const frame = readVisualizerFrame(analyser, buffer)
    values = frame.values
    lowFreq = frame.lowFreq
  } else {
    const frame = simulatedFrame(now / 1000, binCount, buffer.length === binCount ? buffer : undefined)
    buffer = frame.values
    values = frame.values
    lowFreq = frame.lowFreq
  }
  emit('lowFreqUpdate', lowFreq)

  const width = canvas.clientWidth || canvas.width
  const height = props.height
  context.clearRect(0, 0, width, height)

  const bars = mirroredBarHeights(values, props.barCount)
  const barWidth = width / 2 / bars.length
  const maxHeight = height * 0.9
  const centerX = width / 2

  const gradient = context.createLinearGradient(0, height, 0, 0)
  gradient.addColorStop(0, props.color)
  gradient.addColorStop(1, barGradientEnd(props.color))
  context.fillStyle = gradient

  bars.forEach((ratio, index) => {
    const barHeight = ratio * maxHeight
    const y = height - barHeight
    context.fillRect(centerX - (index + 1) * barWidth, y, barWidth * 0.82, barHeight)
    context.fillRect(centerX + index * barWidth, y, barWidth * 0.82, barHeight)
  })

  frameId = requestAnimationFrame(draw)
}

function start(): void {
  if (!props.show) return
  stop()
  analyser = ensureVisualizerAnalyser(visualizerFftSize(props.barCount))
  lastAnalyserAttempt = performance.now()
  resizeCanvas()
  lastFrame = 0
  frameId = requestAnimationFrame(draw)
}

watch(
  () => props.show,
  (visible) => {
    if (visible) start()
    else stop()
  }
)

onMounted(() => {
  start()
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  if (canvasRef.value?.parentElement) resizeObserver.observe(canvasRef.value.parentElement)
})

onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  resizeObserver = null
  analyser = null
})
</script>

<style scoped>
.visualizer {
  width: 100%;
  display: flex;
  align-items: flex-end;
  pointer-events: none;
  opacity: 0.9;
  transition: opacity 0.5s ease;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
