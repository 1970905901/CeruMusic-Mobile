/**
 * 春节限时主题（对齐桌面版 `store/Settings.ts` 的 `isSpringFestivalWindow` /
 * `shouldUseSpringFestivalTheme` 与 `Play/FullPlay.vue` 的烟花层）。
 *
 * 桌面版的窗口是**硬编码的固定日期段**（2026-02-17 ~ 2026-02-23），不是按农历
 * 算的；移动端保持同一窗口与同一「设置页可关闭」语义，两端的节日体验一致。
 * 烟花引擎从桌面版逐行移植：同一套粒子参数（重力 0.05、阻力 0.985、每炮
 * 40–80 粒、上限 2000、2.2s 重排、14s 后停）。
 */

/** 桌面版同款窗口：返回当前日期是否落在春节主题时段内。 */
export function isSpringFestivalWindow(now: Date = new Date()): boolean {
  const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
  return today >= 20260217 && today <= 20260223
}

export interface FestivalDecisionInput {
  /** 桌面版预留的预览开关（localStorage `ceru_welcome_newyear_preview`）。 */
  preview?: string | null
  /** 用户在设置页关闭了春节主题。 */
  disabled?: boolean
}

export function shouldUseFestivalTheme(
  input: FestivalDecisionInput,
  now: Date = new Date()
): boolean {
  if (input.disabled) return false
  if (input.preview === '1') return true
  return isSpringFestivalWindow(now)
}

const COLORS = ['#ff3b3b', '#ffd65a', '#ff7a00', '#ff2d55', '#ffe08a', '#fa383e', '#ff9f0a']

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  alpha: number
  size: number
}

interface Burst {
  t: number
  x: number
  y: number
}

const rnd = (min: number, max: number) => Math.random() * (max - min) + min
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/**
 * 播放页烟花层：挂在给定容器内的透明 canvas 上，14 秒后自行停止并清理。
 * 返回停止函数；容器被卸载时调用方也应调用它（桌面版 onUnmounted 同款）。
 */
export function startFireworks(host: HTMLElement): () => void {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  host.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  let particles: Particle[] = []
  let bursts: Burst[] = []
  let rafId: number | null = null
  let loopId: number | null = null
  let stopTimer: number | null = null
  let lastTime = performance.now()
  let running = true

  const resize = () => {
    const rect = host.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
  }
  resize()
  window.addEventListener('resize', resize)

  const addBurst = (x: number, y: number) => {
    const color = pick(COLORS)
    const count = Math.floor(rnd(40, 80))
    for (let i = 0; i < count; i++) {
      const angle = rnd(0, Math.PI * 2)
      const speed = rnd(2, 6)
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rnd(60, 120),
        color,
        alpha: 1,
        size: rnd(1, 2.8)
      })
    }
    if (particles.length > 2000) {
      particles.splice(0, particles.length - 2000)
    }
  }

  const scheduleBursts = (w: number, h: number) => {
    bursts.push({ t: 0, x: rnd(w * 0.15, w * 0.85), y: rnd(h * 0.15, h * 0.5) })
    bursts.push({ t: 400, x: rnd(w * 0.1, w * 0.9), y: rnd(h * 0.2, h * 0.6) })
    bursts.push({ t: 800, x: rnd(w * 0.2, w * 0.8), y: rnd(h * 0.15, h * 0.55) })
    bursts.push({ t: 1200, x: rnd(w * 0.25, w * 0.75), y: rnd(h * 0.1, h * 0.5) })
    bursts.push({ t: 1600, x: rnd(w * 0.2, w * 0.8), y: rnd(h * 0.15, h * 0.6) })
  }

  const step = (ts: number) => {
    if (!ctx || !running) return
    const dt = ts - lastTime
    lastTime = ts
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const g = 0.05
    const f = 0.985
    ctx.globalCompositeOperation = 'lighter'
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.vx *= f
      p.vy = p.vy * f + g
      p.x += p.vx
      p.y += p.vy
      p.life -= 1
      p.alpha = Math.max(0, p.life / 120)
      ctx.beginPath()
      ctx.fillStyle = p.color
      ctx.globalAlpha = p.alpha
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      if (p.life <= 0) particles.splice(i, 1)
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.t -= dt
      if (b.t <= 0) {
        addBurst(b.x, b.y)
        bursts.splice(i, 1)
      }
    }
    if (running) rafId = requestAnimationFrame(step)
  }

  scheduleBursts(canvas.width, canvas.height)
  scheduleBursts(canvas.width, canvas.height)
  rafId = requestAnimationFrame(step)
  loopId = window.setInterval(() => {
    if (!running) return
    scheduleBursts(canvas.width, canvas.height)
  }, 2200)
  stopTimer = window.setTimeout(() => stop(), 14000)

  function stop() {
    running = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (loopId) {
      clearInterval(loopId)
      loopId = null
    }
    if (stopTimer) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
    window.removeEventListener('resize', resize)
    particles = []
    bursts = []
    canvas.remove()
  }
  return stop
}
