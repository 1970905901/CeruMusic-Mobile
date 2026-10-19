<template>
  <div class="ceru-empty">
    <slot name="icon">
      <ion-icon :icon="icon" />
    </slot>
    <div class="empty-title">{{ title }}</div>
    <div v-if="description" class="empty-desc">{{ description }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { musicalNotesOutline } from 'ionicons/icons'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: string
  }>(),
  { icon: musicalNotesOutline }
)
</script>

<style scoped>
.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ceru-text);
}
.empty-desc {
  max-width: 300px;
  line-height: 1.55;
  font-size: 13px;
}
</style>
