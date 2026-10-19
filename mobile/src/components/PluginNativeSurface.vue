<template>
  <div class="native-surface" :class="{ embedded }">
    <div v-if="view" class="native-heading">
      <h2 v-if="view.title">{{ view.title }}</h2>
      <p v-if="view.description">{{ view.description }}</p>
      <div v-if="view.actions?.length" class="native-actions">
        <ion-button
          v-for="action in view.actions"
          :key="action.action + action.label"
          size="small"
          :fill="action.primary ? 'solid' : 'outline'"
          :disabled="busy.has(action.action)"
          @click="run(action.action, action.input)"
        >
          {{ action.label }}
        </ion-button>
      </div>
    </div>

    <div v-if="error" class="native-error">
      <span>{{ error }}</span>
      <button type="button" @click="render">重试</button>
    </div>

    <div v-if="loading && !view" class="native-loading">
      <ion-spinner name="crescent" /> 正在加载插件页面…
    </div>

    <section v-for="section in view?.sections || []" :key="section.id" class="native-section">
      <h3 v-if="section.title">{{ section.title }}</h3>

      <div v-if="section.layout === 'grid'" class="native-grid">
        <div
          v-for="(item, index) in section.items"
          :key="itemKey(item, index)"
          class="grid-card"
          role="button"
          tabindex="0"
          @click="openItem(section, item, index)"
          @keyup.enter="openItem(section, item, index)"
        >
          <CoverImage :src="item.metadata?.artworkUrl || ''" :size="150" :radius="15" :alt="item.title || ''" />
          <div class="card-title ceru-truncate">{{ item.title || '未命名' }}</div>
          <div class="card-sub ceru-truncate">{{ item.subtitle || item.playlist?.description || '' }}</div>
          <button
            v-if="section.itemActions?.length"
            type="button"
            class="card-more"
            aria-label="更多操作"
            @click.stop="openItemActions(section, item, index)"
          >
            <ion-icon :icon="ellipsisHorizontal" />
          </button>
        </div>
      </div>

      <div v-else class="native-list">
        <button
          v-for="(item, index) in section.items"
          :key="itemKey(item, index)"
          type="button"
          class="native-row"
          @click="openItem(section, item, index)"
        >
          <span class="row-index">{{ index + 1 }}</span>
          <CoverImage :src="item.metadata?.artworkUrl || ''" :size="46" :radius="10" :alt="item.title || ''" />
          <span class="row-copy">
            <span class="row-title ceru-truncate">{{ item.title || '未命名' }}</span>
            <span class="row-sub ceru-truncate">{{ item.subtitle || item.metadata?.album?.title || '' }}</span>
          </span>
          <ion-icon :icon="chevronForwardOutline" class="row-arrow" />
        </button>
      </div>

      <div v-if="!section.items?.length" class="native-empty">暂无内容</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  IonButton,
  IonIcon,
  IonSpinner,
  actionSheetController,
  toastController
} from '@ionic/vue'
import { chevronForwardOutline, ellipsisHorizontal } from 'ionicons/icons'
import type { NativeView, NativeViewSection } from '@shiqianjiang/ceru-plugin-sdk'
import type { PluginRecord } from '@/types/plugin'
import type { SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginSurfaceMount } from '@/services/pluginSurfaceMount'
import CoverImage from '@/components/CoverImage.vue'
import { pluginRuntimeManager } from '@/services/plugin/runtime'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  record: PluginRecord
  surface: SurfaceDeclaration
  embedded?: boolean
  mount?: PluginSurfaceMount
}>()

const pluginStore = usePluginStore()
const view = shallowRef<NativeView>()
const loading = ref(false)
const error = ref('')
const busy = ref(new Set<string>())
let disposed = false
let generation = 0
let opened = false
let closed = false
let unsubscribe: (() => void) | undefined

function itemKey(item: any, index: number): string {
  try {
    return JSON.stringify(item.ref) + index
  } catch {
    return String(index)
  }
}

async function render() {
  if (disposed) return
  const token = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await pluginStore.invokeAction(props.record.key, props.surface.entry, props.mount?.context ?? {})
    if (!result || typeof result !== 'object' || !Array.isArray(result.sections)) {
      throw new Error('插件返回了无效的原生页面')
    }
    if (!disposed && token === generation) view.value = result as NativeView
  } catch (cause) {
    if (!disposed && token === generation) {
      error.value = cause instanceof Error ? cause.message : '插件页面加载失败'
    }
  } finally {
    if (token === generation) loading.value = false
  }
}

async function run(action: string | undefined, input?: any) {
  if (!action || disposed || busy.value.has(action)) return
  const next = new Set(busy.value)
  next.add(action)
  busy.value = next
  try {
    await pluginStore.invokeAction(props.record.key, action, input ?? {})
    await render()
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '操作失败', 'danger')
  } finally {
    const after = new Set(busy.value)
    after.delete(action)
    busy.value = after
  }
}

function openItem(section: NativeViewSection, item: any, index: number) {
  if (section.onPlay) {
    void run(section.onPlay, {
      ref: item.ref,
      refs: section.items.slice(index).map((entry) => entry.ref)
    })
    return
  }
  if (section.onOpen) {
    void run(section.onOpen, { ref: item.ref })
  }
}

async function openItemActions(section: NativeViewSection, item: any, _index: number) {
  if (!section.itemActions?.length) return
  const sheet = await actionSheetController.create({
    header: item.title || '操作',
    buttons: [
      ...section.itemActions.map((action) => ({
        text: action.label,
        handler: () => {
          void run(action.action, {
            ...(action.input && typeof action.input === 'object' && !Array.isArray(action.input)
              ? action.input
              : {}),
            ref: item.ref
          })
        }
      })),
      { text: '取消', role: 'cancel' as const }
    ]
  })
  await sheet.present()
}

async function closeLifecycle() {
  if (closed || !props.surface.lifecycle?.closeAction) return
  closed = true
  try {
    await pluginStore.invokeAction(props.record.key, props.surface.lifecycle.closeAction, props.mount?.context ?? {})
  } catch {
    // Navigation must not be blocked by plugin cleanup.
  }
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

onMounted(async () => {
  unsubscribe = pluginRuntimeManager.onSurfaceState((event) => {
    if (event.pluginKey === props.record.key && event.surfaceId === props.surface.id) void render()
  })
  try {
    if (!opened && props.surface.lifecycle?.openAction) {
      opened = true
      await pluginStore.invokeAction(props.record.key, props.surface.lifecycle.openAction, props.mount?.context ?? {})
    }
    await render()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '插件页面加载失败'
  }
})

onBeforeUnmount(() => {
  disposed = true
  generation++
  unsubscribe?.()
  void closeLifecycle()
})
</script>

<style scoped>
.native-surface {
  padding: 16px max(16px, env(safe-area-inset-left)) 120px max(16px, env(safe-area-inset-right));
}
.native-surface.embedded {
  padding: 0;
}
.native-surface.embedded .native-heading h2 {
  font-size: 20px;
}
.native-surface.embedded .native-section {
  margin-top: 18px;
}
.native-heading h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.native-heading p {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.native-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.native-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding: 11px 12px;
  border-radius: 10px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 12px;
}
.native-error button {
  border: 0;
  background: transparent;
  color: var(--ceru-danger);
  font-size: 12px;
}
.native-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 80px 20px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.native-section {
  margin-top: 24px;
}
.native-section h3 {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 750;
}
.native-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 14px;
}
.grid-card {
  position: relative;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  text-align: left;
  padding: 0;
}
.grid-card :deep(.cover) {
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 1;
}
.card-title {
  margin-top: 7px;
  font-size: 13px;
  font-weight: 650;
}
.card-sub {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.card-more {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 0;
}
.native-list {
  border-top: 1px solid var(--ceru-border);
}
.native-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid var(--ceru-border);
  background: transparent;
  color: var(--ceru-text);
  text-align: left;
}
.row-index {
  width: 22px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
  text-align: center;
  flex: 0 0 auto;
}
.row-copy {
  flex: 1;
  min-width: 0;
}
.row-title,
.row-sub {
  display: block;
}
.row-title {
  font-size: 14px;
  font-weight: 650;
}
.row-sub {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.row-arrow {
  color: var(--ceru-text-secondary);
}
.native-empty {
  padding: 30px 10px;
  text-align: center;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
</style>
