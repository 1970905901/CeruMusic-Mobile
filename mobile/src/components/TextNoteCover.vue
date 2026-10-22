<template>
  <div class="text-note-cover" :class="layout" :style="{ ...cssVars, fontFamily }">
    <span class="note-decoration" aria-hidden="true">{{ layout === 'quote' ? '“' : '♪' }}</span>
    <span class="note-eyebrow" aria-hidden="true"><i /> 音乐随记</span>
    <div class="note-writing">
      <p>{{ text }}</p>
    </div>
    <div class="note-signature" aria-hidden="true"><i /> 随心，随乐。</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 无图帖子的文字封面，对齐桌面端 `community/TextNoteCover.vue`。
 * 版式、配色与种子规则来自 `services/noteCover.ts`；字体只用系统手写体候选，
 * 不带桌面端那 17 MB 的中文字体包。
 */
import { computed } from 'vue'
import { noteCoverStyle, noteExcerpt } from '@/services/noteCover'

const props = defineProps<{ seed: string; content: string }>()

const style = computed(() => noteCoverStyle(props.seed))
const layout = computed(() => style.value.layout)
const cssVars = computed(() => style.value.cssVars)
const fontFamily = computed(() => style.value.fontFamily)
const text = computed(() => noteExcerpt(props.content))
</script>

<style scoped>
.text-note-cover {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 170px;
  padding: 18px 20px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 12px;
  color: var(--note-ink);
  background:
    radial-gradient(ellipse at var(--note-x) var(--note-y), var(--note-wash), transparent 72%),
    linear-gradient(var(--note-angle), var(--note-paper) 20%, var(--note-accent));
}
/* 纸张颗粒：与桌面版同一张噪点图，几乎不占体积。 */
.text-note-cover::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.2;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23000' filter='url(%23n)' opacity='.28' d='M0 0h160v160H0z'/%3E%3C/svg%3E");
  pointer-events: none;
}
.note-eyebrow,
.note-signature {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.65;
  font-size: 10px;
  letter-spacing: 2px;
}
.note-eyebrow i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.note-writing {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 16px 0;
  min-height: 0;
}
.note-writing p {
  margin: 0;
  font-size: 22px;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 1px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.note-signature {
  justify-content: flex-end;
  font-size: 9px;
}
.note-signature i {
  width: 26px;
  height: 1px;
  background: currentColor;
}
.note-decoration {
  position: absolute;
  pointer-events: none;
  font-family: Georgia, serif;
}
.journal {
  background:
    repeating-linear-gradient(
      transparent 0 28px,
      color-mix(in srgb, var(--note-ink) 10%, transparent) 28px 29px
    ),
    linear-gradient(var(--note-angle), var(--note-paper), var(--note-wash));
}
.journal::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 12px;
  border-left: 1px solid color-mix(in srgb, var(--note-ink) 15%, transparent);
  pointer-events: none;
}
.journal .note-decoration {
  right: 16px;
  top: 11px;
  font-size: 22px;
  opacity: 0.3;
  transform: rotate(12deg);
}
.journal .note-writing p {
  font-size: 21px;
  line-height: 29px;
}
.letter {
  align-items: center;
  text-align: center;
  padding-top: 24px;
}
.letter .note-decoration {
  top: -8px;
  left: calc(50% - 24px);
  width: 48px;
  height: 23px;
  background: #fff7;
  transform: rotate(-7deg);
  font-size: 0;
}
.letter .note-writing {
  justify-content: center;
}
.letter .note-eyebrow i {
  display: none;
}
.letter .note-signature {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--note-ink) 25%, transparent);
}
.letter .note-signature i {
  display: none;
}
.quote .note-decoration {
  top: 28px;
  left: 12px;
  font-size: 84px;
  line-height: 1;
  opacity: 0.16;
}
.quote .note-writing {
  padding: 30px 0 18px 12px;
}
.quote .note-writing p {
  font-size: 24px;
}
.quote .note-eyebrow {
  margin-left: auto;
}
.quote .note-signature {
  justify-content: flex-start;
  margin-left: 12px;
}
.postcard {
  padding: 22px;
  border: 5px solid var(--note-paper);
}
.postcard .note-decoration {
  right: 12px;
  top: 10px;
  display: grid;
  place-items: center;
  border: 1px dashed currentColor;
  width: 26px;
  height: 33px;
  font-size: 19px;
  opacity: 0.45;
  transform: rotate(8deg);
}
.postcard .note-eyebrow {
  max-width: calc(100% - 32px);
}
.postcard .note-writing {
  padding-top: 24px;
}
.postcard .note-writing p {
  font-size: 21px;
}
.postcard .note-signature {
  border-top: 1px solid color-mix(in srgb, var(--note-ink) 20%, transparent);
  padding-top: 10px;
}
</style>
