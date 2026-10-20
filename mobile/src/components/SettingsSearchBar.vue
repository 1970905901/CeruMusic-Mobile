<template>
  <div class="settings-search">
    <ion-searchbar
      ref="searchbarRef"
      class="search-bar"
      v-model="query"
      placeholder="搜索设置"
      :debounce="0"
      :animated="false"
      show-clear-button="focus"
      @ionInput="onInput"
      @ionFocus="onFocus"
      @ionBlur="onBlur"
      @ionClear="onClear"
      @keydown="onKeydown"
    />

    <div v-if="panelOpen" class="search-panel">
      <p v-if="showRecent" class="panel-header">最近使用</p>
      <button
        v-for="(item, index) in displayItems"
        :key="item.id + '|' + item.title"
        type="button"
        class="search-row"
        :class="{ active: index === activeIndex }"
        @mousedown.prevent
        @click="selectItem(item)"
      >
        <ion-icon class="row-icon" :icon="showRecent ? timeOutline : searchOutline" />
        <span class="row-text">
          <span class="row-title">{{ item.title }}</span>
          <span class="row-sub">{{ item.description || item.category }}</span>
        </span>
        <ion-icon class="row-chevron" :icon="chevronForwardOutline" />
      </button>
      <p v-if="!displayItems.length" class="panel-empty">{{ emptyHint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { IonIcon, IonSearchbar } from '@ionic/vue'
import { chevronForwardOutline, searchOutline, timeOutline } from 'ionicons/icons'
import {
  normalizeRecentSearches,
  pushRecentSearch,
  searchSettings,
  settingsSearchItems,
  type SettingsSearchItem
} from '@/services/settingsSearch'

const emit = defineEmits<{ select: [item: SettingsSearchItem] }>()

const STORAGE_KEY = 'ceru-mobile-settings-recent-searches-v1'
const BLUR_CLOSE_DELAY_MS = 180
const MAX_RESULTS = 20

/**
 * Ionic 搜索框的 `getInputElement` 不在 Vue 组件的公开实例类型上，
 * 且模板 ref 在不同封装下可能是自定义元素本身或其 `$el`，故统一按自定义元素处理。
 */
interface IonSearchbarElement extends HTMLElement {
  getInputElement?: () => Promise<HTMLInputElement>
}

const searchbarRef = ref<unknown>(null)
const query = ref('')
/**
 * 面板显隐独立于「输入框是否聚焦」：ionFocus 在某些平台/封装下不一定触发，
 * 因此输入时也主动打开；失焦后统一关闭，避免查询词非空时遮挡页面。
 */
const panelVisible = ref(false)
const activeIndex = ref(-1)
const recentIds = ref<string[]>([])
let blurTimer: ReturnType<typeof setTimeout> | null = null

const trimmed = computed(() => query.value.trim())
const showRecent = computed(() => !trimmed.value)
const displayItems = computed(() => {
  if (showRecent.value) return itemsById(recentIds.value)
  return searchSettings(trimmed.value).slice(0, MAX_RESULTS)
})
const panelOpen = computed(() => panelVisible.value)
const emptyHint = computed(() =>
  showRecent.value ? '输入关键词开始搜索' : '未找到相关设置'
)

function itemsById(ids: string[]): SettingsSearchItem[] {
  return ids
    .map((id) => settingsSearchItems.find((item) => item.id === id))
    .filter((item): item is SettingsSearchItem => !!item)
}

onMounted(() => {
  try {
    recentIds.value = normalizeRecentSearches(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    // 记录损坏时退化为空列表，搜索本身不受影响。
    recentIds.value = []
  }
})

function persistRecent(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // 忽略配额或序列化异常，最近使用只是便利功能。
  }
}

function onFocus() {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = null
  panelVisible.value = true
}

/** 延迟关闭：点击结果行时会先触发 blur，留出时间让 click 落到按钮上。 */
function onBlur() {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    blurTimer = null
    panelVisible.value = false
    activeIndex.value = -1
  }, BLUR_CLOSE_DELAY_MS)
}

function onInput() {
  activeIndex.value = -1
  onFocus()
}

function onClear() {
  activeIndex.value = -1
  onFocus()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    panelVisible.value = false
    activeIndex.value = -1
    return
  }
  const items = displayItems.value
  if (!items.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % items.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + items.length) % items.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const index = activeIndex.value >= 0 && activeIndex.value < items.length ? activeIndex.value : 0
    selectItem(items[index])
  }
}

/** 取出搜索框的自定义元素本身：Vue 封装实例需要经过 $el。 */
function searchbarElement(): IonSearchbarElement | null {
  const raw: unknown = searchbarRef.value
  if (!raw) return null
  if (raw instanceof HTMLElement) return raw as IonSearchbarElement
  const element = (raw as { $el?: unknown }).$el
  return element instanceof HTMLElement ? (element as IonSearchbarElement) : null
}

function selectItem(item: SettingsSearchItem) {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = null
  recentIds.value = pushRecentSearch(recentIds.value, item.id)
  persistRecent(recentIds.value)
  query.value = ''
  activeIndex.value = -1
  panelVisible.value = false
  // 收起键盘：Ionic 的搜索框方法只在原生元素可用时存在。
  void searchbarElement()
    ?.getInputElement?.()
    .then((input) => input?.blur())
    .catch(() => undefined)
  emit('select', item)
}
</script>

<style scoped>
.settings-search {
  position: relative;
  margin-top: 14px;
}
.search-bar {
  padding: 0;
  --background: var(--ceru-bg-elevated);
  --border-radius: 16px;
  --box-shadow: none;
  --color: var(--ceru-text);
  --placeholder-color: var(--ceru-text-secondary);
  --icon-color: var(--ceru-text-secondary);
  border: 1px solid var(--ceru-border);
  border-radius: 16px;
  overflow: hidden;
}
.search-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 30;
  margin-top: 6px;
  max-height: 56vh;
  overflow-y: auto;
  background: var(--ceru-bg-elevated);
  border: 1px solid var(--ceru-border);
  border-radius: var(--ceru-card-radius);
  box-shadow: var(--ceru-shadow);
}
.panel-header {
  margin: 0;
  padding: 10px 14px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ceru-text-secondary);
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  text-align: left;
}
.search-row.active {
  background: var(--ceru-bg-soft);
}
.row-icon,
.row-chevron {
  color: var(--ceru-text-secondary);
  flex: none;
}
.row-chevron {
  font-size: 14px;
  opacity: 0.6;
}
.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.row-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-sub {
  font-size: 12px;
  color: var(--ceru-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-empty {
  margin: 0;
  padding: 18px 14px;
  text-align: center;
  font-size: 13px;
  color: var(--ceru-text-secondary);
}
</style>
