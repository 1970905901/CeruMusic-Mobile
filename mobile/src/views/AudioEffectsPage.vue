<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" text="" />
        </ion-buttons>
        <ion-title>音效</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="resetAll">重置</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <input
        ref="importInput"
        class="file-input"
        type="file"
        accept="application/json,.json"
        @change="onImportFile"
      />
      <div class="fx-head ceru-pad">
        <p class="eyebrow">AUDIO EFFECTS</p>
        <h1 class="ceru-title">均衡器与音效</h1>
        <p class="head-sub">实时处理本机播放的声音，仅影响 Ceru Music，不改变系统音量。</p>
      </div>

      <ion-list v-if="!store.supported" class="group">
        <ion-item>
          <ion-label>
            <h2>当前环境不支持 Web Audio</h2>
            <p>无法启用均衡器与音效。</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <template v-else>
        <ion-list class="group">
          <div class="group-title">均衡器</div>
          <!-- 桌面版 EqualizerSettings 顶部的实时频谱 -->
          <EqSpectrum v-if="state.equalizerEnabled" />
          <ion-item>
            <ion-icon slot="start" :icon="optionsOutline" color="primary" />
            <ion-label>
              <h2>启用均衡器</h2>
              <p>10 段图形均衡器</p>
            </ion-label>
            <ion-toggle :checked="state.equalizerEnabled" @ionChange="onEqualizerEnabled" />
          </ion-item>
          <ion-item>
            <ion-label>预设</ion-label>
            <ion-select
              :value="state.equalizerPreset"
              interface="action-sheet"
              cancel-text="取消"
              @ionChange="onPresetChange"
            >
              <ion-select-option v-for="preset in store.presets" :key="preset.name" :value="preset.name">
                {{ preset.name }}
              </ion-select-option>
              <ion-select-option value="自定义" :disabled="state.equalizerPreset !== EQ_CUSTOM_PRESET">
                自定义
              </ion-select-option>
            </ion-select>
          </ion-item>
          <!-- 桌面版 EqualizerSettings 的预设管理：保存 / 覆盖 / 删除 / 重置 / 导入导出 -->
          <ion-item lines="none" class="preset-actions">
            <div class="preset-actions-row">
              <ion-button size="small" fill="clear" @click="savePresetAs">存为新预设</ion-button>
              <ion-button
                v-if="store.customPresetActive"
                size="small"
                fill="clear"
                @click="overwritePreset"
              >
                保存当前值
              </ion-button>
              <ion-button
                v-if="store.customPresetActive"
                size="small"
                fill="clear"
                color="danger"
                @click="deletePreset"
              >
                删除
              </ion-button>
              <ion-button size="small" fill="clear" @click="resetPreset">重置</ion-button>
            </div>
          </ion-item>
          <ion-item lines="none" class="preset-actions">
            <div class="preset-actions-row">
              <ion-button size="small" fill="clear" @click="exportConfig">导出配置</ion-button>
              <ion-button size="small" fill="clear" @click="importInput?.click()">导入配置</ion-button>
            </div>
          </ion-item>
          <div class="band-list" :class="{ disabled: !state.equalizerEnabled }">
            <div v-for="(freq, index) in frequencies" :key="freq" class="band-row">
              <span class="band-freq">{{ formatFreq(freq) }}</span>
              <ion-range
                :value="state.equalizerGains[index]"
                :min="-12"
                :max="12"
                :step="0.5"
                :disabled="!state.equalizerEnabled"
                @ionInput="onBandInput(index, $event)"
              />
              <span class="band-gain">{{ Number(state.equalizerGains[index]).toFixed(1) }} dB</span>
            </div>
          </div>
        </ion-list>

        <ion-list class="group">
          <div class="group-title">高级音效</div>
          <ion-item>
            <ion-icon slot="start" :icon="volumeHighOutline" color="primary" />
            <ion-label>
              <h2>低音增强</h2>
              <p>{{ state.bassBoost.gain.toFixed(1) }} dB</p>
            </ion-label>
            <ion-toggle :checked="state.bassBoost.enabled" @ionChange="onBassEnabled" />
          </ion-item>
          <ion-item>
            <ion-range
              :value="state.bassBoost.gain"
              :min="-12"
              :max="12"
              :step="0.5"
              :disabled="!state.bassBoost.enabled"
              @ionInput="onBassGain"
            />
          </ion-item>
          <!-- 桌面版AudioEffectSettings 的快捷档位：轻度 3 / 中度 6 / 重度 9 dB -->
          <ion-item>
            <ion-segment
              :value="activeBassPreset"
              :disabled="!state.bassBoost.enabled"
              @ionChange="onBassPreset"
            >
              <ion-segment-button
                v-for="preset in BASS_PRESETS"
                :key="preset.value"
                :value="preset.value"
              >
                <ion-label>{{ preset.label }}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </ion-item>
          <ion-item>
            <ion-label>
              <h2>环绕音效</h2>
              <p>模拟空间混响</p>
            </ion-label>
            <ion-toggle :checked="state.surround.enabled" @ionChange="onSurroundEnabled" />
          </ion-item>
          <ion-item>
            <ion-label>环境</ion-label>
            <ion-select
              :value="state.surround.mode"
              :disabled="!state.surround.enabled"
              interface="action-sheet"
              cancel-text="取消"
              @ionChange="onSurroundMode"
            >
              <ion-select-option value="off">关闭</ion-select-option>
              <ion-select-option value="small">小房间</ion-select-option>
              <ion-select-option value="medium">中厅堂</ion-select-option>
              <ion-select-option value="large">大教堂</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label>
              <h2>声道平衡</h2>
              <p>{{ balanceLabel }}</p>
            </ion-label>
            <ion-toggle :checked="state.balance.enabled" @ionChange="onBalanceEnabled" />
          </ion-item>
          <ion-item>
            <ion-range
              :value="state.balance.value"
              :min="-1"
              :max="1"
              :step="0.05"
              :disabled="!state.balance.enabled"
              @ionInput="onBalanceValue"
            />
          </ion-item>
          <ion-item>
            <ion-label>
              <h2>响度均衡</h2>
              <p>拉平不同歌曲的响度差异</p>
            </ion-label>
            <ion-toggle :checked="state.loudness.enabled" @ionChange="onLoudnessEnabled" />
          </ion-item>
          <ion-item>
            <ion-label>强度</ion-label>
            <ion-select
              :value="state.loudness.target"
              :disabled="!state.loudness.enabled"
              interface="action-sheet"
              cancel-text="取消"
              @ionChange="onLoudnessTarget"
            >
              <ion-select-option value="gentle">轻度</ion-select-option>
              <ion-select-option value="standard">标准</ion-select-option>
              <ion-select-option value="strong">强力</ion-select-option>
            </ion-select>
          </ion-item>
        </ion-list>

        <div class="actions ceru-pad">
          <ion-button expand="block" fill="outline" color="medium" @click="resetEffects">
            重置高级音效
          </ion-button>
        </div>
        <p class="hint">首次启用后会接管当前音频输出；关闭全部音效后保持直通，不再额外处理。</p>
      </template>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  alertController,
  toastController
} from '@ionic/vue'
import { optionsOutline, volumeHighOutline } from 'ionicons/icons'
import { EQ_FREQUENCIES, type LoudnessTarget, type SurroundMode } from '@/services/audioEffects'
import { BASS_PRESETS, bassPresetFromGain, bassPresetGain } from '@/services/bassPresets'
import EqSpectrum from '@/components/EqSpectrum.vue'
import { EQ_CUSTOM_PRESET } from '@/services/eqPresets'
import { saveAndShareFile } from '@/services/fileExport'
import { useAudioEffectsStore } from '@/stores/audioEffects'

const store = useAudioEffectsStore()
const state = store.state
const frequencies = EQ_FREQUENCIES
const importInput = ref<HTMLInputElement | null>(null)

const balanceLabel = computed(() => {
  if (!state.balance.enabled) return '已关闭'
  const value = state.balance.value
  if (Math.abs(value) < 0.01) return '居中'
  return value < 0
    ? `左 ${Math.round(Math.abs(value) * 100)}%`
    : `右 ${Math.round(value * 100)}%`
})

function formatFreq(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`
}

async function notifyUnsupported(): Promise<void> {
  const toast = await toastController.create({ message: '当前环境不支持音频效果', duration: 1600 })
  await toast.present()
}

function commit(): void {
  store.apply()
}

async function onEqualizerEnabled(event: CustomEvent): Promise<void> {
  const enabled = Boolean(event.detail.checked)
  if (enabled && !store.supported) {
    await notifyUnsupported()
    return
  }
  store.setEqualizerEnabled(enabled)
  commit()
}

function onPresetChange(event: CustomEvent): void {
  store.selectPreset(String(event.detail.value))
  commit()
}

function onBandInput(index: number, event: CustomEvent): void {
  store.setBandGain(index, Number(event.detail.value))
  commit()
}

async function showMessage(message: string, color = 'medium'): Promise<void> {
  const toast = await toastController.create({ message, duration: 2200, color })
  await toast.present()
}

async function savePresetAs(): Promise<void> {
  const alert = await alertController.create({
    header: '保存为新预设',
    inputs: [{ name: 'name', type: 'text', placeholder: '预设名称' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const result = store.savePreset(String(data?.values?.name ?? ''))
  if (!result.ok) {
    await showMessage(result.reason, 'warning')
    return
  }
  await showMessage(`已保存预设「${result.name}」`, 'success')
}

async function overwritePreset(): Promise<void> {
  const name = state.equalizerPreset
  if (!store.overwriteCurrentPreset()) return
  await showMessage(`已更新预设「${name}」`, 'success')
}

async function deletePreset(): Promise<void> {
  if (!store.customPresetActive) {
    await showMessage('内置预设不能删除', 'warning')
    return
  }
  const name = state.equalizerPreset
  const alert = await alertController.create({
    header: '删除预设',
    message: `确定要删除预设「${name}」吗？`,
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '删除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  store.deleteCurrentPreset()
  await showMessage(`已删除预设「${name}」`)
}

function resetPreset(): void {
  // 只重置均衡器，不影响低音 / 环绕 / 响度，与按钮旁的语义一致。
  store.resetToCurrentPreset()
  commit()
}

async function exportConfig(): Promise<void> {
  try {
    await saveAndShareFile({
      name: 'ceru-music-eq-config.json',
      data: store.exportConfig(),
      mime: 'application/json',
      title: 'Ceru Music 音效配置'
    })
  } catch (error) {
    await showMessage(error instanceof Error ? error.message : '导出失败', 'danger')
  }
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    // 导入只覆盖均衡器配置；低音 / 环绕 / 响度不在桌面版的导出格式里。
    store.importConfig(await file.text())
    await showMessage('配置导入成功', 'success')
  } catch (error) {
    await showMessage(error instanceof Error ? error.message : '导入失败', 'danger')
  }
}

function onBassEnabled(event: CustomEvent): void {
  store.setBassBoost(Boolean(event.detail.checked))
  commit()
}

function onBassGain(event: CustomEvent): void {
  store.setBassBoost(state.bassBoost.enabled, Number(event.detail.value))
  commit()
}

/**
 * 当前增益落在哪个预设档位上。
 * 手动拖到非预设值（如 4.5 dB）时返回 null，此时不高亮任何一档，
 * 否则界面会显示一个与滑杆不符的选中项。
 */
const activeBassPreset = computed(() => bassPresetFromGain(state.bassBoost.gain) ?? undefined)

function onBassPreset(event: CustomEvent): void {
  const gain = bassPresetGain(String(event.detail.value ?? ''))
  if (gain === null) return
  store.setBassBoost(state.bassBoost.enabled, gain)
  commit()
}

function onSurroundEnabled(event: CustomEvent): void {
  store.setSurround(Boolean(event.detail.checked))
  commit()
}

function onSurroundMode(event: CustomEvent): void {
  store.setSurround(state.surround.enabled, String(event.detail.value) as SurroundMode)
  commit()
}

function onBalanceEnabled(event: CustomEvent): void {
  store.setBalance(Boolean(event.detail.checked))
  commit()
}

function onBalanceValue(event: CustomEvent): void {
  store.setBalance(state.balance.enabled, Number(event.detail.value))
  commit()
}

function onLoudnessEnabled(event: CustomEvent): void {
  store.setLoudness(Boolean(event.detail.checked))
  commit()
}

function onLoudnessTarget(event: CustomEvent): void {
  store.setLoudness(state.loudness.enabled, String(event.detail.value) as LoudnessTarget)
  commit()
}

function resetEffects(): void {
  store.resetEffects()
  commit()
}

function resetAll(): void {
  store.resetAll()
  commit()
}
</script>

<style scoped>
.fx-head {
  padding-top: 8px;
}

.band-list {
  padding: 4px 0 12px;
  transition: opacity 0.2s ease;
}

.band-list.disabled {
  opacity: 0.45;
}

.band-row {
  display: grid;
  grid-template-columns: 48px 1fr 64px;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
}

.band-freq {
  color: var(--ceru-text-secondary);
  font-size: 0.8rem;
  text-align: right;
}

.band-gain {
  color: var(--ceru-text-secondary);
  font-size: 0.75rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.band-row ion-range {
  padding: 0;
}

.file-input {
  display: none;
}

.preset-actions {
  --min-height: 40px;
}

.preset-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
}

.preset-actions-row ion-button {
  margin: 0;
  font-size: 0.8rem;
}

.actions {
  padding-top: 4px;
}

.hint {
  margin: 12px 16px 0;
  color: var(--ceru-text-secondary);
  font-size: 0.8rem;
  line-height: 1.5;
}

.bottom-space {
  height: 40px;
}
</style>
