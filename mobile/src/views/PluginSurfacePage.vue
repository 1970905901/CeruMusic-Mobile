<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="backHref" text="" />
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" :scroll-y="kind !== 'web'" class="surface-content" :class="{ full: kind === 'web' }">
      <div v-if="displayError" class="surface-error ceru-pad">
        <ion-icon :icon="alertCircleOutline" />
        <h2>插件页面不可用</h2>
        <p>{{ displayError }}</p>
        <ion-button fill="outline" @click="$router.replace('/tabs/plugins')">返回插件管理</ion-button>
      </div>

      <PluginWebSurface
        v-else-if="record && surface && kind === 'web'"
        :record="record"
        :surface="surface"
        @close="goBack"
        @error="loadError = $event"
      />
      <PluginNativeSurface
        v-else-if="record && surface && kind === 'native'"
        :record="record"
        :surface="surface"
      />
      <PluginSchemaSurface
        v-else-if="record && surface && kind === 'schema'"
        :record="record"
        :surface="surface"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
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
  useIonRouter
} from '@ionic/vue'
import { alertCircleOutline } from 'ionicons/icons'
import PluginWebSurface from '@/components/PluginWebSurface.vue'
import PluginNativeSurface from '@/components/PluginNativeSurface.vue'
import PluginSchemaSurface from '@/components/PluginSchemaSurface.vue'
import { getPluginSurface } from '@/services/pluginSurface'
import { usePluginStore } from '@/stores/plugins'

const route = useRoute()
const router = useIonRouter()
const pluginStore = usePluginStore()
const loadError = ref('')

const pluginKey = String(route.params.key || '')
const surfaceId = String(route.params.surfaceId || '')
const record = computed(() => pluginStore.plugins.find((item) => item.key === pluginKey))
const surface = computed(() => (record.value ? getPluginSurface(record.value.manifest, surfaceId) : undefined))
const kind = computed(() => surface.value?.kind || '')
const title = computed(
  () =>
    surface.value?.title ||
    record.value?.manifest.contributes?.commands?.find((item) => item.view === surfaceId)?.title ||
    record.value?.manifest.name ||
    '插件页面'
)
const displayError = computed(
  () =>
    loadError.value ||
    (!record.value
      ? '插件不存在或尚未启用'
      : !surface.value
        ? '插件未声明此页面'
        : '')
)

const backHref = computed(
  () => '/plugin/' + encodeURIComponent(pluginKey)
)

function goBack() {
  router.back()
}
</script>

<style scoped>
.surface-content {
  --background: var(--ceru-bg);
}
.surface-content.full {
  --overflow: hidden;
  position: relative;
}
.surface-error {
  padding-top: 120px;
  text-align: center;
  color: var(--ceru-text-secondary);
}
.surface-error ion-icon {
  font-size: 50px;
  color: var(--ceru-danger);
}
.surface-error h2 {
  color: var(--ceru-text);
}
.surface-error p {
  max-width: 340px;
  margin: 10px auto 18px;
  font-size: 12px;
  line-height: 1.6;
}
</style>
