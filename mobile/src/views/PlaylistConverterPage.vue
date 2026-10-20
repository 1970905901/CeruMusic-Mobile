<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>歌单转换器</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <div class="converter-head ceru-pad">
        <p class="eyebrow">PLAYLIST TOOL</p>
        <h1 class="ceru-title">转换歌单格式</h1>
        <p class="head-sub">读取桌面端导出的 JSON 或 LXMC 歌单，生成 Ceru Music 可导入的 .cpl 文件。</p>
      </div>
      <div class="pick-card ceru-card ceru-pad">
        <ion-icon :icon="swapHorizontalOutline" class="pick-icon" />
        <strong>{{ file ? file.name : '选择歌单文件' }}</strong>
        <span>支持 .json / .lxmc</span>
        <ion-button fill="outline" @click="pickFile">选择文件</ion-button>
        <input ref="fileInput" class="file-input" type="file" accept=".json,.lxmc" @change="onFilePicked" />
      </div>

      <div v-if="songs.length" class="summary ceru-pad">
        <div class="summary-count">{{ songs.length }} 首歌曲</div>
        <div v-if="firstTitle" class="summary-preview ceru-truncate">第一首：{{ firstTitle }}</div>
      </div>

      <div class="actions">
        <ion-button expand="block" :disabled="!songs.length || converting" @click="convert">
          {{ converting ? '正在转换…' : '转换为 .cpl' }}
        </ion-button>
        <ion-button v-if="encrypted" expand="block" fill="outline" @click="share">
          保存 / 分享 .cpl
        </ion-button>
      </div>

      <p class="hint">转换后的文件只包含歌曲引用和元数据，不包含音频文件本身。</p>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import { swapHorizontalOutline } from 'ionicons/icons'
import { saveAndShareFile } from '@/services/fileExport'
import {
  convertPlaylist,
  encryptPlaylist,
  parsePlaylistFile,
  type ConvertedPlaylistSong
} from '@/services/playlistConverter'

const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const songs = ref<ConvertedPlaylistSong[]>([])
const encrypted = ref('')
const converting = ref(false)
const firstTitle = computed(() => songs.value[0]?.name || '')

function pickFile(): void {
  fileInput.value?.click()
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0] || null
  input.value = ''
  if (!picked) return
  encrypted.value = ''
  try {
    const parsed = await parsePlaylistFile(picked)
    songs.value = convertPlaylist(parsed)
    file.value = picked
    await toast('已读取 ' + songs.value.length + ' 首歌曲')
  } catch (error) {
    songs.value = []
    file.value = null
    await toast(error instanceof Error ? error.message : '文件读取失败', 'danger')
  }
}

async function convert(): Promise<void> {
  if (!songs.value.length) return
  converting.value = true
  try {
    encrypted.value = encryptPlaylist(songs.value)
    await toast('转换完成')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '转换失败', 'danger')
  } finally {
    converting.value = false
  }
}

async function share(): Promise<void> {
  if (!encrypted.value) return
  const fileName = 'cerumusic-playlist-' + new Date().toISOString().slice(0, 10) + '.cpl'
  try {
    await saveAndShareFile({
      name: fileName,
      data: encrypted.value,
      mime: 'application/octet-stream',
      title: 'Ceru Music 歌单'
    })
  } catch (error) {
    await toast(error instanceof Error ? error.message : '保存失败', 'danger')
  }
}

async function toast(message: string, color = 'medium'): Promise<void> {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}
</script>
<style scoped>
.converter-head {
  padding-top: 18px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.head-sub {
  margin: 10px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.pick-card {
  margin: 28px 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 18px;
  text-align: center;
}
.pick-icon {
  font-size: 42px;
  color: var(--ceru-brand);
}
.pick-card strong {
  font-size: 15px;
}
.pick-card span {
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.file-input {
  display: none;
}
.summary {
  padding-top: 22px;
}
.summary-count {
  font-size: 20px;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.summary-preview {
  margin-top: 4px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 26px 16px 0;
}
.actions ion-button {
  margin: 0;
}
.hint {
  margin: 18px 20px 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.55;
  text-align: center;
}
.bottom-space {
  height: 120px;
}
</style>