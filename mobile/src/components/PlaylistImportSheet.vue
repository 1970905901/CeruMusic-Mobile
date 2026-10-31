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
          <template v-if="importMenus.length">
            <div class="section-title">插件导入入口</div>
            <div class="menu-list">
              <button
                v-for="entry in importMenus"
                :key="entry.key"
                type="button"
                class="menu-row"
                :disabled="importMenuBusy"
                @click="openImportMenu(entry)"
              >
                <span class="menu-copy">
                  <strong>{{ entry.title }}</strong>
                  <small>{{ entry.description || entry.pluginName }}</small>
                </span>
                <ion-icon :icon="chevronForward" />
              </button>
            </div>
          </template>

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
            v-if="!importers.length && !importMenus.length"
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
  IonIcon,
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
import { chevronForward, cloudDownloadOutline } from 'ionicons/icons'
import EmptyState from '@/components/EmptyState.vue'
import {
  collectPlaylistImporters,
  validatePlaylistImportValue,
  type PlaylistImporterEntry
} from '@/services/playlistImporters'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import { useAuthStore } from '@/stores/auth'
import { collectPlaylistImportMenus } from '@/services/playlistImportMenus'

const props = defineProps<{
  open?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const auth = useAuthStore()
const selectedKey = ref('')
const value = ref('')
const importing = ref(false)
const error = ref('')

/**
 * `playlist.import` 菜单：插件在「选择导入方式」里加的入口。
 *
 * 这类菜单背后的 action 由插件自己执行（通常开它自己的面板），宿主只需要
 * 把入口列出来并调用命令——桌面 `openPluginImport` 同口径。
 */
const importMenus = computed(() =>
  collectPlaylistImportMenus(pluginStore.enabledPlugins, {
    runtimeInfo: pluginStore.runtimeInfo,
    authenticated: auth.authenticated
  })
)

async function openImportMenu(entry: { pluginKey: string; action: string; title: string }) {
  if (importMenuBusy.value) return
  importMenuBusy.value = true
  try {
    await pluginStore.invokeAction(entry.pluginKey, entry.action, {})
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    importMenuBusy.value = false
  }
}
const importMenuBusy = ref(false)

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

/**
 * 每次打开都从干净状态开始。此前上一次的「导入失败：……」会原样留在面板里，
 * 用户重开面板以为这次的链接也失败了，而输入框里还是空的。
 * 输入值本身保留，方便用户改一改再试。
 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
  }
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
/* 插件的 playlist.import 入口：与下方的导入器表单并列，先列入口再填表单。 */
.section-title {
  margin: 4px 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ceru-text-secondary);
}
.menu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}
.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-text);
  text-align: left;
}
.menu-row:disabled {
  opacity: 0.6;
}
.menu-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.menu-copy strong {
  font-size: 14px;
  font-weight: 650;
}
.menu-copy small {
  font-size: 11px;
  color: var(--ceru-text-secondary);
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
