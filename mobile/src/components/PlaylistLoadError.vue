<template>
  <div class="load-error ceru-card" :class="{ compact: hasItems }" role="status" aria-live="polite">
    <div class="error-icon">
      <ion-icon :icon="alertCircleOutline" />
    </div>
    <div class="error-copy">
      <strong>{{ hasItems ? '暂时无法加载更多歌曲' : '暂时无法加载这张歌单' }}</strong>
      <p>{{ message }}</p>
    </div>
    <ion-button fill="outline" size="small" :disabled="retrying" @click="$emit('retry')">
      <ion-spinner v-if="retrying" name="crescent" slot="start" />
      {{ retrying ? '重新加载中' : '重新加载' }}
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonSpinner } from '@ionic/vue'
import { alertCircleOutline } from 'ionicons/icons'

withDefaults(
  defineProps<{
    message: string
    /** 已经拿到一部分歌曲、后续分页失败：提示与布局都收敛成一条，不遮挡已有内容。 */
    hasItems?: boolean
    retrying?: boolean
  }>(),
  { hasItems: false, retrying: false }
)

defineEmits<{ retry: [] }>()
</script>

<style scoped>
.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin: 18px 8px 0;
  padding: 26px 20px;
  text-align: center;
}
.error-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--ceru-bg-soft);
  color: var(--ceru-text-secondary);
  font-size: 26px;
}
.error-copy strong {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: var(--ceru-text);
}
.error-copy p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ceru-text-secondary);
  overflow-wrap: anywhere;
}
/* 已有歌曲时错误不该占掉半屏：改成一行提示 + 按钮，列表继续可读。 */
.compact {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
}
.compact .error-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  font-size: 18px;
  flex-shrink: 0;
}
.compact .error-copy {
  flex: 1;
  min-width: 0;
}
.compact .error-copy strong {
  font-size: 13px;
}
.compact .error-copy p {
  margin-top: 2px;
  font-size: 12px;
}
.compact ion-button {
  flex-shrink: 0;
}
</style>
