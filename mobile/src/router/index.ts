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
    path: '/plugin/:key',
    name: 'plugin-detail',
    component: () => import('@/views/PluginDetailPage.vue')
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
