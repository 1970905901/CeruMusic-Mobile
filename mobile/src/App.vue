<template>
  <ion-app>
    <ion-router-outlet />
    <PluginProgressOverlay />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import PluginProgressOverlay from '@/components/PluginProgressOverlay.vue'
</script>
