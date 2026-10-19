<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <div v-if="player.currentTrack && !isFullPlayer" class="mini-host">
        <MiniPlayer />
      </div>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="discover" href="/tabs/discover">
        <ion-icon :icon="compassOutline" />
        <ion-label>发现</ion-label>
      </ion-tab-button>
        <ion-tab-button tab="search" href="/tabs/search">
        <ion-icon :icon="searchOutline" />
        <ion-label>搜索</ion-label>
      </ion-tab-button>
        <ion-tab-button tab="library" href="/tabs/library">
        <ion-icon :icon="libraryOutline" />
        <ion-label>音乐库</ion-label>
      </ion-tab-button>
        <ion-tab-button tab="settings" href="/tabs/settings">
        <ion-icon :icon="settingsOutline" />
        <ion-label>设置</ion-label>
      </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue'
import { compassOutline, libraryOutline, searchOutline, settingsOutline } from 'ionicons/icons'
import { useRoute } from 'vue-router'
import MiniPlayer from '@/components/MiniPlayer.vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()
const route = useRoute()
const isFullPlayer = computed(() => route.path === '/player')
</script>

<style scoped>
.mini-host {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: calc(58px + env(safe-area-inset-bottom));
  z-index: 40;
}
html.md .mini-host {
  bottom: calc(66px + env(safe-area-inset-bottom));
}
</style>
