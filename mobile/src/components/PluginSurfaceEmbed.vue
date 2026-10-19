<template>
  <section class="plugin-surface-embed">
    <header v-if="surface.kind === 'web'" class="embed-head">
      <span class="embed-title">{{ surface.title || record.manifest.name }}</span>
      <small>{{ record.manifest.name }}</small>
    </header>
    <PluginWebSurface
      v-if="surface.kind === 'web'"
      :record="record"
      :surface="surface"
      embedded
      @error="error = $event"
    />
    <PluginNativeSurface
      v-else-if="surface.kind === 'native'"
      :record="record"
      :surface="surface"
      embedded
    />
    <PluginSchemaSurface
      v-else-if="surface.kind === 'schema'"
      :record="record"
      :surface="surface"
      embedded
    />
    <div v-else class="embed-error">不支持的插件界面类型</div>
    <p v-if="error" class="embed-error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import PluginWebSurface from '@/components/PluginWebSurface.vue'
import PluginNativeSurface from '@/components/PluginNativeSurface.vue'
import PluginSchemaSurface from '@/components/PluginSchemaSurface.vue'

defineProps<{
  record: PluginRecord
  surface: SurfaceDeclaration
}>()

const error = ref('')
</script>

<style scoped>
.plugin-surface-embed {
  margin-top: 12px;
  min-width: 0;
}
.embed-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px 7px;
}
.embed-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ceru-text);
  font-size: 12px;
  font-weight: 700;
}
.embed-head small {
  flex: 0 0 auto;
  color: var(--ceru-text-secondary);
  font-size: 9px;
}
.embed-error {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 11px;
  line-height: 1.5;
}
</style>
