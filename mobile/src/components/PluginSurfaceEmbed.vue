<template>
  <section ref="surfaceElement" class="plugin-surface-embed" :data-plugin-surface="record.key + ':' + surface.id">
    <header v-if="surface.kind === 'web'" class="embed-head">
      <span class="embed-title">{{ surface.title || record.manifest.name }}</span>
      <small>{{ record.manifest.name }}</small>
    </header>
    <PluginWebSurface
      v-if="surface.kind === 'web'"
      :record="record"
      :surface="surface"
      :mount="mount"
      embedded
      @error="error = $event"
    />
    <PluginNativeSurface
      v-else-if="surface.kind === 'native'"
      :record="record"
      :surface="surface"
      :mount="mount"
      embedded
    />
    <PluginSchemaSurface
      v-else-if="surface.kind === 'schema'"
      :record="record"
      :surface="surface"
      :mount="mount"
      embedded
    />
    <div v-else class="embed-error">不支持的插件界面类型</div>
    <p v-if="error" class="embed-error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'
import type { SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import type { PluginSurfaceMount } from '@/services/pluginSurfaceMount'
import PluginWebSurface from '@/components/PluginWebSurface.vue'
import PluginNativeSurface from '@/components/PluginNativeSurface.vue'
import PluginSchemaSurface from '@/components/PluginSchemaSurface.vue'
import { collectSurfaceStyles, scopeCss } from '@/services/pluginStyles'

const props = defineProps<{
  record: PluginRecord
  surface: SurfaceDeclaration
  mount?: PluginSurfaceMount
}>()

const surfaceElement = ref<HTMLElement | null>(null)
const error = ref('')
let styleElement: HTMLStyleElement | null = null

const scopedCss = computed(() =>
  props.surface.kind === 'web'
    ? ''
    : collectSurfaceStyles([props.record])
        .map((entry) =>
          scopeCss(
            entry.css,
            `[data-plugin-surface="${props.record.key}:${props.surface.id}"]`
          )
        )
        .join('\n')
)

watchEffect(() => {
  const css = scopedCss.value
  const host = surfaceElement.value
  if (!host || !css) return
  styleElement?.remove()
  styleElement = document.createElement('style')
  styleElement.setAttribute('data-ceru-plugin-surface-style', props.surface.id)
  styleElement.textContent = css
  host.prepend(styleElement)
})

onBeforeUnmount(() => {
  styleElement?.remove()
  styleElement = null
})
</script>

<style scoped>
.plugin-surface-embed {
  margin-top: 12px;
  min-width: 0;
}
.embed-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px 7px;
}
.embed-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ceru-text);
  font-size: 12px;
  font-weight: 700;
}
.embed-head small {
  flex: 0 0 auto;
  color: var(--ceru-text-secondary);
  font-size: 9px;
}
.embed-error {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 11px;
  line-height: 1.5;
}
</style>
