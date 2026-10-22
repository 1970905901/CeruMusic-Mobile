<template>
  <ion-modal
    class="local-tag-modal"
    :is-open="open"
    :initial-breakpoint="0.92"
    :breakpoints="[0, 0.6, 0.92, 1]"
    @didDismiss="$emit('close')"
  >
    <div class="modal-shell">
      <ion-header :translucent="true">
        <ion-toolbar>
          <ion-title>编辑歌曲标签</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">关闭</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
        <div class="sheet-body ceru-pad">
          <ion-segment :value="tab" @ionChange="onTabChange">
            <ion-segment-button value="edit"><ion-label>编辑信息</ion-label></ion-segment-button>
            <ion-segment-button value="search"><ion-label>在线搜索</ion-label></ion-segment-button>
          </ion-segment>

          <!-- 编辑 -->
          <template v-if="tab === 'edit'">
            <div class="cover-row">
              <button type="button" class="cover-button" @click="coverInput?.click()">
                <CoverImage v-if="form.cover" :src="form.cover" :size="96" :radius="14" :alt="form.title" />
                <span v-else class="cover-empty">
                  <ion-icon :icon="imageOutline" />
                  添加封面
                </span>
              </button>
              <div class="cover-actions">
                <button type="button" class="text-btn" @click="coverInput?.click()">
                  {{ form.cover ? '更换封面' : '上传封面' }}
                </button>
                <button v-if="form.cover" type="button" class="text-btn danger" @click="removeCover">
                  移除封面
                </button>
                <p class="hint">封面会一并写入音频文件（MP3 / FLAC / M4A）。</p>
              </div>
              <input ref="coverInput" class="file-input" type="file" accept="image/*" @change="onCoverFile" />
            </div>

            <ion-list lines="full" class="form-list">
              <ion-item>
                <ion-label position="stacked">歌曲名</ion-label>
                <ion-input v-model="form.title" placeholder="必填" />
              </ion-item>
              <ion-item>
                <ion-label position="stacked">歌手</ion-label>
                <ion-input v-model="form.artist" placeholder="多个歌手用 / 分隔" />
              </ion-item>
              <ion-item>
                <ion-label position="stacked">专辑</ion-label>
                <ion-input v-model="form.album" />
              </ion-item>
              <ion-item>
                <ion-label position="stacked">年份</ion-label>
                <ion-input v-model="form.year" type="number" inputmode="numeric" placeholder="如 2004" />
              </ion-item>
              <ion-item>
                <ion-label position="stacked">流派</ion-label>
                <ion-input v-model="form.genre" />
              </ion-item>
              <ion-item>
                <ion-label position="stacked">歌词</ion-label>
                <ion-textarea
                  v-model="form.lyrics"
                  :auto-grow="true"
                  :rows="6"
                  placeholder="粘贴 LRC 或纯文本，播放时自动识别格式"
                  class="lyrics-input"
                />
              </ion-item>
            </ion-list>
            <p class="hint">歌词按原文保存，播放时自动识别格式，不需要提前转换。</p>
          </template>

          <!-- 在线搜索 -->
          <template v-else>
            <div class="search-row">
              <ion-searchbar
                v-model="keyword"
                :debounce="0"
                placeholder="歌曲名 歌手"
                :animated="false"
                @keyup.enter="search"
              />
              <ion-button :disabled="searching" @click="search">
                <ion-spinner v-if="searching" name="crescent" />
                <span v-else>搜索</span>
              </ion-button>
            </div>
            <p class="hint">从当前音源插件搜索；「使用」只会填入信息，仍需确认后保存。</p>

            <p v-if="searchError" class="error">{{ searchError }}</p>

            <div v-if="candidates.length" class="candidate-list">
              <div v-for="(item, index) in candidates" :key="index" class="candidate-card ceru-card">
                <CoverImage :src="item.artworkUrl" :size="52" :radius="10" :alt="item.title" />
                <div class="candidate-copy">
                  <div class="candidate-title ceru-truncate">{{ item.title }}</div>
                  <div class="candidate-sub ceru-truncate">
                    {{ item.artists.join(' / ') || '未知艺术家' }}
                    <span v-if="item.album"> · {{ item.album }}</span>
                  </div>
                </div>
                <ion-button size="small" fill="outline" :disabled="applying" @click="useCandidate(item)">
                  使用
                </ion-button>
              </div>
            </div>
            <p v-else-if="searched && !searching" class="hint">没有找到相关结果。</p>
          </template>
        </div>
      </ion-content>

      <ion-footer class="sheet-footer">
        <ion-button expand="block" :disabled="saving" @click="save">
          <ion-spinner v-if="saving" name="crescent" />
          <span v-else>保存修改</span>
        </ion-button>
      </ion-footer>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
/**
 * 本地歌曲标签编辑器，对齐桌面版 `Music/LocalTagEditor.vue`。
 *
 * 移动端此前用 `alertController` 的六个输入框编辑：没有封面预览、没有在线搜索，
 * 长歌词挤在一个不能自适应高度的输入框里，手机上几乎无法用。这里换成整页 sheet：
 * 编辑 / 在线搜索两个分页，封面可选可换，搜索到的结果「使用」后回到编辑页确认。
 */
import { computed, ref, watch } from 'vue'
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonInput,
  IonTextarea,
  IonSearchbar,
  IonSpinner,
  IonIcon,
  toastController
} from '@ionic/vue'
import { imageOutline } from 'ionicons/icons'
import { CapacitorHttp } from '@capacitor/core'
import CoverImage from '@/components/CoverImage.vue'
import { compressAndCropToSquare } from '@/services/imageUtils'
import { lyricValueToLrc } from '@/services/lyrics'
import {
  applyCandidateToForm,
  coverNeedsFetch,
  emptyTagForm,
  parseYearInput,
  tagFormError,
  type MetadataCandidate,
  type TagForm
} from '@/services/localTagEditor'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import type { Track } from '@/types/music'

const props = defineProps<{ open: boolean; track: Track | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const library = useLibraryStore()
const plugins = usePluginStore()

const tab = ref<'edit' | 'search'>('edit')
const form = ref<TagForm>(emptyTagForm())
const saving = ref(false)
const applying = ref(false)
const coverInput = ref<HTMLInputElement | null>(null)

const keyword = ref('')
const candidates = ref<MetadataCandidate[]>([])
const searching = ref(false)
const searched = ref(false)
const searchError = ref('')

const source = computed(() => plugins.sources[0]?.id ?? '')

function loadForm(): void {
  const track = props.track
  if (!track) return
  const record = library.localTags(track)
  form.value = {
    title: track.title,
    artist: track.artists.join(' / '),
    album: track.album || '',
    year: record?.year ? String(record.year) : '',
    genre: record?.genre || '',
    lyrics: record?.lyrics || '',
    cover: record?.cover || track.artworkUrl || ''
  }
  keyword.value = [track.title, track.artists.join(' ')].filter(Boolean).join(' ').trim()
  candidates.value = []
  searched.value = false
  searchError.value = ''
  tab.value = 'edit'
}

watch(
  () => [props.open, props.track?.key] as const,
  ([open]) => {
    if (open) loadForm()
  },
  { immediate: true }
)

function onTabChange(event: CustomEvent): void {
  tab.value = event.detail.value === 'search' ? 'search' : 'edit'
}

async function toast(message: string, color = 'medium'): Promise<void> {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

function removeCover(): void {
  form.value.cover = ''
}

async function onCoverFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    await toast('请选择图片文件', 'danger')
    return
  }
  try {
    // 统一裁成正方形并压到 600px：标签里塞一张 4MB 的图会拖慢每次读取。
    form.value.cover = await compressAndCropToSquare(file, 600)
  } catch (error) {
    await toast(error instanceof Error ? error.message : '读取图片失败', 'danger')
  }
}

/**
 * 把远程封面转成 data URL。
 *
 * 走 `CapacitorHttp` 而不是 canvas：封面 CDN 基本不给 CORS 头，浏览器里
 * `img.crossOrigin` 加载会失败或污染 canvas。原生层取字节没有这个限制。
 * 失败返回 null，由调用方保留原封面——绝不把远程地址直接塞进标签。
 */
async function fetchCoverDataUrl(url: string): Promise<string | null> {
  try {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      responseType: 'blob',
      connectTimeout: 15000,
      readTimeout: 30000
    })
    if (response.status < 200 || response.status >= 300) return null
    const data = response.data
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      return compressAndCropToSquare(data, 600)
    }
    if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
      // 部分原生实现直接给字节数组；转成 Blob 才能走同一条裁切压缩路径。
      return compressAndCropToSquare(new Blob([data]), 600)
    }
    const mime =
      response.headers?.['content-type'] || response.headers?.['Content-Type'] || 'image/jpeg'
    if (typeof data !== 'string') return null
    const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data
    return `data:${mime};base64,${base64}`
  } catch (error) {
    console.warn('获取在线封面失败', error)
    return null
  }
}

async function search(): Promise<void> {
  const query = keyword.value.trim()
  if (!query || searching.value) return
  if (!source.value) {
    searchError.value = '请先安装并启用音源插件'
    return
  }
  searching.value = true
  searchError.value = ''
  candidates.value = []
  try {
    const page = await plugins.searchTracks(source.value, query, undefined, 15)
    candidates.value = page.items.map((track) => ({
      title: track.title,
      artists: track.artists,
      album: track.album,
      durationMs: track.durationMs,
      artworkUrl: track.artworkUrl,
      track
    }))
    searched.value = true
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : '搜索失败'
  } finally {
    searching.value = false
  }
}

async function useCandidate(candidate: MetadataCandidate): Promise<void> {
  if (applying.value) return
  applying.value = true
  try {
    form.value = applyCandidateToForm(form.value, candidate)
    if (coverNeedsFetch(candidate.artworkUrl)) {
      const cover = await fetchCoverDataUrl(candidate.artworkUrl as string)
      if (cover) form.value.cover = cover
      else await toast('封面获取失败，保留原封面', 'warning')
    }
    // 歌词另外取：拿不到不影响元数据应用，与桌面版同口径。
    const track = candidate.track as Track | undefined
    if (track) {
      try {
        const lyrics = lyricValueToLrc(await plugins.lyrics(track))
        if (lyrics) form.value.lyrics = lyrics
      } catch {
        await toast('歌词获取失败，仅应用了歌曲信息', 'warning')
      }
    }
    tab.value = 'edit'
    await toast('已填入信息，请确认后保存')
  } finally {
    applying.value = false
  }
}

async function save(): Promise<void> {
  const track = props.track
  if (!track || saving.value) return
  const error = tagFormError(form.value)
  if (error) {
    await toast(error, 'danger')
    return
  }
  saving.value = true
  try {
    const year = parseYearInput(form.value.year)
    const artist = form.value.artist.trim()
    const result = await library.writeLocalTags(track, {
      title: form.value.title.trim(),
      artists: artist ? artist.split(/\s*\/\s*/).filter(Boolean) : [],
      album: form.value.album.trim(),
      year: year.ok ? year.year : null,
      genre: form.value.genre.trim(),
      lyrics: form.value.lyrics,
      // 表单载入时已带出原封面，保存时原样回写；空字符串表示用户主动移除。
      cover: form.value.cover
    })
    if (result.fileTagWarning) {
      await toast('应用内信息已保存；音频文件标签写入失败', 'warning')
    } else {
      await toast(result.fileTagWritten ? '已保存并写入音频标签' : '应用内信息已保存', 'success')
    }
    emit('saved')
    emit('close')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '保存失败', 'danger')
  } finally {
    saving.value = false
  }
}

</script>

<style scoped>
.local-tag-modal {
  --border-radius: 20px 20px 0 0;
}
.modal-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.sheet-body {
  padding-bottom: 28px;
}
.file-input {
  display: none;
}
.cover-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px 0 8px;
}
.cover-button {
  border: 0;
  background: transparent;
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
}
.cover-empty {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  gap: 4px;
  border: 1px dashed var(--ceru-border);
  border-radius: 14px;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.cover-empty ion-icon {
  font-size: 24px;
}
.cover-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.text-btn {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  padding: 2px 0;
}
.text-btn.danger {
  color: var(--ion-color-danger, #eb445a);
}
.form-list {
  margin-top: 6px;
  padding: 0;
}
.lyrics-input {
  --padding-top: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.search-row ion-searchbar {
  flex: 1;
  padding: 0;
  --background: var(--ceru-bg-elevated);
  --border-radius: 14px;
  --box-shadow: none;
  --color: var(--ceru-text);
}
.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}
.candidate-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.candidate-copy {
  flex: 1;
  min-width: 0;
}
.candidate-title {
  font-size: 14px;
  font-weight: 650;
}
.candidate-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.hint {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.error {
  margin: 10px 0 0;
  color: var(--ion-color-danger, #eb445a);
  font-size: 12px;
}
.sheet-footer {
  padding: 10px 16px calc(10px + var(--ion-safe-area-bottom, 0px));
}
</style>
