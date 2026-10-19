<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.75"
    :breakpoints="[0, 0.25, 0.5, 0.75, 1]"
    @didDismiss="$emit('close')"
  >
    <div v-if="open && track" class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title class="modal-title">{{ track.title }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">关闭</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content :fullscreen="true">
        <div class="modal-body">
          <div v-if="commands.length" class="command-list">
            <button
              v-for="command in commands"
              :key="command.pluginKey + ':' + command.id"
              type="button"
              class="command-row"
              :disabled="busy === command.pluginKey + ':' + command.id"
              @click="run(command)"
            >
              <span class="ceru-truncate">{{ command.title }}</span>
              <small class="ceru-truncate">{{ command.pluginName }}</small>
            </button>
          </div>

          <PluginSlot slot="playlist.item.actions" :context="context" />
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import type { Track } from '@/types/music'
import PluginSlot from '@/components/PluginSlot.vue'
import {
  collectPlaylistItemCommands,
  playlistItemContext,
  type PlaylistItemCommandEntry
} from '@/services/playlistItemActions'
import { useAuthStore } from '@/stores/auth'
import { usePluginStore } from '@/stores/plugins'

const props = defineProps<{
  open?: boolean
  track?: Track | null
}>()

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const auth = useAuthStore()
const pluginStore = usePluginStore()
const busy = ref('')

const commands = computed(() =>
  props.track
    ? collectPlaylistItemCommands(pluginStore.enabledPlugins, {
        routePath: route.path,
        authenticated: auth.authenticated
      })
    : []
)

const context = computed(() =>
  props.track ? playlistItemContext(props.track) : { track: null }
)

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

async function run(command: PlaylistItemCommandEntry) {
  if (!props.track || busy.value) return
  const key = command.pluginKey + ':' + command.id
  busy.value = key
  try {
    await pluginStore.invokeAction(command.pluginKey, command.action, context.value)
    await toast('已执行')
    emit('close')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '插件操作失败', 'danger')
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped>
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
.command-list {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}
.command-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  text-align: left;
}
.command-row:disabled {
  opacity: 0.55;
}
.command-row span {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 650;
}
.command-row small {
  flex: 0 0 auto;
  max-width: 34%;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
</style>
