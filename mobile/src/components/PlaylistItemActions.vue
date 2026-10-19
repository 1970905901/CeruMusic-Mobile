<template>
  <div v-if="extensions.length" class="playlist-item-actions">
    <button class="action-trigger" type="button" @click.stop="open = true">
      <ion-icon :icon="sparklesOutline" />
      <span>插件操作 · {{ extensions.length }}</span>
      <ion-icon :icon="chevronForwardOutline" class="tail" />
    </button>

    <ion-modal
      :is-open="open"
      :initial-breakpoint="0.75"
      :breakpoints="[0, 0.25, 0.5, 0.75, 1]"
      @didDismiss="open = false"
    >
      <div v-if="open" class="modal-shell">
        <ion-header :translucent="true">
          <ion-toolbar>
            <ion-title class="modal-title">{{ track.title }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="open = false">关闭</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content :fullscreen="true">
          <div class="modal-body">
            <PluginSlot slot="playlist.item.actions" :context="context" />
          </div>
        </ion-content>
      </div>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar
} from '@ionic/vue'
import { chevronForwardOutline, sparklesOutline } from 'ionicons/icons'
import type { Track } from '@/types/music'
import PluginSlot from '@/components/PluginSlot.vue'
import { collectPluginSlotExtensions } from '@/services/pluginSlot'
import { useAuthStore } from '@/stores/auth'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  track: Track
}>()

const route = useRoute()
const auth = useAuthStore()
const pluginStore = usePluginStore()
const open = ref(false)

const extensions = computed(() =>
  collectPluginSlotExtensions(pluginStore.enabledPlugins, 'playlist.item.actions', {
    routePath: route.path,
    authenticated: auth.authenticated
  })
)

const context = computed(() => ({
  track: JSON.parse(JSON.stringify(props.track.raw)) as Record<string, any>
}))
</script>

<style scoped>
.playlist-item-actions {
  margin: 0 8px 10px;
}
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
.modal-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.modal-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
  font-weight: 750;
}
.modal-body {
  padding: 0 12px calc(20px + env(safe-area-inset-bottom));
}
</style>
