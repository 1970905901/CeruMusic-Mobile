<template>
  <div class="section-header">
    <div>
      <h2 class="ceru-section-title">{{ title }}</h2>
      <p v-if="subtitle" class="ceru-section-subtitle">{{ subtitle }}</p>
    </div>
    <button v-if="action" class="action" type="button" @click="$emit('action')">
      {{ action }}
      <ion-icon :icon="chevronForward" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { chevronForward } from 'ionicons/icons'

defineProps<{ title: string; subtitle?: string; action?: string }>()
defineEmits<{ action: [] }>()
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  margin: 24px 0 10px;
}
.action {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
