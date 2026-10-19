<template>
  <div class="plugin-web-surface">
    <iframe
      v-if="document"
      ref="frame"
      :name="'ceru-plugin-surface-' + sessionId"
      :srcdoc="document.html"
      sandbox="allow-scripts"
      :title="document.title"
      @load="send('init', document.init)"
    />
    <div v-else-if="error" class="surface-state error">{{ error }}</div>
    <div v-else class="surface-state"><ion-spinner name="crescent" /> 正在加载插件页面…</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { IonSpinner, toastController } from '@ionic/vue'
import type { PluginRecord } from '@/types/plugin'
import type { SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import { createPluginWebSurface } from '@/services/pluginSurface'
import { pluginRuntimeManager } from '@/services/plugin/runtime'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  record: PluginRecord
  surface: SurfaceDeclaration
}>()
const emit = defineEmits<{ close: []; error: [message: string] }>()

const pluginStore = usePluginStore()
const frame = ref<HTMLIFrameElement>()
const document = ref<Awaited<ReturnType<typeof createPluginWebSurface>> | null>(null)
const error = ref('')
const sessionId =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'surface-' + Date.now() + '-' + Math.random().toString(36).slice(2)
let unsubscribe: (() => void) | undefined
let active = false
let disposed = false
let inFlight = 0
let opened = false
let closed = false

function send(type: string, data: unknown) {
  if (disposed || !frame.value?.contentWindow) return
  try {
    frame.value.contentWindow.postMessage(
      JSON.parse(JSON.stringify({ type, data, generation: sessionId })),
      '*'
    )
  } catch {
    // A closing iframe can disappear between the check and postMessage.
  }
}

async function receive(event: MessageEvent) {
  if (!document.value || event.source !== frame.value?.contentWindow || !event.data) return
  if (typeof event.data !== 'object') return
  const { type, data, generation } = event.data
  if (type === 'ready') {
    send('init', document.value.init)
    return
  }
  if (generation !== sessionId) return
  if (type === 'active') {
    if (active) return
    active = true
    send('state', pluginRuntimeManager.getSurfaceState(props.record.key, props.surface.id))
    if (!opened && props.surface.lifecycle?.openAction) {
      opened = true
      try {
        await pluginStore.invokeAction(props.record.key, props.surface.lifecycle.openAction, {})
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '插件页面初始化失败'
        emit('error', error.value)
      }
    }
    send('state', pluginRuntimeManager.getSurfaceState(props.record.key, props.surface.id))
    return
  }
  if (type === 'close-view') {
    emit('close')
    return
  }
  if (type === 'failed') {
    error.value = String(data?.message || '插件页面加载失败').slice(0, 500)
    emit('error', error.value)
    return
  }
  if (type !== 'rpc' || typeof data?.id !== 'string') return
  if (data.method !== 'surface.invoke') {
    send('rpc-result', { id: data.id, error: '不支持的插件页面调用' })
    return
  }
  if (inFlight >= 32 || JSON.stringify(data).length > 128 * 1024) {
    send('rpc-result', { id: data.id, error: '插件页面请求无效或过于频繁' })
    return
  }
  const action = String(data.data?.action || '')
  const allowed = new Set((props.record.manifest.contributes?.commands ?? []).map((item) => item.action))
  if (!allowed.has(action)) {
    send('rpc-result', { id: data.id, error: '插件页面调用了未声明的操作' })
    return
  }
  inFlight++
  try {
    const value = await pluginStore.invokeAction(props.record.key, action, data.data?.input ?? {})
    send('rpc-result', { id: data.id, value })
  } catch (cause) {
    send('rpc-result', {
      id: data.id,
      error: cause instanceof Error ? cause.message : '插件调用失败'
    })
  } finally {
    inFlight--
  }
}

async function closeLifecycle() {
  if (closed || !props.surface.lifecycle?.closeAction) return
  closed = true
  try {
    await pluginStore.invokeAction(props.record.key, props.surface.lifecycle.closeAction, {})
  } catch {
    // Closing the plugin surface must not block navigation.
  }
}

onMounted(async () => {
  window.addEventListener('message', receive)
  unsubscribe = pluginRuntimeManager.onSurfaceState((event) => {
    if (event.pluginKey === props.record.key && event.surfaceId === props.surface.id && active) {
      send('state', event.state)
    }
  })
  try {
    document.value = await createPluginWebSurface(props.record, props.surface.id, sessionId)
    send('init', document.value.init)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '插件页面加载失败'
    emit('error', error.value)
  }
})

onBeforeUnmount(() => {
  send('dispose', {})
  disposed = true
  unsubscribe?.()
  window.removeEventListener('message', receive)
  void closeLifecycle()
})
</script>

<style scoped>
.plugin-web-surface {
  position: absolute;
  inset: 0;
  background: var(--ceru-bg);
}
iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
}
.surface-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  text-align: center;
}
.surface-state.error {
  color: var(--ceru-danger);
}
</style>
