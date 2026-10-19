<template>
  <button
    v-if="actionCount > 0"
    class="action-trigger"
    type="button"
    @click.stop="$emit('open', track)"
  >
    <ion-icon :icon="sparklesOutline" />
    <span>插件操作 · {{ actionCount }}</span>
    <ion-icon :icon="chevronForwardOutline" class="tail" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { IonIcon } from '@ionic/vue'
import { chevronForwardOutline, sparklesOutline } from 'ionicons/icons'
import type { Track } from '@/types/music'
import { collectPlaylistItemCommands } from '@/services/playlistItemActions'
import { collectPluginSlotExtensions } from '@/services/pluginSlot'
import { useAuthStore } from '@/stores/auth'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  track: Track
}>()

defineEmits<{
  open: [track: Track]
}>()

const route = useRoute()
const auth = useAuthStore()
const pluginStore = usePluginStore()

const actionOptions = computed(() => ({
  routePath: route.path,
  authenticated: auth.authenticated
}))

const actionCount = computed(
  () =>
    collectPlaylistItemCommands(pluginStore.enabledPlugins, actionOptions.value).length +
    collectPluginSlotExtensions(
      pluginStore.enabledPlugins,
      'playlist.item.actions',
      actionOptions.value
    ).length
)

</script>

<style scoped>
.action-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  font-size: 12px;
  font-weight: 650;
  text-align: left;
}
.action-trigger > ion-icon:first-child {
  color: var(--ceru-brand);
  font-size: 17px;
}
.action-trigger span {
  flex: 1;
  min-width: 0;
}
.tail {
  color: var(--ceru-text-secondary);
  font-size: 15px;
}
</style>
