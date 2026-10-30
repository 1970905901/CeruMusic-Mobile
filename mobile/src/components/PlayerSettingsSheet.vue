<template>
  <ion-modal
    class="player-settings-modal"
    :is-open="open"
    :initial-breakpoint="0.7"
    :breakpoints="[0, 0.7, 0.95]"
    @didDismiss="$emit('close')"
  >
    <div class="sheet-body ceru-pad">
      <div class="grabber" aria-hidden="true" />
      <h2 class="sheet-title">播放页设置</h2>
      <p class="sheet-sub">桌面版播放页画笔面板的等价入口：不离开播放页即可切换样式与常用开关。</p>

      <!-- 播放器样式（桌面版 PlaySettings 的「播放器样式」双卡） -->
      <section class="group">
        <h3>播放器样式</h3>
        <div class="layout-cards">
          <button
            v-for="layout in LAYOUTS"
            :key="layout.value"
            type="button"
            class="layout-card"
            :class="{ active: settings.settings.playerLayout === layout.value }"
            :aria-pressed="settings.settings.playerLayout === layout.value"
            @click="setLayout(layout.value)"
          >
            <span class="layout-preview" :class="`preview-${layout.value}`" aria-hidden="true">
              <span class="disc" />
            </span>
            <span class="layout-name">{{ layout.label }}</span>
          </button>
        </div>
      </section>

      <!-- 背景渲染器（桌面版 renderer radiogroup + 鼓点徽标） -->
      <section class="group">
        <h3>背景渲染器</h3>
        <div role="radiogroup" aria-label="背景渲染器" class="renderer-list">
          <label
            v-for="renderer in backgroundRenderers"
            :key="renderer.value"
            class="renderer-row"
            :class="{ active: settings.settings.playerBackgroundRenderer === renderer.value }"
          >
            <input
              type="radio"
              name="player-background-renderer"
              :value="renderer.value"
              :checked="settings.settings.playerBackgroundRenderer === renderer.value"
              @change="setRenderer(renderer.value)"
            />
            <span class="renderer-copy">
              <span class="renderer-name">
                {{ renderer.label }}
                <em class="beat-badge" :class="{ supported: renderer.supportsBeat }">
                  {{ renderer.supportsBeat ? '支持鼓点' : '不支持鼓点' }}
                </em>
              </span>
              <span class="renderer-desc">{{ renderer.description }}</span>
            </span>
          </label>
        </div>
        <!-- 鼓点开关只在选中支持鼓点的渲染器时出现（与设置页口径一致） -->
        <div v-if="currentRenderer?.supportsBeat" class="toggle-row">
          <div class="toggle-copy">
            <span class="toggle-name">背景随鼓点</span>
            <span class="toggle-desc">低频鼓点驱动背景缩放与明暗</span>
          </div>
          <ion-toggle
            :checked="settings.settings.playerBackgroundBeat"
            aria-label="背景随鼓点"
            @ionChange="settings.settings.playerBackgroundBeat = $event.detail.checked"
          />
        </div>
      </section>

      <!-- 界面与播放开关（桌面版「界面设置」「播放设置」两组） -->
      <section class="group">
        <h3>界面与播放</h3>
        <div
          v-for="item in playerToggles"
          :key="item.key"
          class="toggle-row"
        >
          <div class="toggle-copy">
            <span class="toggle-name">{{ item.label }}</span>
            <span v-if="item.hint" class="toggle-desc">{{ item.hint }}</span>
          </div>
          <ion-toggle
            :checked="item.value"
            :aria-label="item.label"
            @ionChange="item.update($event.detail.checked)"
          />
        </div>
      </section>

      <!-- 歌词开关（桌面版「歌词设置」组） -->
      <section class="group">
        <h3>歌词</h3>
        <div
          v-for="item in lyricToggles"
          :key="item.key"
          class="toggle-row"
        >
          <div class="toggle-copy">
            <span class="toggle-name">{{ item.label }}</span>
            <span v-if="item.hint" class="toggle-desc">{{ item.hint }}</span>
          </div>
          <ion-toggle
            :checked="item.value"
            :aria-label="item.label"
            @ionChange="item.update($event.detail.checked)"
          />
        </div>
      </section>

      <div class="bottom-safe" />
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonModal, IonToggle } from '@ionic/vue'
import { useSettingsStore } from '@/stores/settings'
import {
  backgroundRenderers,
  backgroundSupportsBeat,
  type BackgroundRendererType
} from '@/services/backgroundRenderers'

defineProps<{ open?: boolean }>()
defineEmits<{ close: [] }>()

const settings = useSettingsStore()

const LAYOUTS = [
  { value: 'cd' as const, label: '经典黑胶' },
  { value: 'cover' as const, label: '沉浸封面' }
]

const currentRenderer = computed(() =>
  backgroundRenderers.find(
    (renderer) => renderer.value === settings.settings.playerBackgroundRenderer
  )
)

function setLayout(value: 'cd' | 'cover') {
  settings.settings.playerLayout = value
}

function setRenderer(value: BackgroundRendererType) {
  settings.settings.playerBackgroundRenderer = value
  // 切到不支持鼓点的渲染器时，桌面版同样把鼓点开关语义交给 supportsBeat 判定；
  // 这里顺带关掉保存值，避免回头切回网格渐变时鼓点莫名开启。
  if (!backgroundSupportsBeat(value)) settings.settings.playerBackgroundBeat = false
}

/** 与桌面版 PlaySettings 的「界面设置」+「播放设置」两组对应。 */
const playerToggles = computed<
  Array<{ key: string; label: string; hint?: string; value: boolean; update: (value: boolean) => void }>
>(() => [
  {
    key: 'immersive',
    label: '沉浸色歌词',
    hint: '当前句歌词用封面主色提亮',
    value: settings.settings.lyricImmersiveColor,
    update: (value: boolean) => (settings.settings.lyricImmersiveColor = value)
  },
  {
    key: 'blur',
    label: '歌词模糊效果',
    hint: '距当前句越远越模糊',
    value: settings.settings.lyricBlur,
    update: (value: boolean) => (settings.settings.lyricBlur = value)
  },
  {
    key: 'visualizer',
    label: '音频可视化',
    hint: '播放页对称频谱柱',
    value: settings.settings.audioVisualizer,
    update: (value: boolean) => (settings.settings.audioVisualizer = value)
  },
  {
    key: 'autoHide',
    label: '自动隐藏控制栏',
    hint: '播放中数秒无触控后淡出',
    value: settings.settings.autoHideControls,
    update: (value: boolean) => (settings.settings.autoHideControls = value)
  },
  {
    key: 'pauseTransition',
    label: '暂停播放过渡',
    hint: '播放与暂停时音量渐入渐出；一起听房间内自动关闭',
    value: settings.settings.pauseTransition,
    update: (value: boolean) => (settings.settings.pauseTransition = value)
  },
  {
    key: 'seamless',
    label: '无感过渡（智能交叉淡化）',
    hint: '安静处提前交接到下一首',
    value: settings.settings.seamlessTransition,
    update: (value: boolean) => (settings.settings.seamlessTransition = value)
  },
  {
    key: 'apple',
    label: '使用 Apple 风格歌词',
    hint: '亮暗双色遮罩推进',
    value: settings.settings.lyricAppleStyle,
    update: (value: boolean) => (settings.settings.lyricAppleStyle = value)
  }
])

/** 与桌面版 PlaySettings 的「歌词设置」组对应（「下一首生效」提示保留）。 */
const lyricToggles = computed<
  Array<{ key: string; label: string; hint?: string; value: boolean; update: (value: boolean) => void }>
>(() => [
  {
    key: 'stagger',
    label: '跳转时逐行错开',
    value: settings.settings.lyricSeekStagger,
    update: (value: boolean) => (settings.settings.lyricSeekStagger = value)
  },
  {
    key: 'filterInfo',
    label: '过滤歌词歌曲信息（下一首生效）',
    value: settings.settings.lyricFilterInfo,
    update: (value: boolean) => (settings.settings.lyricFilterInfo = value)
  },
  {
    key: 'strict',
    label: '严格过滤模式（可能误伤）',
    value: settings.settings.lyricStrictFilter,
    update: (value: boolean) => (settings.settings.lyricStrictFilter = value)
  }
])
</script>

<style scoped>
.sheet-body {
  height: 100%;
  overflow-y: auto;
}
.grabber {
  width: 38px;
  height: 5px;
  margin: 0 auto 12px;
  border-radius: 999px;
  background: var(--ceru-border);
}
.sheet-title {
  margin: 0;
  font-size: 18px;
  color: var(--ceru-text);
}
.sheet-sub {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ceru-text-secondary);
}
.group {
  margin-top: 18px;
}
.group h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ceru-text-secondary);
}
/* 播放器样式双卡 */
.layout-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.layout-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-bg-soft);
  color: var(--ceru-text);
}
.layout-card.active {
  border-color: var(--ceru-brand);
  box-shadow: 0 0 0 1px var(--ceru-brand) inset;
}
.layout-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.preview-cd .disc {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--ceru-brand) 0 18%, #222 19% 100%);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.preview-cover .disc {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--ceru-brand), #556);
}
.layout-name {
  font-size: 12px;
}
/* 背景渲染器 */
.renderer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.renderer-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  background: var(--ceru-bg-soft);
}
.renderer-row.active {
  border-color: var(--ceru-brand);
}
.renderer-row input {
  margin-top: 3px;
  accent-color: var(--ceru-brand);
}
.renderer-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
}
.renderer-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ceru-text);
}
.beat-badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-style: normal;
  color: var(--ceru-text-secondary);
  background: var(--ceru-border);
}
.beat-badge.supported {
  color: var(--ceru-brand);
  background: color-mix(in srgb, var(--ceru-brand) 14%, transparent);
}
.renderer-desc {
  font-size: 11px;
  line-height: 1.5;
  color: var(--ceru-text-secondary);
}
/* 开关行 */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  background: var(--ceru-bg-soft);
}
.toggle-row + .toggle-row {
  margin-top: 8px;
}
.toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.toggle-name {
  font-size: 13px;
  color: var(--ceru-text);
}
.toggle-desc {
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.bottom-safe {
  height: calc(30px + env(safe-area-inset-bottom));
}
@media (min-width: 700px) {
  .player-settings-modal {
    --width: min(560px, 92vw);
    --height: 80vh;
    --border-radius: 24px;
    margin: auto;
  }
}
</style>
