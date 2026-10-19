<template>
  <span hidden />
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { usePluginStore } from '@/stores/plugins'
import { useSettingsStore } from '@/stores/settings'
import {
  applyPluginApplicationStyles,
  clearPluginApplicationStyles,
  collectApplicationStyles
} from '@/services/pluginStyles'

const pluginStore = usePluginStore()
const settings = useSettingsStore()

function apply() {
  const entries = collectApplicationStyles(pluginStore.plugins, (pluginKey, permissionKey) =>
    settings.isPermissionGranted(pluginKey, permissionKey)
  )
  applyPluginApplicationStyles(entries)
}

watch(
  [
    () =>
      pluginStore.plugins
        .map((plugin) => `${plugin.key}:${plugin.enabled}:${plugin.updatedAt}`)
        .join('|'),
    () => JSON.stringify(settings.settings.grantedPermissions)
  ],
  apply,
  { immediate: true }
)

onBeforeUnmount(() => clearPluginApplicationStyles())
</script>
