<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/account" text="" />
        </ion-buttons>
        <ion-title>消息</ion-title>
        <ion-buttons slot="end">
          <!-- 桌面版消息中心有独立的刷新按钮：实时连接掉线时用户还能手动拉一次 -->
          <ion-button fill="clear" :disabled="notifications.loading" @click="refresh">
            <ion-icon slot="icon-only" :icon="refreshOutline" />
          </ion-button>
          <ion-button v-if="notifications.items.length" fill="clear" :disabled="notifications.clearing" @click="clearRead">
            {{ notifications.clearing ? '清理中' : '清理' }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="notifications.category" scrollable @ionChange="changeCategory">
          <ion-segment-button value="all">全部 {{ notifications.counts.all || '' }}</ion-segment-button>
          <ion-segment-button value="notice">通知 {{ notifications.counts.notice || '' }}</ion-segment-button>
          <ion-segment-button value="interaction">赞与回复 {{ notifications.counts.interaction || '' }}</ion-segment-button>
          <ion-segment-button value="comment">评论 {{ notifications.counts.comment || '' }}</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="!auth.authenticated" class="empty ceru-pad">
        <ion-icon :icon="notificationsOffOutline" />
        <h2>登录后查看消息</h2>
        <p>点赞、回复和评论会出现在这里。</p>
        <ion-button @click="$router.push('/account')">去登录</ion-button>
      </div>

      <template v-else>
        <div v-if="notifications.items.length" class="notice-list">
          <button
            v-for="item in notifications.items"
            :key="item.id"
            type="button"
            class="notice-card"
            :class="{ unread: !item.read }"
            @click="openItem(item)"
          >
            <div class="notice-avatar">
              <CoverImage :src="ossAvatar(item.actorAvatar || item.cover)" :size="44" :radius="22" :alt="item.actorName || item.title" />
            </div>
            <div class="notice-copy">
              <div class="notice-title ceru-truncate">{{ item.title || item.actorName || '系统通知' }}</div>
              <div class="notice-content">{{ item.content }}</div>
              <div class="notice-time">{{ formatTime(item.createdAt) }}</div>
            </div>
            <span v-if="!item.read" class="unread-dot" />
          </button>
        </div>

        <div v-if="notifications.loading" class="loading"><ion-spinner name="crescent" /> 加载中…</div>
        <div v-else-if="notifications.error" class="empty ceru-pad">
          <p>{{ notifications.error }}</p>
          <ion-button fill="outline" @click="reload">重试</ion-button>
        </div>
        <div v-else-if="!notifications.items.length" class="empty ceru-pad">
          <ion-icon :icon="mailOpenOutline" />
          <h2>暂无消息</h2>
          <p>新的互动会显示在这里。</p>
        </div>
        <div v-if="notifications.nextCursor" class="load-more">
          <ion-button fill="clear" :disabled="notifications.loading" @click="notifications.load()">加载更多</ion-button>
        </div>
      </template>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template><script setup lang="ts">
import { onMounted } from 'vue'
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToolbar, toastController, useIonRouter } from '@ionic/vue'
import { mailOpenOutline, notificationsOffOutline, refreshOutline } from 'ionicons/icons'
import CoverImage from '@/components/CoverImage.vue'
import { ossAvatar } from '@/services/ossImage'
import { resolveNotificationTarget } from '@/services/notificationTarget'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import type { InboxMessage } from '@/services/notificationsApi'

const auth = useAuthStore()
const notifications = useNotificationsStore()
const router = useIonRouter()

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

async function reload() {
  await notifications.refreshCounts()
  await notifications.load(true)
}

/**
 * 手动刷新：先清空再重新拉第一页。
 *
 * `load(true)` 会自己清空列表，但 `load` 在 `loading` 为真时直接返回——
 * 用户连点或刚进页时刷新按钮会像「没反应」。这里先等一下在途请求结束，
 * 再发起刷新，并把失败原因明确提示出来，而不是静默留一个旧列表。
 */
async function refresh(): Promise<void> {
  while (notifications.loading) await new Promise((resolve) => setTimeout(resolve, 60))
  await reload()
  if (notifications.error) await toast(notifications.error, 'danger')
}

async function changeCategory() {
  await notifications.load(true)
  /* 分类切换后角标可能落后于服务端（例如别处已读），顺带对齐一次 */
  await notifications.refreshCounts()
}

async function openItem(item: InboxMessage) {
  await notifications.markRead([item])
  const target = resolveNotificationTarget(item)
  if (!target) return
  router.push(target.path)
  if (target.reply && target.replyToName) {
    await toast('已定位到 ' + target.replyToName + ' 的评论')
  }
}

async function clearRead() {
  if (await notifications.clearRead()) await toast('已清理已读消息')
}

async function toast(message: string, color = 'medium'): Promise<void> {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}

onMounted(async () => {
  if (auth.authenticated) await reload()
})
</script>

<style scoped>
.notice-list { padding: 12px 8px 0; }
.notice-card { width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 12px 10px; border: 0; border-bottom: 1px solid var(--ceru-border); background: transparent; color: var(--ceru-text); text-align: left; }
.notice-card.unread { background: rgba(0, 179, 155, 0.06); }
.notice-avatar { flex: 0 0 auto; }
.notice-copy { flex: 1; min-width: 0; }
.notice-title { font-size: 13px; font-weight: 650; }
.notice-content { margin-top: 4px; color: var(--ceru-text-secondary); font-size: 12px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.notice-time { margin-top: 5px; color: var(--ceru-text-secondary); font-size: 10px; }
.unread-dot { width: 7px; height: 7px; margin-top: 7px; border-radius: 50%; background: var(--ceru-brand); flex: 0 0 auto; }
.empty { padding-top: 90px; text-align: center; color: var(--ceru-text-secondary); }
.empty ion-icon { font-size: 48px; color: var(--ceru-brand); }
.empty h2 { color: var(--ceru-text); font-size: 18px; }
.empty p { font-size: 13px; line-height: 1.55; }
.loading { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 24px; color: var(--ceru-text-secondary); font-size: 12px; }
.load-more { display: flex; justify-content: center; padding: 12px; }
.bottom-space { height: 120px; }
</style>
