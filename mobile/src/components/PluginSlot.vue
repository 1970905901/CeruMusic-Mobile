<template>
  <div v-if="extensions.length" class="plugin-slot" :data-plugin-slot="slot">
    <PluginSurfaceEmbed
      v-for="extension in extensions"
      :key="extension.plugin.key + ':' + extension.id"
      :record="extension.plugin"
      :surface="extension.surface"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { UISlotName } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import PluginSurfaceEmbed from '@/components/PluginSurfaceEmbed.vue'
import { getPluginSurface } from '@/services/pluginSurface'
import { useAuthStore } from '@/stores/auth'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  slot: UISlotName
}>()

const route = useRoute()
const auth = useAuthStore()
const pluginStore = usePluginStore()

function routeMatches(pattern?: string): boolean {
  if (!pattern) return true
  const current = route.path
  if (pattern.endsWith('*')) return current.startsWith(pattern.slice(0, -1))
  const base = pattern.replace(/\/+$/, '')
  return current === base || current.startsWith(base + '/')
}

const extensions = computed(() => {
  const result = []
  for (const plugin of pluginStore.enabledPlugins) {
    for (const extension of plugin.manifest.contributes?.uiExtensions ?? []) {
      if (extension.slot !== props.slot) continue
      if (
        extension.when?.loggedIn !== undefined &&
        extension.when.loggedIn !== auth.authenticated
      ) {
        continue
      }
      if (!routeMatches(extension.when?.route)) continue
      const surface = getPluginSurface(plugin.manifest, extension.view)
      if (!surface) continue
      result.push({
        ...extension,
        plugin,
        surface
      })
    }
  }
  return result.sort(
    (left, right) =>
      Number(left.order || 0) - Number(right.order || 0) ||
      left.plugin.manifest.name.localeCompare(right.plugin.manifest.name)
  )
})
</script>

<style scoped>
.plugin-slot {
  min-width: 0;
}
</style>
