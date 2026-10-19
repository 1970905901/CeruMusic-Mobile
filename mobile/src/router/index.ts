import { createRouter, createWebHashHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tabs/discover' },
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('@/views/WelcomePage.vue')
  },
  {
    path: '/tabs',
    component: () => import('@/views/TabsPage.vue'),
    children: [
      { path: '', redirect: '/tabs/discover' },
      {
        path: 'discover',
        name: 'discover',
        component: () => import('@/views/DiscoverPage.vue')
      },
      {
        path: 'search',
        name: 'search',
        component: () => import('@/views/SearchPage.vue')
      },
      {
        path: 'library',
        name: 'library',
        component: () => import('@/views/LibraryPage.vue')
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsPage.vue')
      },
      {
        path: 'plugins',
        name: 'plugins',
        component: () => import('@/views/PluginsPage.vue')
      }
    ]
  },
  {
    path: '/player',
    name: 'player',
    component: () => import('@/views/PlayerPage.vue')
  },
  {
    path: '/playlist/:id',
    name: 'playlist',
    component: () => import('@/views/PlaylistPage.vue')
  },
  {
    path: '/category/:id',
    name: 'category',
    component: () => import('@/views/CategoryPage.vue')
  },
  {
    path: '/downloads',
    name: 'downloads',
    component: () => import('@/views/DownloadsPage.vue')
  },
  {
    path: '/recognize',
    name: 'recognize',
    component: () => import('@/views/RecognizePage.vue')
  },
  {
    path: '/playlist-converter',
    name: 'playlist-converter',
    component: () => import('@/views/PlaylistConverterPage.vue')
  },
  {
    path: '/plugin-surface/:key/:surfaceId',
    name: 'plugin-surface',
    component: () => import('@/views/PluginSurfacePage.vue')
  },
  {
    path: '/plugin/:key',
    name: 'plugin-detail',
    component: () => import('@/views/PluginDetailPage.vue')
  },
  {
    path: '/listen-together',
    name: 'listen-together',
    component: () => import('@/views/ListenTogetherPage.vue')
  },
  {
    path: '/ai',
    name: 'ai-assistant',
    component: () => import('@/views/AIAssistantPage.vue')
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('@/views/AccountPage.vue')
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/views/NotificationsPage.vue')
  },
  {
    path: '/community',
    name: 'community',
    component: () => import('@/views/CommunityPage.vue')
  },
  {
    path: '/community/:id',
    name: 'community-post',
    component: () => import('@/views/CommunityPostPage.vue')
  },
  {
    path: '/shared/song/:id',
    name: 'shared-song',
    component: () => import('@/views/SharedSongPage.vue')
  },
  {
    path: '/shared/playlist/:id',
    name: 'shared-playlist',
    component: () => import('@/views/SharedPlaylistPage.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/tabs/discover'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
