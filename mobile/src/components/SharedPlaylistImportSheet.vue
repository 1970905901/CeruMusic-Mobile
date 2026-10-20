<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.9"
    :breakpoints="[0, 0.6, 0.9, 1]"
    @didDismiss="$emit('close')"
  >
    <div class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title>导入分享歌单</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="importing" @click="$emit('close')">关闭</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
        <div class="body">
          <p class="description">
            粘贴一个或多个澜音歌单分享链接，每行一个。支持 cerumusic:// 与 https:// 分享地址。
          </p>

          <div class="field">
            <ion-label position="stacked">歌单分享链接</ion-label>
            <ion-textarea
              v-model="value"
              :auto-grow="true"
              :rows="6"
              :disabled="importing"
              placeholder="cerumusic://playlist/share/..."
            />
          </div>

          <div v-if="value.trim()" class="summary">
            <span class="ok">{{ validEntries.length }} 个可导入</span>
            <span v-if="invalidEntries.length" class="bad">{{ invalidEntries.length }} 行有问题</span>
          </div>

          <ul v-if="invalidEntries.length" class="errors">
            <li v-for="(entry, index) in invalidEntries" :key="index">
              <span class="line">{{ entry.input }}</span>
              <span class="reason">{{ entry.error }}</span>
            </li>
          </ul>

          <p v-if="error" class="error">{{ error }}</p>
          <p v-if="importing" class="progress">
            <ion-spinner name="crescent" />
            <span>{{ progressText }}</span>
          </p>

          <ion-button expand="block" :disabled="!validEntries.length || importing" @click="importAll">
            {{ importing ? '正在导入…' : '导入 ' + validEntries.length + ' 个歌单' }}
          </ion-button>
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
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import shareApi from '@/services/shareApi'
import {
  fetchSharedPlaylistSongs,
  parseSharedPlaylistInputs,
  sharedPlaylistTracks
} from '@/services/sharedPlaylist'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import type { Playlist } from '@/types/music'

const props = defineProps<{
  open?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const value = ref('')
const importing = ref(false)
const error = ref('')
const progressText = ref('')

const entries = computed(() => {
  if (!value.value.trim()) return []
  try {
    return parseSharedPlaylistInputs(value.value)
  } catch {
    return []
  }
})
const validEntries = computed(() => entries.value.filter((entry) => entry.id))
const invalidEntries = computed(() => entries.value.filter((entry) => entry.error))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    progressText.value = ''
  }
)

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2600, color })
  await element.present()
}

async function importAll() {
  if (importing.value) return
  const targets = validEntries.value
  if (!targets.length) return
  importing.value = true
  error.value = ''
  const created: Playlist[] = []
  const failures: string[] = []
  try {
    for (let index = 0; index < targets.length; index++) {
      const entry = targets[index]
      const id = entry.id as string
      progressText.value = `正在导入 ${index + 1}/${targets.length}`
      try {
        const result = await fetchSharedPlaylistSongs(
          id,
          (limit, pos) => shareApi.getPlaylistById(id, limit, pos),
          {
            onProgress: (loaded, total) => {
              const count = total ? `${loaded}/${total}` : String(loaded)
              progressText.value = `正在导入 ${index + 1}/${targets.length} · ${count} 首`
            }
          }
        )
        const mapped = sharedPlaylistTracks(result.songs, {
          providers: pluginStore.providers,
          shareId: id
        })
        const playlist = await library.importSharedPlaylist(
          result.detail.playlist.name || '分享歌单',
          result.detail.playlist.describe || '',
          mapped
        )
        created.push(playlist)
      } catch (cause) {
        failures.push(
          (entry.id || entry.input) + '：' + (cause instanceof Error ? cause.message : '导入失败')
        )
      }
    }

    if (created.length) {
      const totalTracks = created.reduce((sum, item) => sum + item.trackKeys.length, 0)
      await toast(`已导入 ${created.length} 个歌单，共 ${totalTracks} 首`, 'success')
    }
    if (failures.length) {
      error.value = failures.join('；')
      await toast(
        created.length ? `已导入 ${created.length} 个，${failures.length} 个失败` : '导入失败',
        created.length ? 'warning' : 'danger'
      )
      return
    }
    if (created.length) {
      value.value = ''
      emit('close')
      void router.push('/playlist/' + created[created.length - 1].id)
    }
  } finally {
    importing.value = false
    progressText.value = ''
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
.description {
  margin: 0 0 14px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.field {
  margin-bottom: 12px;
}
.field ion-label {
  display: block;
  margin-bottom: 7px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.summary {
  display: flex;
  gap: 14px;
  margin: 0 0 8px;
  font-size: 12px;
}
.summary .ok {
  color: var(--ceru-brand);
  font-weight: 650;
}
.summary .bad {
  color: var(--ceru-danger);
  font-weight: 650;
}
.errors {
  margin: 0 0 12px;
  padding-left: 18px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}
.errors .line {
  display: block;
  color: var(--ceru-text);
  word-break: break-all;
}
.errors .reason {
  color: var(--ceru-danger);
}
.error {
  margin: 0 0 12px;
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
}
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.progress ion-spinner {
  width: 16px;
  height: 16px;
}
</style>
