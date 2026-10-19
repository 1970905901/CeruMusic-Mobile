<template>
  <div
    class="cover"
    :class="{ round }"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: round ? '50%' : `${radius}px` }"
  >
    <img v-if="src && !failed" :src="src" :alt="alt" loading="lazy" @error="failed = true" />
    <div v-else class="fallback">
      <ion-icon :icon="musicalNotes" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IonIcon } from '@ionic/vue'
import { musicalNotes } from 'ionicons/icons'

const props = withDefaults(
  defineProps<{
    src?: string
    alt?: string
    size?: number
    radius?: number
    round?: boolean
  }>(),
  {
    alt: '',
    size: 52,
    radius: 12,
    round: false
  }
)
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  }
)
</script>

<style scoped>
.cover {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  background: linear-gradient(135deg, rgba(0, 218, 192, 0.26), rgba(80, 120, 255, 0.18));
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.88);
  font-size: 22px;
}
</style>
