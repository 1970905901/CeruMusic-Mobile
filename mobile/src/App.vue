<template>
  <ion-app>
    <ion-router-outlet />
    <PluginProgressOverlay />
    <ShareSongSheet />
    <PluginStyleHost />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import PluginProgressOverlay from '@/components/PluginProgressOverlay.vue'
import ShareSongSheet from '@/components/ShareSongSheet.vue'
import PluginStyleHost from '@/components/PluginStyleHost.vue'
</script>
