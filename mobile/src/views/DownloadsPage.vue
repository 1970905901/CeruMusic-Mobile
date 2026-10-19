<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>下载管理</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="downloads.completed.length" fill="clear" @click="clearCompleted">
            清理
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="head ceru-pad">
        <p class="eyebrow">OFFLINE</p>
        <h1 class="ceru-title">下载</h1>
        <p class="head-sub">下载文件保存在应用私有目录，可从系统分享导出。</p>
      </div>

      <div v-if="downloads.tasks.length" class="task-list">
        <div v-for="task in downloads.tasks" :key="task.id" class="task-card ceru-card">
          <div class="task-top">
            <CoverImage :src="task.cover" :size="54" :radius="12" :alt="task.title" />
            <div class="task-copy">
              <div class="task-title ceru-truncate">{{ task.title }}</div>
              <div class="task-artist ceru-truncate">{{ task.artist }}</div>
              <div class="task-meta">
                <span :class="'status-' + task.status">{{ statusLabel(task.status) }}</span>
                <span v-if="task.quality">{{ task.quality }}</span>
                <span v-if="task.totalBytes">{{ formatSize(task.receivedBytes) }} / {{ formatSize(task.totalBytes) }}</span>
                <span v-else-if="task.receivedBytes">{{ formatSize(task.receivedBytes) }}</span>
              </div>
            </div>
            <button class="task-more" type="button" aria-label="下载任务操作" @click="openTaskActions(task)">
              <ion-icon :icon="ellipsisVertical" />
            </button>
          </div>
          <ion-progress-bar
            v-if="task.status === 'running' || task.status === 'queued' || task.status === 'paused'"
            :value="task.totalBytes ? task.receivedBytes / task.totalBytes : 0.02"
            class="task-progress"
          />
          <p v-if="task.error" class="task-error">{{ task.error }}</p>
        </div>
      </div>

      <EmptyState
        v-else
        title="还没有下载"
        description="在歌曲菜单或播放器中选择下载，完成的歌曲可离线播放。"
        :icon="cloudDownloadOutline"
      >
        <ion-button fill="outline" @click="$router.push('/tabs/discover')">去发现音乐</ion-button>
      </EmptyState>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonProgressBar,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import { cloudDownloadOutline, ellipsisVertical } from 'ionicons/icons'
import CoverImage from '@/components/CoverImage.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDownloadStore } from '@/stores/downloads'
import { usePlayerStore } from '@/stores/player'
import type { DownloadTask } from '@/types/download'

const downloads = useDownloadStore()
const player = usePlayerStore()

function statusLabel(status: DownloadTask['status']): string {
  switch (status) {
    case 'queued':
      return '等待中'
    case 'running':
      return '下载中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
  }
}

function formatSize(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

async function playTask(task: DownloadTask) {
  const track = downloads.play(task.id)
  if (!track) return
  try {
    await player.playTrack(track)
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function openTaskActions(task: DownloadTask) {
  const buttons: any[] = []
  if (task.status === 'completed') {
    buttons.push({ text: '播放', handler: () => void playTask(task) })
    buttons.push({ text: '分享 / 导出', handler: () => void shareTask(task) })
  }
  if (task.status === 'running' || task.status === 'queued') {
    buttons.push({ text: '暂停', handler: () => downloads.pause([task.id]) })
  }
  if (task.status === 'paused') {
    buttons.push({ text: '继续', handler: () => downloads.resume([task.id]) })
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    buttons.push({ text: '重试', handler: () => downloads.retry([task.id]) })
  }
  if (task.status !== 'completed') {
    buttons.push({ text: '取消', role: 'destructive', handler: () => downloads.cancel([task.id]) })
  }
  buttons.push({
    text: '删除记录',
    role: 'destructive',
    handler: () => {
      void confirmDelete(task)
    }
  })
  buttons.push({ text: '关闭', role: 'cancel' })
  const sheet = await actionSheetController.create({ header: task.title, buttons })
  await sheet.present()
}

async function shareTask(task: DownloadTask) {
  try {
    await downloads.share(task.id)
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function confirmDelete(task: DownloadTask) {
  const alert = await alertController.create({
    header: '删除下载？',
    message: '记录和已下载文件会被删除。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '删除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'destructive') await downloads.remove(task.id)
}

async function clearCompleted() {
  const alert = await alertController.create({
    header: '清理已完成下载？',
    message: '会删除应用内下载文件。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '清理', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'destructive') await downloads.clearCompleted()
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}
</script>

<style scoped>
.head {
  padding-top: 14px;
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
.task-list {
  display: grid;
  gap: 10px;
  padding: 22px 16px 0;
}
.task-card {
  padding: 12px;
}
.task-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.task-copy {
  min-width: 0;
  flex: 1;
}
.task-title {
  font-size: 14px;
  font-weight: 650;
}
.task-artist {
  font-size: 11px;
  color: var(--ceru-text-secondary);
  margin-top: 3px;
}
.task-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 10px;
  color: var(--ceru-text-secondary);
}
.status-running,
.status-queued {
  color: var(--ceru-brand);
}
.status-failed {
  color: var(--ceru-danger);
}
.task-more {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 20px;
  display: grid;
  place-items: center;
}
.task-progress {
  margin-top: 10px;
  --progress-background: var(--ceru-brand);
  border-radius: 999px;
  height: 3px;
}
.task-error {
  margin: 8px 0 0;
  color: var(--ceru-danger);
  font-size: 11px;
  line-height: 1.45;
}
.bottom-space {
  height: 140px;
}
</style>
