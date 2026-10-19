<template>
  <div class="schema-surface" :class="{ embedded }">
    <div v-if="error" class="schema-error">
      <span>{{ error }}</span>
      <button type="button" @click="loadSchema">重试</button>
    </div>

    <div v-if="loading && !schema" class="schema-loading">
      <ion-spinner name="crescent" /> 正在加载插件表单…
    </div>

    <template v-else-if="schema">
      <div class="schema-head ceru-pad">
        <h2>{{ schema.root.title }}</h2>
        <p v-if="schema.presentation.openOnFirstUse">完成以下设置后即可使用插件功能。</p>
      </div>

      <ion-list class="schema-list">
        <template v-for="(field, index) in schema.root.children" :key="index">
          <ion-item v-if="field.type === 'text'" class="text-field">
            <ion-label class="ion-text-wrap">
              <h2 v-if="field.label">{{ field.label }}</h2>
              <p v-if="field.description" class="field-description">{{ field.description }}</p>
            </ion-label>
          </ion-item>

          <ion-item v-else-if="field.type === 'button'">
            <ion-button
              expand="block"
              :fill="field.requires ? 'outline' : 'solid'"
              :disabled="busy || (!!field.requires && !values[field.requires])"
              @click="runButton(field)"
            >
              {{ field.label }}
            </ion-button>
          </ion-item>

          <ion-item v-else>
            <ion-label position="stacked">
              {{ field.label || field.bind }}
              <span v-if="field.required" class="required">*</span>
              <p v-if="field.description" class="field-description">{{ field.description }}</p>
            </ion-label>

            <ion-toggle
              v-if="field.type === 'toggle'"
              :checked="!!values[field.bind]"
              @ionChange="values[field.bind] = $event.detail.checked"
            />
            <ion-select
              v-else-if="field.type === 'select'"
              :value="values[field.bind]"
              interface="action-sheet"
              cancel-text="取消"
              @ionChange="values[field.bind] = $event.detail.value"
            >
              <ion-select-option
                v-for="option in field.options || []"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </ion-select-option>
            </ion-select>
            <ion-input
              v-else
              :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
              :value="values[field.bind]"
              :placeholder="field.placeholder || ''"
              @ionInput="setValue(field, $event.detail.value)"
            />
          </ion-item>
        </template>
      </ion-list>

      <div class="schema-actions">
        <ion-button expand="block" :disabled="busy" @click="submit">
          {{ busy ? '提交中…' : schema.root.submitLabel || '保存' }}
        </ion-button>
      </div>
      <p class="schema-note">表单由插件声明，凭据只会发送给该插件。</p>
      <div class="bottom-space" />
    </template>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToggle,
  toastController
} from '@ionic/vue'
import type { PluginRecord } from '@/types/plugin'
import type { SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import { readPluginSchemaResource } from '@/services/pluginSurface'
import { pluginRuntimeManager } from '@/services/plugin/runtime'
import { usePluginStore } from '@/stores/plugins'

interface SchemaField {
  type: 'text-input' | 'password' | 'number' | 'toggle' | 'select' | 'text'
  bind: string
  label?: string
  placeholder?: string
  description?: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
}
interface SchemaButton {
  type: 'button'
  label: string
  action: string
  input?: Record<string, any>
  requires?: string
}
interface DrawerSchema {
  schemaVersion: '1.0'
  presentation: {
    openAction?: string
    closeAction?: string
    openOnFirstUse?: boolean
  }
  root: {
    type: 'form'
    title: string
    submitAction: string
    submitLabel?: string
    submitInput?: Record<string, any>
    children: Array<SchemaField | SchemaButton>
  }
}

const props = defineProps<{
  record: PluginRecord
  surface: SurfaceDeclaration
  embedded?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const pluginStore = usePluginStore()
const schema = ref<DrawerSchema | null>(null)
const values = reactive<Record<string, any>>({})
const loading = ref(false)
const busy = ref(false)
const error = ref('')
let opened = false
let closed = false
let disposed = false
let unsubscribe: (() => void) | undefined

function validateSchema(value: any): DrawerSchema {
  if (!value || typeof value !== 'object' || value.schemaVersion !== '1.0') {
    throw new Error('插件表单配置无效')
  }
  const root = value.root
  if (!root || root.type !== 'form' || !Array.isArray(root.children)) {
    throw new Error('插件表单结构无效')
  }
  if (JSON.stringify(value).length > 64 * 1024) throw new Error('插件表单过大')
  return value as DrawerSchema
}

function loadValues(state: Record<string, any>) {
  for (const field of schema.value?.root.children || []) {
    if (field.type === 'button' || field.type === 'text') continue
    values[field.bind] = state?.[field.bind] ?? (field.type === 'toggle' ? false : '')
  }
}

function loadSchema() {
  loading.value = true
  error.value = ''
  try {
    schema.value = validateSchema(readPluginSchemaResource(props.record, props.surface.id))
    loadValues(pluginRuntimeManager.getSurfaceState(props.record.key, props.surface.id))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '插件表单加载失败'
  } finally {
    loading.value = false
  }
}

function setValue(field: SchemaField, value: any) {
  values[field.bind] = field.type === 'number' ? Number(value) : String(value ?? '')
}

function buildInput(button?: SchemaButton): Record<string, any> {
  const input: Record<string, any> = {}
  for (const field of schema.value?.root.children || []) {
    if (field.type === 'button' || field.type === 'text') continue
    const value = values[field.bind]
    if (field.required && (value === undefined || value === null || String(value).trim() === '')) {
      throw new Error('请填写' + (field.label || field.bind))
    }
    if (value === undefined) continue
    if (field.type === 'number' && !Number.isFinite(value)) {
      throw new Error((field.label || field.bind) + '必须是数字')
    }
    if (field.type === 'select' && !field.options?.some((option) => option.value === value)) {
      throw new Error('请选择有效的' + (field.label || field.bind))
    }
    input[field.bind] = value
  }
  return {
    ...input,
    ...(button ? button.input || {} : schema.value?.root.submitInput || {})
  }
}

async function run(action: string, input: Record<string, any>) {
  if (busy.value || disposed) return
  busy.value = true
  error.value = ''
  try {
    await pluginStore.invokeAction(props.record.key, action, input)
    const state = pluginRuntimeManager.getSurfaceState(props.record.key, props.surface.id)
    if (state && typeof state === 'object') loadValues(state)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败'
    await toast(error.value, 'danger')
  } finally {
    busy.value = false
  }
}

async function runButton(field: SchemaButton) {
  try {
    await run(field.action, buildInput(field))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败'
  }
}

async function submit() {
  if (!schema.value || busy.value) return
  try {
    const input = buildInput()
    await run(schema.value.root.submitAction, input)
    await toast('已保存')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '提交失败'
  }
}

async function closeLifecycle() {
  const action = schema.value?.presentation.closeAction
  if (closed || !action) return
  closed = true
  try {
    await pluginStore.invokeAction(props.record.key, action, {})
  } catch {
    // Page teardown must not be blocked by plugin cleanup.
  }
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}

onMounted(async () => {
  loadSchema()
  unsubscribe = pluginRuntimeManager.onSurfaceState((event) => {
    if (event.pluginKey === props.record.key && event.surfaceId === props.surface.id && !busy.value) {
      loadValues(event.state || {})
    }
  })
  try {
    const action = schema.value?.presentation.openAction
    if (action && !opened) {
      opened = true
      await pluginStore.invokeAction(props.record.key, action, {})
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '插件表单初始化失败'
  }
})

onBeforeUnmount(() => {
  disposed = true
  unsubscribe?.()
  void closeLifecycle()
})
</script>

<style scoped>
.schema-surface {
  min-height: 100%;
  padding-bottom: 40px;
}
.schema-surface.embedded {
  min-height: 0;
  padding-bottom: 0;
  border: 1px solid var(--ceru-border);
  border-radius: var(--ceru-card-radius);
  overflow: hidden;
  background: var(--ceru-bg-elevated);
}
.schema-surface.embedded .schema-head {
  padding-top: 16px;
}
.schema-surface.embedded .schema-head h2 {
  font-size: 19px;
}
.schema-surface.embedded .bottom-space {
  height: 0;
}
.schema-head {
  padding-top: 22px;
}
.schema-head h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.schema-head p {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.schema-list {
  margin-top: 18px;
  --ion-item-background: var(--ceru-bg-elevated);
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
}
.schema-list ion-label h2 {
  font-size: 14px;
  font-weight: 650;
}
.required {
  color: var(--ceru-danger);
  margin-left: 3px;
}
.field-description {
  margin-top: 4px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}
.text-field {
  --min-height: 48px;
}
.schema-actions {
  padding: 20px 16px 0;
}
.schema-note {
  padding: 12px 20px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
  line-height: 1.55;
}
.schema-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 16px;
  padding: 11px 12px;
  border-radius: 10px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 12px;
}
.schema-error button {
  border: 0;
  background: transparent;
  color: var(--ceru-danger);
  font-size: 12px;
}
.schema-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 100px 20px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.bottom-space {
  height: 100px;
}
</style>
