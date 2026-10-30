<template>
  <article class="notice-card" :class="{ unread: !message.read }">
    <header>
      <span class="notice-source">{{ message.kind === 'moderation' ? '社区管理' : '澜音官方' }}</span>
      <time>{{ formatTime(message.createdAt) }}</time>
    </header>

    <button type="button" class="notice-title" @click="$emit('open')">
      {{ message.title }}
    </button>

    <div
      class="notice-body"
      :class="{ clipped: collapsible && !expanded }"
      :style="{ maxHeight: collapsible && !expanded ? `${limit}px` : undefined }"
    >
      <template v-if="message.format === 'plain'">
        <p class="plain">{{ message.content }}</p>
      </template>
      <template v-else-if="message.format === 'iframe'">
        <button v-if="embedHref" type="button" class="embed-link" @click="$emit('open')">
          打开网页内容
        </button>
        <p v-else class="plain">网页地址不可用</p>
      </template>
      <template v-else>
        <template v-for="(block, index) in blocks" :key="index">
          <h4 v-if="block.type === 'heading'" class="md-heading">
            <InlineText :segments="block.segments" @link="$emit('open-link', $event)" />
          </h4>
          <p v-else-if="block.type === 'bullet'" class="md-bullet">
            <span class="bullet-dot">•</span>
            <InlineText :segments="block.segments" @link="$emit('open-link', $event)" />
          </p>
          <p v-else class="md-paragraph">
            <InlineText :segments="block.segments" @link="$emit('open-link', $event)" />
          </p>
        </template>
      </template>
    </div>

    <button
      v-if="collapsible"
      type="button"
      class="expand"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起内容 ↑' : '展开全文 ↓' }}
    </button>

    <button v-if="message.postId" type="button" class="view-post" @click="$emit('open')">
      {{ message.postId ? '查看笔记 →' : '' }}
    </button>
  </article>
</template>

<script setup lang="ts">
/**
 * 官方通知卡片，对齐桌面版 `notifications/NoticeCard.vue`。
 *
 * 桌面版用 marked + DOMPurify 渲染 markdown（`v-html`）；移动端没有这两个依赖，
 * 改为把正文解析成块与行内片段后由模板插值渲染——不生成 HTML 字符串，
 * 因此没有 XSS 面，链接也只放行 http(s)（`services/noticeContent.ts`）。
 * `iframe` 类型的通知在移动端不内嵌第三方页面：WebView 里嵌一个不能滚动、
 * 不能跳转的外部页体验很差，这里只给「打开网页内容」的入口。
 */
import { computed, ref, watch } from 'vue'
import InlineText from '@/components/InlineText.vue'
import {
  noticeNeedsExpand,
  parseNoticeBlocks,
  safeHref
} from '@/services/noticeContent'
import { formatDateTime } from '@/services/dateTimeFormat'
import type { InboxMessage } from '@/services/notificationsApi'

const props = defineProps<{ message: InboxMessage }>()
defineEmits<{ open: []; 'open-link': [href: string] }>()

const expanded = ref(false)

const blocks = computed(() =>
  props.message.format === 'markdown' ? parseNoticeBlocks(props.message.content) : []
)
const collapsible = computed(() => props.message.format === 'markdown' && noticeNeedsExpand(blocks.value))
const embedHref = computed(() => safeHref(props.message.embedUrl ?? ''))

/** `maxHeight` 是服务端给的上限（100–600），移动端再压一点以适配窄屏。 */
const limit = computed(() => Math.max(100, Math.min(props.message.maxHeight || 180, 320)))

watch(
  () => props.message.id,
  () => {
    expanded.value = false
  }
)

/**
 * 官方通知卡的时间，与互动消息行共用 `services/dateTimeFormat`，
 * 避免同一列表里出现两种写法。解析失败返回空串，调用方隐藏整行。
 */
function formatTime(value: string): string {
  return formatDateTime(value)
}

defineExpose({ limit })
</script>

<style scoped>
.notice-card {
  padding: 14px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.04));
}
.notice-card.unread {
  border-color: color-mix(in srgb, var(--ceru-brand) 38%, transparent);
}
header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--ceru-text-secondary);
  margin-bottom: 8px;
}
.notice-source {
  color: var(--ceru-brand);
  font-weight: 600;
}
.notice-title {
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  font-size: 15px;
  font-weight: 650;
  text-align: left;
  padding: 0;
}
.notice-body {
  margin-top: 8px;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.55;
  overflow: hidden;
}
.notice-body.clipped {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
}
.plain,
.md-paragraph {
  margin: 0 0 8px;
  white-space: pre-wrap;
}
.md-heading {
  margin: 10px 0 6px;
  color: var(--ceru-text);
  font-size: 14px;
  font-weight: 650;
}
.md-bullet {
  display: flex;
  gap: 8px;
  margin: 0 0 6px;
}
.bullet-dot {
  color: var(--ceru-brand);
  flex: 0 0 auto;
}
.embed-link {
  border: 1px solid var(--ceru-border);
  background: var(--ceru-bg-elevated);
  color: var(--ceru-brand);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
}
.expand,
.view-post {
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 12px;
  font-weight: 600;
  padding: 0;
}
.view-post {
  display: block;
  margin-top: 8px;
}
</style>
