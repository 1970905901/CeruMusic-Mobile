<template>
  <span class="inline-text">
    <template v-for="(segment, index) in segments" :key="index">
      <strong v-if="segment.kind === 'bold'">{{ segment.text }}</strong>
      <em v-else-if="segment.kind === 'italic'">{{ segment.text }}</em>
      <code v-else-if="segment.kind === 'code'">{{ segment.text }}</code>
      <button
        v-else-if="segment.kind === 'link' && segment.href"
        type="button"
        class="inline-link"
        @click="$emit('link', segment.href as string)"
      >
        {{ segment.text }}
      </button>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
/**
 * 行内片段的渲染：粗体 / 斜体 / 行内代码 / 链接。
 *
 * 只有一个职责——**永远插值文本，不 v-html**。链接渲染成按钮而不是 `<a>`：
 * 点击后交给宿主决定用系统浏览器打开，避免在 WebView 里把通知页整页顶掉。
 */
import type { InlineSegment } from '@/services/noticeContent'

defineProps<{ segments: readonly InlineSegment[] }>()
defineEmits<{ link: [href: string] }>()
</script>

<style scoped>
strong {
  color: var(--ceru-text);
  font-weight: 650;
}
code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--ceru-bg-elevated);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}
.inline-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--ceru-brand);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
