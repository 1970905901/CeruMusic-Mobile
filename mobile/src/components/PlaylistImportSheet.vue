<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.85"
    :breakpoints="[0, 0.5, 0.75, 0.85, 1]"
    @didDismiss="$emit('close')"
  >
    <div class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title>导入歌单</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="importing" @click="$emit('close')">关闭</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
        <div class="body">
          <template v-if="importers.length">
            <div class="field">
              <ion-label position="stacked">导入来源</ion-label>
              <ion-select
                v-model="selectedKey"
                interface="action-sheet"
                cancel-text="取消"
                :disabled="importing"
              >
                <ion-select-option
                  v-for="importer in importers"
                  :key="importer.key"
                  :value="importer.key"
                >
                  {{ importer.title }} · {{ importer.pluginName }}
                </ion-select-option>
              </ion-select>
            </div>

            <template v-if="selectedImporter">
              <p v-if="selectedImporter.description" class="description">
                {{ selectedImporter.description }}
              </p>

              <div class="field">
                <ion-label position="stacked">歌单链接或 ID</ion-label>
                <ion-textarea
                  v-model="value"
                  :placeholder="selectedImporter.placeholder || '粘贴歌单链接或 ID'"
                  :auto-grow="true"
                  :rows="2"
                  :disabled="importing"
                />
              </div>

              <div v-if="selectedImporter.examples.length" class="examples">
                <button
                  v-for="example in selectedImporter.examples"
                  :key="example.label + example.value"
                  type="button"
                  class="example-chip"
                  :disabled="importing"
                  @click="value = example.value"
                >
                  {{ example.label }}
                </button>
              </div>

              <ul v-if="selectedImporter.instructions.length" class="instructions">
                <li v-for="line in selectedImporter.instructions" :key="line">{{ line }}</li>
              </ul>

              <p v-if="error" class="error">{{ error }}</p>

              <ion-button expand="block" :disabled="importing" @click="importPlaylist">
                <ion-spinner v-if="importing" name="crescent" />
                <span>{{ importing ? '正在导入…' : '导入歌单' }}</span>
              </ion-button>
            </template>
          </template>

          <EmptyState
            v-else
            title="没有可用导入器"
            description="安装并启用提供歌单导入功能的插件后，这里会出现导入入口。"
            :icon="cloudDownloadOutline"
          />
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonLabel,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import { cloudDownloadOutline } from 'ionicons/icons'
import EmptyState from '@/components/EmptyState.vue'
import {
  collectPlaylistImporters,
  validatePlaylistImportValue,
  type PlaylistImporterEntry
} from '@/services/playlistImporters'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'

defineProps<{
  open?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const selectedKey = ref('')
const value = ref('')
const importing = ref(false)
const error = ref('')

const importers = computed(() =>
  collectPlaylistImporters(pluginStore.enabledPlugins, {
    runtimeInfo: pluginStore.runtimeInfo
  })
)
const selectedImporter = computed(() =>
  importers.value.find((item) => item.key === selectedKey.value)
)

watch(
  () => importers.value.map((item) => item.key).join('|'),
  () => {
    if (!importers.value.some((item) => item.key === selectedKey.value)) {
      selectedKey.value = importers.value[0]?.key ?? ''
    }
  },
  { immediate: true }
)

watch(
  () => importers.value,
  (entries) => {
    if (entries.length && !selectedKey.value) selectedKey.value = entries[0].key
  },
  { immediate: true }
)

function close() {
  emit('close')
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2600, color })
  await element.present()
}

async function importPlaylist() {
  const importer = selectedImporter.value
  if (!importer || importing.value) return
  error.value = ''
  let text = ''
  try {
    text = validatePlaylistImportValue(value.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return
  }
  importing.value = true
  try {
    const playlist = await library.importPlaylistFromPlugin(
      importer.pluginKey,
      importer.pluginId,
      importer.importerId,
      text
    )
    await toast(`已导入“${playlist.name}”`, 'success')
    value.value = ''
    close()
    void router.push(`/playlist/${playlist.id}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.modal-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.body {
  padding: 16px 14px calc(24px + env(safe-area-inset-bottom));
}
.field {
  margin-bottom: 14px;
}
.field ion-label {
  display: block;
  margin-bottom: 7px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.description {
  margin: 0 0 12px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
}
.example-chip {
  padding: 7px 11px;
  border: 1px solid var(--ceru-border);
  border-radius: 999px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  font-size: 11px;
  font-weight: 650;
}
.instructions {
  margin: 0 0 14px;
  padding-left: 18px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.error {
  margin: 0 0 12px;
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
}
ion-button ion-spinner {
  width: 16px;
  height: 16px;
  margin-right: 8px;
}
</style>
