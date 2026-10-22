<template>
  <div class="consent">
    <!-- 已承诺：折叠成一行，可随时撤回重新查看 -->
    <div v-if="record" class="consent-collapsed">
      <span class="check-icon" aria-hidden="true">✓</span>
      <span class="collapsed-text">已于 <strong>{{ dateText }}</strong> 完成合规承诺</span>
      <button type="button" class="link" @click="revoke">重新查看 / 撤回</button>
    </div>

    <!-- 未承诺：三条逐项确认 -->
    <div v-else class="consent-expanded">
      <div class="consent-header">
        <span aria-hidden="true">⚠</span>
        <strong>分享前请逐条确认</strong>
      </div>
      <label v-for="(item, index) in CONSENT_ITEMS" :key="item" class="consent-item">
        <ion-checkbox
          :checked="checks[index]"
          @ionChange="toggle(index, $event.detail.checked)"
        />
        <span>{{ item }}</span>
      </label>
      <button type="button" class="link" @click="openLegal">查看完整侵权风险与免责声明</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 分享前的合规承诺，桌面版 `Share/ShareConsentBar.vue` 的移动端等价实现。
 *
 * 三项逐条勾选，全部勾选后写入带版本的时间戳记录并折叠；条款版本升级、
 * 记录损坏或时间异常时自动回到「重新确认」状态（`services/shareConsent.ts`）。
 * 歌曲分享与歌单分享共用本组件，避免两处各写一份承诺文案。
 */
import { computed, onMounted, ref } from 'vue'
import { IonCheckbox } from '@ionic/vue'
import { Browser } from '@capacitor/browser'
import {
  CONSENT_ITEMS,
  CONSENT_STORAGE_KEY,
  LEGAL_DOC_URL,
  buildConsentRecord,
  consentComplete,
  formatConsentDate,
  readConsentRecord,
  type ConsentRecord
} from '@/services/shareConsent'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const record = ref<ConsentRecord | null>(null)
const checks = ref<boolean[]>(CONSENT_ITEMS.map(() => false))

const dateText = computed(() => (record.value ? formatConsentDate(record.value.timestamp) : ''))

function emitConsent(value: boolean): void {
  if (props.modelValue !== value) emit('update:modelValue', value)
}

function load(): void {
  record.value = readConsentRecord(localStorage.getItem(CONSENT_STORAGE_KEY))
  emitConsent(Boolean(record.value))
}

function toggle(index: number, checked: boolean): void {
  const next = [...checks.value]
  next[index] = checked
  checks.value = next
  if (!consentComplete(next)) return
  const created = buildConsentRecord()
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(created))
  } catch {
    // 存储不可用时仍允许本次分享，只是下次需要重新确认。
  }
  record.value = created
  emitConsent(true)
}

/** 撤回：清掉记录并要求重新逐条确认，同时把分享按钮重新置灰。 */
function revoke(): void {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
  record.value = null
  checks.value = CONSENT_ITEMS.map(() => false)
  emitConsent(false)
}

async function openLegal(): Promise<void> {
  try {
    await Browser.open({ url: LEGAL_DOC_URL })
  } catch {
    // 没有系统浏览器时静默忽略：承诺本身不依赖这一跳转。
  }
}

onMounted(load)
</script>

<style scoped>
.consent {
  margin: 12px 0;
}
.consent-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.05));
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.check-icon {
  color: var(--ceru-brand);
  font-weight: 700;
}
.collapsed-text strong {
  color: var(--ceru-text);
}
.consent-expanded {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--ceru-border);
  background: var(--ceru-card-bg, rgba(255, 255, 255, 0.04));
}
.consent-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--ceru-text);
}
.consent-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ceru-text-secondary);
}
.link {
  display: block;
  margin-top: 6px;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--ceru-brand);
  font-size: 12px;
  font-weight: 600;
}
</style>
