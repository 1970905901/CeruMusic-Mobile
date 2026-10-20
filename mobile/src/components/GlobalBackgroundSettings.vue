<template>
  <ion-list class="group">
    <div class="group-title">全局背景</div>
    <ion-item>
      <ion-icon slot="start" :icon="imageOutline" color="primary" />
      <ion-label>
        <h2>启用全局背景</h2>
        <p>自定义图片或视频壁纸，覆盖发现、书库与设置页</p>
      </ion-label>
      <ion-toggle :checked="background.enable" @ionChange="update({ enable: $event.detail.checked })" />
    </ion-item>

    <template v-if="background.enable">
      <ion-item>
        <ion-icon slot="start" :icon="folderOpenOutline" color="primary" />
        <ion-label class="file-label">
          <h2>背景文件</h2>
          <p>{{ fileLabel }}</p>
        </ion-label>
        <ion-button size="small" fill="outline" :disabled="picking" @click="chooseFile">
          {{ background.url ? '更换' : '选择' }}
        </ion-button>
      </ion-item>
      <ion-item v-if="background.url">
        <ion-icon slot="start" :icon="trashOutline" color="primary" />
        <ion-label>
          <h2>移除背景</h2>
          <p>删除已保存的壁纸文件</p>
        </ion-label>
        <ion-button size="small" fill="outline" color="danger" @click="removeFile">移除</ion-button>
      </ion-item>
      <ion-item>
        <ion-icon slot="start" :icon="contrastOutline" color="primary" />
        <ion-label>
          <h2>不透明度</h2>
          <p>{{ Math.round(background.opacity * 100) }}%</p>
        </ion-label>
        <ion-range
          :value="background.opacity"
          :min="0"
          :max="1"
          :step="0.01"
          @ionInput="update({ opacity: Number($event.detail.value) })"
        />
      </ion-item>
      <ion-item>
        <ion-icon slot="start" :icon="waterOutline" color="primary" />
        <ion-label>
          <h2>模糊度</h2>
          <p>{{ background.blur }} px</p>
        </ion-label>
        <ion-range
          :value="background.blur"
          :min="0"
          :max="50"
          :step="1"
          @ionInput="update({ blur: Number($event.detail.value) })"
        />
      </ion-item>
      <ion-item>
        <ion-icon slot="start" :icon="sunnyOutline" color="primary" />
        <ion-label>
          <h2>亮度</h2>
          <p>{{ Math.round(background.brightness * 100) }}%</p>
        </ion-label>
        <ion-range
          :value="background.brightness"
          :min="0"
          :max="2"
          :step="0.01"
          @ionInput="update({ brightness: Number($event.detail.value) })"
        />
      </ion-item>
    </template>
  </ion-list>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonRange,
  IonToggle,
  toastController
} from '@ionic/vue'
import {
  contrastOutline,
  folderOpenOutline,
  imageOutline,
  sunnyOutline,
  trashOutline,
  waterOutline
} from 'ionicons/icons'
import { useSettingsStore } from '@/stores/settings'
import {
  deleteGlobalBackgroundFile,
  normalizeGlobalBackground,
  persistGlobalBackground,
  pickGlobalBackgroundFile
} from '@/services/globalBackground'

const settings = useSettingsStore()
const picking = ref(false)

const background = computed(() => settings.settings.globalBackground)

const fileLabel = computed(() => {
  if (!background.value.url) return '支持图片与视频（mp4 / webm / gif）'
  const name = decodeURIComponent(background.value.url.split('/').pop() || '')
  return (background.value.type === 'video' ? '视频 · ' : '图片 · ') + name
})

function update(patch: Partial<typeof background.value>) {
  settings.settings.globalBackground = normalizeGlobalBackground({
    ...background.value,
    ...patch
  })
}

async function notify(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}

async function chooseFile() {
  if (picking.value) return
  picking.value = true
  const previous = background.value.url
  try {
    const file = await pickGlobalBackgroundFile()
    if (!file) return
    const stored = await persistGlobalBackground(file)
    settings.settings.globalBackground = normalizeGlobalBackground({
      ...background.value,
      ...stored,
      enable: true
    })
    if (previous && previous !== stored.url) await deleteGlobalBackgroundFile(previous)
  } catch (cause) {
    await notify(cause instanceof Error ? cause.message : '背景设置失败', 'danger')
  } finally {
    picking.value = false
  }
}

async function removeFile() {
  const previous = background.value.url
  settings.settings.globalBackground = normalizeGlobalBackground({
    ...background.value,
    enable: false,
    type: 'none',
    url: ''
  })
  await deleteGlobalBackgroundFile(previous)
  await notify('已移除全局背景')
}
</script>

<style scoped>
.group {
  margin-top: 22px;
  --ion-item-background: var(--ceru-bg-elevated);
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
}
.group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ceru-text-secondary);
  letter-spacing: 0.04em;
  padding: 0 18px 8px;
}
ion-item h2 {
  font-size: 15px;
  font-weight: 650;
}
ion-item p {
  font-size: 12px;
  color: var(--ceru-text-secondary);
  margin-top: 3px;
}
.file-label p {
  word-break: break-all;
}
ion-range {
  max-width: 46%;
  padding-left: 12px;
}
</style>
