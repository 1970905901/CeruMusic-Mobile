<template>
  <div ref="slotElement" v-if="extensions.length || scopedCss" class="plugin-slot" :data-plugin-slot="slot">
    <PluginSurfaceEmbed
      v-for="extension in extensions"
      :key="extension.plugin.key + ':' + extension.id"
      :record="extension.plugin"
      :surface="extension.surface"
      :mount="extensionMount(extension)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import type { UISlotName } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginSurfaceMount } from '@/services/pluginSurfaceMount'
import PluginSurfaceEmbed from '@/components/PluginSurfaceEmbed.vue'
import { collectPluginSlotExtensions } from '@/services/pluginSlot'
import { useAuthStore } from '@/stores/auth'
import { usePluginStore } from '@/stores/plugins'
import { collectSlotStyles, scopeCss } from '@/services/pluginStyles'

const props = defineProps<{
  slot: UISlotName
  context?: Record<string, any>
}>()

const route = useRoute()
const auth = useAuthStore()
const pluginStore = usePluginStore()
const slotElement = ref<HTMLElement | null>(null)
let styleElement: HTMLStyleElement | null = null

function extensionMount(extension: (typeof extensions.value)[number]): PluginSurfaceMount {
  return {
    kind: 'slot',
    slot: props.slot,
    mode: extension.mode,
    context: props.context
  }
}

const scopedCss = computed(() =>
  collectSlotStyles(pluginStore.plugins, props.slot)
    .map((entry) => scopeCss(entry.css, `[data-plugin-slot="${props.slot}"]`))
    .join('\n')
)

watchEffect(() => {
  const css = scopedCss.value
  const host = slotElement.value
  if (!host || !css) return
  styleElement?.remove()
  styleElement = document.createElement('style')
  styleElement.setAttribute('data-ceru-plugin-slot-style', props.slot)
  styleElement.textContent = css
  host.prepend(styleElement)
})

const extensions = computed(() =>
  collectPluginSlotExtensions(pluginStore.enabledPlugins, props.slot, {
    routePath: route.path,
    authenticated: auth.authenticated
  })
)

onBeforeUnmount(() => {
  styleElement?.remove()
  styleElement = null
})
</script>

<style scoped>
.plugin-slot {
  min-width: 0;
}
</style>
