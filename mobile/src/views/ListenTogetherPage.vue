<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/discover" text="" />
        </ion-buttons>
        <ion-title>一起听</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="lt.inRoom" fill="clear" aria-label="分享房间" @click="shareRoom">
            <ion-icon slot="icon-only" :icon="shareOutline" />
          </ion-button>
          <ion-button v-if="lt.inRoom" fill="clear" color="danger" aria-label="离开房间" @click="confirmLeave">
            <ion-icon slot="icon-only" :icon="exitOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="lt-content">
      <div v-if="!auth.authenticated" class="empty ceru-pad">
        <ion-icon :icon="headsetOutline" />
        <h2>登录后一起听</h2>
        <p>创建或加入房间，与朋友同步播放、聊天和点歌。</p>
        <ion-button @click="$router.push('/account')">去登录</ion-button>
      </div>

      <div v-else-if="!lt.inRoom" class="entry ceru-pad">
        <div class="hero-orb"><ion-icon :icon="headsetOutline" /></div>
        <h1 class="ceru-title">同一首歌，同一秒</h1>
        <p class="hero-sub">创建亲密双人房或最多 50 人的多人房，一起同步播放、聊天和点歌。</p>

        <button v-if="previousRoom" type="button" class="resume-room" @click="resumePreviousRoom">
          <ion-icon :icon="timeOutline" />
          <span>
            <strong>回到 {{ previousRoom.name }}</strong>
            <small>上次仍在房间中 · #{{ previousRoom.code }}#</small>
          </span>
          <ion-icon :icon="chevronForwardOutline" />
        </button>

        <ion-segment v-model="entryMode" class="entry-segment">
          <ion-segment-button value="create">创建房间</ion-segment-button>
          <ion-segment-button value="join">加入房间</ion-segment-button>
        </ion-segment>

        <div v-if="entryMode === 'create'" class="entry-panel ceru-card">
          <div class="field-title">房间类型</div>
          <ion-segment v-model="createForm.mode">
            <ion-segment-button value="intimate">亲密双人</ion-segment-button>
            <ion-segment-button value="group">多人房间</ion-segment-button>
          </ion-segment>
          <ion-input
            v-if="createForm.mode === 'group'"
            v-model="createForm.name"
            class="entry-input"
            fill="outline"
            placeholder="房间名（可选）"
            :maxlength="30"
          />
          <div v-if="createForm.mode === 'group'" class="member-limit">
            <span>人数上限</span>
            <ion-select v-model="createForm.maxMembers" interface="action-sheet" cancel-text="取消">
              <ion-select-option :value="2">2 人</ion-select-option>
              <ion-select-option :value="5">5 人</ion-select-option>
              <ion-select-option :value="10">10 人</ion-select-option>
              <ion-select-option :value="20">20 人</ion-select-option>
              <ion-select-option :value="50">50 人</ion-select-option>
            </ion-select>
          </div>
          <ion-button expand="block" :disabled="lt.joining" @click="createRoom">
            <ion-spinner v-if="lt.joining" name="crescent" />
            <span v-else>创建并进入</span>
          </ion-button>
        </div>

        <div v-else class="entry-panel ceru-card">
          <div class="field-title">房间口令或分享文案</div>
          <ion-textarea
            v-model="joinInput"
            class="join-input"
            auto-grow
            :maxlength="300"
            placeholder="粘贴 #ABC123# 或整段邀请文案"
          />
          <div class="join-tools">
            <span v-if="detectedCode">已识别口令：<strong>{{ detectedCode }}</strong></span>
            <button type="button" @click="pasteInvite">从剪贴板粘贴</button>
          </div>
          <ion-button expand="block" :disabled="lt.joining || !joinInput.trim()" @click="joinRoom">
            <ion-spinner v-if="lt.joining" name="crescent" />
            <span v-else>加入房间</span>
          </ion-button>
        </div>

        <p v-if="lt.error" class="error-box">{{ lt.error }}</p>
      </div>

      <template v-else>
        <div class="room-head ceru-pad">
          <div class="room-title-row">
            <div>
              <h1 class="room-name ceru-truncate">{{ lt.room?.name || '一起听' }}</h1>
              <p class="room-meta">
                {{ lt.room?.mode === 'intimate' ? '亲密双人房' : '多人房' }} ·
                {{ lt.onlineMembers }}/{{ lt.room?.maxMembers }} 人
              </p>
            </div>
            <button type="button" class="code-chip" @click="copyCode">
              <span>#{{ lt.room?.code }}#</span>
              <ion-icon :icon="copyOutline" />
            </button>
          </div>
          <div class="connection-line" :class="{ offline: !lt.connected }">
            <span class="dot" />
            {{ lt.connected ? '已连接' : '正在重连…' }}
            <button v-if="!lt.connected" type="button" @click="lt.retryConnection">立即重连</button>
          </div>
        </div>

        <p v-if="lt.error" class="error-box">{{ lt.error }}</p>
        <button v-if="lt.needsTap" type="button" class="tap-banner" @click="resumePlayback">
          <ion-icon :icon="playCircleOutline" />
          系统阻止了自动播放，点此继续播放
        </button>

        <div class="now-card ceru-card">
          <CoverImage
            :src="lt.currentSong?.cover || ''"
            :size="76"
            :radius="16"
            :alt="lt.currentSong?.name || '房间音乐'"
            class="now-cover"
          />
          <div class="now-copy">
            <div class="now-label">房间正在听</div>
            <div class="now-title ceru-truncate">{{ lt.currentSong?.name || '还没有选歌' }}</div>
            <div class="now-artist ceru-truncate">{{ lt.currentSong?.singer || (lt.canControl ? '把当前歌曲设为房间歌曲' : '等待房主选歌') }}</div>
          </div>
        </div>

        <div class="timeline">
          <ion-range
            :value="roomPosition"
            :min="0"
            :max="duration || 1"
            :step="0.5"
            :disabled="!lt.currentSong || !lt.canControl"
            class="seek"
            @ionChange="seekTo($event.detail.value)"
          />
          <div class="times">
            <span>{{ formatTime(roomPosition) }}</span>
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>

        <div class="room-controls">
          <button type="button" class="control-btn" :disabled="!lt.canControl" @click="lt.previous()">
            <ion-icon :icon="playSkipBackOutline" />
          </button>
          <button type="button" class="main-control" :disabled="!lt.canControl || !lt.currentSong" @click="toggleRoomPlay">
            <ion-icon :icon="lt.current.isPlaying ? pauseOutline : playOutline" />
          </button>
          <button type="button" class="control-btn" :disabled="!lt.canControl" @click="lt.skip()">
            <ion-icon :icon="playSkipForwardOutline" />
          </button>
        </div>

        <div class="host-actions ceru-pad">
          <ion-button v-if="lt.canControl" size="small" fill="outline" :disabled="!player.currentTrack" @click="changeSong">
            <ion-icon slot="start" :icon="musicalNotesOutline" />
            把当前歌曲设为房间歌曲
          </ion-button>
          <ion-button v-if="lt.canControl" size="small" fill="outline" :disabled="!player.currentTrack" @click="addCurrentToQueue">
            <ion-icon slot="start" :icon="addOutline" />
            加入队列
          </ion-button>
          <ion-button v-else size="small" fill="outline" :disabled="!player.currentTrack" @click="requestCurrentTrack">
            <ion-icon slot="start" :icon="addOutline" />
            点歌
          </ion-button>
        </div>

        <ion-segment v-model="panel" class="panel-segment">
          <ion-segment-button value="chat">聊天</ion-segment-button>
          <ion-segment-button value="queue">队列 {{ lt.queue.length || '' }}</ion-segment-button>
          <ion-segment-button value="members">成员 {{ lt.members.length || '' }}</ion-segment-button>
        </ion-segment>

        <div v-if="panel === 'chat'" class="panel chat-panel">
          <div
            ref="chatList"
            class="chat-list"
            @scroll="onChatScroll"
          >
            <div v-if="!lt.chat.length" class="panel-empty">还没有聊天，打个招呼吧</div>
            <div
              v-for="message in lt.chat"
              :key="message.id"
              :data-msg-id="message.id"
              class="chat-message"
              :class="{
                mine: message.from?.userId === lt.userId,
                system: message.type === 'system',
                highlighted: message.id === highlightedMessageId
              }"
              @contextmenu.prevent="openMessageActions(message)"
              @touchstart.passive="startPress(message)"
              @touchend="endPress"
              @touchcancel="endPress"
              @touchmove="endPress"
            >
              <template v-if="message.type === 'system'">
                <span>{{ systemText(message) }}</span>
              </template>
              <template v-else>
                <CoverImage :src="message.from?.avatar || ''" :size="30" :radius="15" :alt="message.from?.nickname || ''" />
                <div class="chat-bubble">
                  <div class="chat-name">{{ message.from?.nickname || '音乐同好' }}</div>
                  <button
                    v-if="message.meta?.replyToId"
                    type="button"
                    class="chat-quote"
                    @click="jumpToQuoted(message)"
                  >
                    <span class="quote-from">{{ message.meta.replyToFrom || '回复' }}</span>
                    <span class="quote-text">{{ message.meta.replyToPreview || '' }}</span>
                  </button>
                  <div class="chat-text">
                    <template v-if="message.type === 'sticker'">[贴纸] {{ describeChatSticker(message.content) }}</template>
                    <template v-else>
                      <span
                        v-for="(segment, index) in segmentsOf(message)"
                        :key="index"
                        :class="segment.type === 'mention' ? ['chat-mention', { self: segment.isSelf }] : ''"
                        >{{ segment.text }}</span
                      >
                    </template>
                  </div>
                  <ChatShareCard
                    v-if="shareLinkOf(message)"
                    :card-type="shareLinkOf(message)!.cardType"
                    :card-id="shareLinkOf(message)!.cardId"
                    @open="openShareLink(message)"
                  />
                </div>
              </template>
            </div>
          </div>
          <div class="chat-composer">
            <div class="composer-stack">
              <div v-if="mentionCandidates.length" class="mention-popup">
                <button
                  v-for="member in mentionCandidates"
                  :key="member.userId"
                  type="button"
                  class="mention-option"
                  @pointerdown.prevent
                  @click="pickMention(member)"
                >
                  <CoverImage :src="member.avatar || ''" :size="22" :radius="11" :alt="member.nickname" />
                  <span class="ceru-truncate">{{ member.nickname || '音乐同好' }}</span>
                </button>
              </div>
              <div v-if="replyTo" class="reply-chip">
                <div class="reply-chip-copy">
                  <span class="reply-chip-title">回复 {{ replyTo.from }}</span>
                  <span class="reply-chip-preview ceru-truncate">{{ replyTo.preview }}</span>
                </div>
                <button type="button" class="reply-chip-close" aria-label="取消回复" @click="clearReply">✕</button>
              </div>
              <ion-textarea
                ref="chatInput"
                v-model="chatDraft"
                auto-grow
                :maxlength="500"
                placeholder="聊聊这首歌…"
                class="chat-input"
                @ionInput="onChatInput"
                @ionBlur="onChatBlur"
                @keydown.enter.exact.prevent="sendChat"
              />
            </div>
            <ion-button :disabled="!chatDraft.trim()" @click="sendChat">
              <ion-icon :icon="sendOutline" />
            </ion-button>
          </div>
        </div>

        <div v-else-if="panel === 'queue'" class="panel queue-panel ceru-pad">
          <div v-if="lt.pending.length" class="queue-block">
            <h3>待审批点歌</h3>
            <div v-for="item in lt.pending" :key="item.reqId" class="queue-item pending-item">
              <CoverImage :src="item.song.cover || ''" :size="42" :radius="9" :alt="item.song.name || ''" />
              <div class="queue-copy">
                <div class="queue-title ceru-truncate">{{ item.song.name || '未知歌曲' }}</div>
                <div class="queue-sub ceru-truncate">{{ item.song.singer || '未知歌手' }} · {{ item.requesterName }} 点歌</div>
              </div>
              <template v-if="lt.canControl">
                <button type="button" class="tiny-action ok" @click="lt.approveRequest(item)">通过</button>
                <button type="button" class="tiny-action" @click="lt.rejectRequest(item)">拒绝</button>
              </template>
            </div>
          </div>

          <div v-if="lt.queue.length" class="queue-block">
            <h3>播放队列</h3>
            <div v-for="(item, index) in lt.queue" :key="item.itemId || item.id || index" class="queue-item">
              <button type="button" class="queue-index" :disabled="!lt.canControl" @click="lt.playQueueItem(item)">
                {{ index + 1 }}
              </button>
              <CoverImage :src="item.song.cover || ''" :size="42" :radius="9" :alt="item.song.name || ''" />
              <div class="queue-copy">
                <div class="queue-title ceru-truncate">{{ item.song.name || '未知歌曲' }}</div>
                <div class="queue-sub ceru-truncate">{{ item.song.singer || '未知歌手' }}</div>
              </div>
              <button v-if="lt.canRemoveQueueItem(item)" type="button" class="tiny-action danger" @click="lt.removeQueueItem(item)">移除</button>
            </div>
          </div>

          <div v-if="!lt.pending.length && !lt.queue.length" class="panel-empty">队列还是空的</div>
        </div>

        <div v-else class="panel members-panel ceru-pad">
          <div v-for="member in lt.members" :key="member.userId" class="member-row">
            <CoverImage :src="member.avatar || ''" :size="42" :radius="21" :alt="member.nickname" />
            <div class="member-copy">
              <div class="member-name ceru-truncate">{{ member.nickname || '音乐同好' }}<span v-if="member.userId === lt.userId">（我）</span></div>
              <div class="member-role">{{ roleLabel(lt.memberRole(member)) }}</div>
            </div>
            <button
              v-if="lt.isOwner && member.userId !== lt.userId"
              type="button"
              class="tiny-action"
              @click="openMemberActions(member)"
            >
              管理
            </button>
          </div>
          <div v-if="!lt.members.length" class="panel-empty">正在载入成员…</div>
        </div>
      </template>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonPage,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  addOutline,
  chevronForwardOutline,
  copyOutline,
  exitOutline,
  headsetOutline,
  musicalNotesOutline,
  pauseOutline,
  playCircleOutline,
  playOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  sendOutline,
  shareOutline,
  timeOutline
} from 'ionicons/icons'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import CoverImage from '@/components/CoverImage.vue'
import ChatShareCard from '@/components/ChatShareCard.vue'
import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { useListenTogetherStore } from '@/stores/listenTogether'
import {
  extractRoomCode,
  type ChatMsg,
  type RoomMember,
  type RoomRole
} from '@/services/listenTogetherApi'
import {
  buildChatMeta,
  describeChatSticker,
  findMentionQuery,
  parseChatShareLink,
  replyPreview,
  renderSystemMessage,
  splitMentions,
  type ChatSegment
} from '@/services/listenTogetherChat'

const auth = useAuthStore()
const player = usePlayerStore()
const lt = useListenTogetherStore()
const route = useRoute()
const ionRouter = useIonRouter()

const entryMode = ref<'create' | 'join'>('create')
const panel = ref<'chat' | 'queue' | 'members'>('chat')
const joinInput = ref(String(route.query.code || ''))
const chatDraft = ref('')
const chatList = ref<HTMLElement | null>(null)
const chatInput = ref<any>(null)
const nowTick = ref(Date.now())
const previousRoom = ref<{ code: string; name: string } | null>(null)
const selectedMentions = ref<Array<{ userId: string; nickname: string }>>([])
const mentionQuery = ref<string | null>(null)
const replyTo = ref<{ id: string; from: string; preview: string } | null>(null)
const highlightedMessageId = ref('')
const createForm = reactive({
  mode: 'group' as 'intimate' | 'group',
  name: '',
  maxMembers: 50
})

let tickTimer: ReturnType<typeof setInterval> | undefined
let pressTimer: ReturnType<typeof setTimeout> | undefined
let highlightTimer: ReturnType<typeof setTimeout> | undefined
/** 用户停留在列表底部时才自动跟随新消息，翻历史时不打断。 */
const stickToBottom = ref(true)

const detectedCode = computed(() => extractRoomCode(joinInput.value))
/** @ 候选：仅在输入 `@` 后活跃，排除自己，最多 6 条。 */
const mentionCandidates = computed<RoomMember[]>(() => {
  const query = mentionQuery.value
  if (query === null) return []
  const keyword = query.toLowerCase()
  return lt.members
    .filter((member) => member.userId !== lt.userId)
    .filter((member) => !keyword || String(member.nickname || '').toLowerCase().includes(keyword))
    .slice(0, 6)
})
const roomPosition = computed(() => {
  void nowTick.value
  if (!lt.current.song) return 0
  const value = lt.getTargetPosition(lt.current)
  return Number.isFinite(value) ? Math.max(0, value) : 0
})
const duration = computed(() => {
  const songDuration = Number(lt.current.song?.duration || 0)
  if (songDuration > 0) return songDuration
  return player.durationMs > 0 ? player.durationMs / 1000 : 0
})

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00'
  const total = Math.max(0, Math.floor(value))
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return minutes + ':' + seconds
}

function roleLabel(role: RoomRole): string {
  if (role === 'owner') return '房主'
  if (role === 'admin') return '管理员'
  return '听众'
}

async function resumePreviousRoom() {
  if (!previousRoom.value) return
  try {
    await lt.resolveAndJoin('#' + previousRoom.value.code + '#')
    previousRoom.value = null
    await toast('已回到房间')
  } catch (cause) {
    previousRoom.value = null
    await toast(cause instanceof Error ? cause.message : '无法回到房间', 'danger')
  }
}

async function createRoom() {
  try {
    await lt.createAndJoin({
      mode: createForm.mode,
      name: createForm.mode === 'group' ? createForm.name : undefined,
      maxMembers: createForm.mode === 'group' ? createForm.maxMembers : undefined
    })
    panel.value = 'chat'
    await toast('房间已创建')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '创建房间失败', 'danger')
  }
}

async function joinRoom() {
  try {
    await lt.resolveAndJoin(joinInput.value)
    panel.value = 'chat'
    await toast('已加入房间')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '加入房间失败', 'danger')
  }
}

async function pasteInvite() {
  try {
    const { value } = await Clipboard.read()
    if (value) joinInput.value = value
  } catch {
    await toast('无法读取剪贴板', 'warning')
  }
}

async function copyCode() {
  if (!lt.room?.code) return
  try {
    await Clipboard.write({ string: '#' + lt.room.code + '#' })
    await toast('房间口令已复制')
  } catch {
    await toast('复制失败', 'danger')
  }
}

async function shareRoom() {
  if (!lt.room) return
  const text = lt.shareText || '「一起听」打开澜音输入口令 #' + lt.room.code + '# 加入。'
  const url = lt.shareUrl || 'https://ceru.shiqianjiang.cn/lt/' + lt.room.code
  try {
    await Share.share({ title: lt.room.name || '一起听', text, url })
  } catch {
    // Closing the system share sheet is not an error.
  }
}

async function toggleRoomPlay() {
  if (lt.current.isPlaying) lt.pause()
  else lt.play()
}

function seekTo(value: any) {
  if (!lt.canControl) return
  lt.seek(Number(value) || 0)
}

async function resumePlayback() {
  try {
    await player.resume()
    lt.needsTap = false
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '播放失败', 'danger')
  }
}

async function changeSong() {
  if (!player.currentTrack) return
  if (lt.changeToCurrentTrack()) await toast('已切换房间歌曲')
  else await toast(lt.error || '当前无法控制播放', 'warning')
}

function addCurrentToQueue() {
  if (!player.currentTrack) return
  lt.addCurrentToQueue()
  void toast('已加入房间队列')
}

function requestCurrentTrack() {
  if (!player.currentTrack) return
  lt.requestCurrentTrack()
  void toast('点歌请求已发送')
}

/* ============================================================
 *  聊天：@ 提及 / 引用 / 复制 / 分享链接
 *  规则集中在 services/listenTogetherChat.ts，页面只负责交互与渲染。
 * ============================================================ */

/** IonTextarea 的宿主元素里才有真正的 <textarea>（光标位置要靠它）。 */
function textareaElement(): HTMLTextAreaElement | null {
  const host = chatInput.value?.$el as HTMLElement | undefined
  return host?.querySelector?.('textarea') ?? null
}

function refreshMentionContext(): void {
  const element = textareaElement()
  const cursor = element ? element.selectionStart : chatDraft.value.length
  const found = findMentionQuery(chatDraft.value, cursor)
  mentionQuery.value = found ? found.query : null
}

function onChatInput() {
  refreshMentionContext()
}

/** 候选项在 blur 之后才收到点击，延后关闭浮层，否则点不到人。 */
function onChatBlur() {
  setTimeout(() => {
    mentionQuery.value = null
  }, 160)
}

function onChatScroll(event: Event) {
  const element = event.target as HTMLElement
  stickToBottom.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 80
}

function pickMention(member: RoomMember) {
  const nickname = String(member.nickname || '')
  if (!nickname) return
  const element = textareaElement()
  const cursor = element ? element.selectionStart : chatDraft.value.length
  const found = findMentionQuery(chatDraft.value, cursor)
  const at = found ? found.at : chatDraft.value.length
  const before = chatDraft.value.slice(0, at)
  const after = chatDraft.value.slice(cursor)
  const insert = '@' + nickname + ' '
  chatDraft.value = before + insert + after
  if (!selectedMentions.value.some((item) => item.userId === member.userId)) {
    selectedMentions.value = [
      ...selectedMentions.value,
      { userId: member.userId, nickname }
    ]
  }
  mentionQuery.value = null
  void nextTick(() => {
    const target = textareaElement()
    if (!target) return
    const position = before.length + insert.length
    target.setSelectionRange(position, position)
    target.focus()
  })
}

function segmentsOf(message: ChatMsg): ChatSegment[] {
  const ids = String(message.meta?.mentions || '')
    .split(',')
    .filter(Boolean)
  return splitMentions(message.content, ids, lt.members, lt.userId)
}

function systemText(message: ChatMsg): string {
  return renderSystemMessage(message.content, message.meta)
}

function shareLinkOf(message: ChatMsg) {
  if (message.type === 'system') return null
  const declared = message.meta?.cardType
  const id = message.meta?.cardId
  if ((declared === 'song' || declared === 'playlist') && id) {
    return { cardType: declared, cardId: id }
  }
  return parseChatShareLink(message.content)
}

function openShareLink(message: ChatMsg) {
  const link = shareLinkOf(message)
  if (!link) return
  const route =
    link.cardType === 'playlist'
      ? '/shared/playlist/' + encodeURIComponent(link.cardId)
      : '/shared/song/' + encodeURIComponent(link.cardId)
  void ionRouter.push(route)
}

function startReply(message: ChatMsg) {
  if (message.type === 'system') return
  replyTo.value = {
    id: message.id,
    from: message.from?.nickname || '某人',
    preview: replyPreview(message.content, message.type, describeChatSticker(message.content))
  }
  void nextTick(() => textareaElement()?.focus())
}

function clearReply() {
  replyTo.value = null
}

function mentionMessageSender(message: ChatMsg) {
  const member = lt.members.find((item) => item.userId === message.from?.userId)
  if (!member) {
    void toast('该成员已不在房间', 'warning')
    return
  }
  const separator = chatDraft.value && !/\s$/.test(chatDraft.value) ? ' ' : ''
  chatDraft.value += separator + '@' + member.nickname + ' '
  if (!selectedMentions.value.some((item) => item.userId === member.userId)) {
    selectedMentions.value = [
      ...selectedMentions.value,
      { userId: member.userId, nickname: String(member.nickname || '') }
    ]
  }
  void nextTick(() => textareaElement()?.focus())
}

function jumpToQuoted(message: ChatMsg) {
  const targetId = message.meta?.replyToId
  if (!targetId) return
  if (!lt.chat.some((item) => item.id === targetId)) {
    void toast('原消息已不可见', 'warning')
    return
  }
  const container = chatList.value
  const target = container?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(targetId)}"]`)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightedMessageId.value = targetId
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightedMessageId.value = ''
    highlightTimer = undefined
  }, 1600)
}

async function copyMessage(message: ChatMsg) {
  const text =
    message.type === 'sticker'
      ? `[贴纸] ${describeChatSticker(message.content)}`
      : message.content
  try {
    await Clipboard.write({ string: text })
    await toast('已复制')
  } catch {
    await toast('复制失败', 'danger')
  }
}

/** 长按/右键菜单：移动端没有 hover，长按是唯一可发现的入口。 */
async function openMessageActions(message: ChatMsg) {
  if (message.type === 'system') return
  const buttons: any[] = [
    { text: '回复', handler: () => startReply(message) },
    { text: '复制', handler: () => void copyMessage(message) }
  ]
  if (message.from?.userId && message.from.userId !== lt.userId) {
    buttons.unshift({ text: '提及 ' + (message.from.nickname || 'TA'), handler: () => mentionMessageSender(message) })
  }
  buttons.push({ text: '取消', role: 'cancel' })
  const sheet = await actionSheetController.create({ header: '消息操作', buttons })
  await sheet.present()
}

function startPress(message: ChatMsg) {
  endPress()
  pressTimer = setTimeout(() => {
    pressTimer = undefined
    void openMessageActions(message)
  }, 480)
}

function endPress() {
  if (!pressTimer) return
  clearTimeout(pressTimer)
  pressTimer = undefined
}

function sendChat() {
  const content = chatDraft.value.trim()
  if (!content) return
  const meta = buildChatMeta({
    content,
    mentions: selectedMentions.value,
    reply: replyTo.value
  })
  if (lt.sendChat(content, 'text', meta)) {
    chatDraft.value = ''
    selectedMentions.value = []
    replyTo.value = null
    mentionQuery.value = null
    stickToBottom.value = true
  } else {
    void toast('尚未连接房间', 'warning')
  }
}

async function openMemberActions(member: RoomMember) {
  const role = lt.memberRole(member)
  const buttons: any[] = []
  if (role === 'member') {
    buttons.push({
      text: '设为管理员',
      handler: () => {
        lt.promote(member.userId)
      }
    })
  } else if (role === 'admin') {
    buttons.push({
      text: '撤销管理员',
      handler: () => {
        lt.demote(member.userId)
      }
    })
  }
  buttons.push({
    text: '移出房间',
    role: 'destructive',
    handler: () => {
      void confirmKick(member)
    }
  })
  buttons.push({ text: '取消', role: 'cancel' })
  const sheet = await actionSheetController.create({
    header: member.nickname || '成员管理',
    buttons
  })
  await sheet.present()
}

async function confirmKick(member: RoomMember) {
  const alert = await alertController.create({
    header: '移出房间？',
    message: '将 ' + (member.nickname || '该成员') + ' 移出一起听房间。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '移出', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  try {
    lt.kick(member.userId)
  } catch (error) {
    await toast(error instanceof Error ? error.message : '移出失败', 'danger')
  }
}

async function confirmLeave() {
  const alert = await alertController.create({
    header: '离开一起听？',
    message: '离开后将停止同步房间播放。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '离开', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  try {
    await lt.leave()
    await toast('已离开房间')
  } catch (error) {
    // 离房要发网络请求；失败时不能静默——用户会以为已经退出了。
    await toast(error instanceof Error ? error.message : '离开房间失败', 'danger')
  }
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}

onMounted(() => {
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 500)
  if (auth.authenticated && !lt.inRoom) {
    void lt.resumeCurrentRoom().then((value) => {
      previousRoom.value = value
    })
  }
})

watch(
  () => lt.chat.length,
  async () => {
    if (!stickToBottom.value) return
    await nextTick()
    const element = chatList.value
    if (element) element.scrollTop = element.scrollHeight
  }
)

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  endPress()
  if (highlightTimer) clearTimeout(highlightTimer)
})
</script>

<style scoped>
.lt-content {
  --background: var(--ceru-bg);
}
.empty {
  padding-top: 120px;
  text-align: center;
  color: var(--ceru-text-secondary);
}
.empty ion-icon {
  font-size: 50px;
  color: var(--ceru-brand);
}
.empty h2 {
  color: var(--ceru-text);
  font-size: 20px;
}
.empty p {
  font-size: 13px;
  line-height: 1.6;
  max-width: 320px;
  margin: 10px auto 18px;
}
.entry {
  padding-top: 34px;
}
.hero-orb {
  width: 76px;
  height: 76px;
  border-radius: 26px;
  display: grid;
  place-items: center;
  font-size: 36px;
  color: var(--ceru-brand);
  background: linear-gradient(135deg, rgba(0, 218, 192, 0.2), rgba(80, 120, 255, 0.16));
  margin-bottom: 17px;
}
.hero-sub {
  margin: 12px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.65;
}
.resume-room {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 20px;
  padding: 12px 13px;
  border: 1px solid rgba(0, 179, 155, 0.24);
  border-radius: 14px;
  background: rgba(0, 179, 155, 0.07);
  color: var(--ceru-text);
  text-align: left;
}
.resume-room > ion-icon:first-child {
  color: var(--ceru-brand);
  font-size: 22px;
}
.resume-room > ion-icon:last-child {
  color: var(--ceru-text-secondary);
}
.resume-room span {
  flex: 1;
  min-width: 0;
}
.resume-room strong,
.resume-room small {
  display: block;
}
.resume-room strong {
  font-size: 13px;
}
.resume-room small {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.entry-segment {
  margin-top: 24px;
}
.entry-panel {
  margin-top: 14px;
  padding: 16px;
}
.field-title {
  margin-bottom: 8px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  font-weight: 650;
}
.entry-input {
  margin-top: 12px;
  --background: var(--ceru-bg);
  --padding-start: 12px;
  --padding-end: 12px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
}
.member-limit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0;
  padding: 4px 0;
  font-size: 13px;
}
.member-limit ion-select {
  max-width: 45%;
  font-size: 13px;
}
.entry-panel ion-button {
  margin-top: 14px;
}
.join-input {
  --background: var(--ceru-bg);
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 10px;
  --padding-bottom: 10px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  font-size: 13px;
}
.join-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 9px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.join-tools strong {
  color: var(--ceru-brand);
}
.join-tools button {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 10px;
  padding: 2px;
  flex: 0 0 auto;
}
.error-box {
  margin: 16px;
  padding: 11px 12px;
  border-radius: 10px;
  background: rgba(229, 72, 77, 0.1);
  color: var(--ceru-danger);
  font-size: 12px;
  line-height: 1.5;
}
.room-head {
  padding-top: 17px;
}
.room-title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.room-title-row > div {
  flex: 1;
  min-width: 0;
}
.room-name {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.room-meta {
  margin: 5px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.code-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--ceru-border);
  border-radius: 999px;
  background: var(--ceru-bg-elevated);
  color: var(--ceru-brand);
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 700;
  flex: 0 0 auto;
}
.connection-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.connection-line .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #25b27b;
}
.connection-line.offline .dot {
  background: var(--ceru-danger);
}
.connection-line button {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 10px;
  padding: 0;
}
.tap-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 16px 0;
  padding: 10px 12px;
  width: calc(100% - 32px);
  border: 1px solid rgba(0, 179, 155, 0.28);
  border-radius: 10px;
  background: rgba(0, 179, 155, 0.08);
  color: var(--ceru-brand);
  font-size: 12px;
  text-align: left;
}
.now-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px;
  padding: 13px;
}
.now-copy {
  min-width: 0;
  flex: 1;
}
.now-label {
  color: var(--ceru-brand);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.now-title {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 750;
}
.now-artist {
  margin-top: 4px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.timeline {
  padding: 0 16px;
}
.seek {
  --bar-background: var(--ceru-bg-soft);
  --bar-background-active: var(--ceru-brand);
  --knob-background: var(--ceru-brand);
  height: 30px;
}
.times {
  display: flex;
  justify-content: space-between;
  color: var(--ceru-text-secondary);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}
.room-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 30px;
  margin-top: 8px;
}
.control-btn,
.main-control {
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  display: grid;
  place-items: center;
}
.control-btn ion-icon {
  font-size: 27px;
}
.control-btn:disabled {
  opacity: 0.35;
}
.main-control {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--ceru-brand);
  color: var(--ceru-brand-contrast);
  font-size: 32px;
}
.main-control:disabled {
  opacity: 0.4;
}
.host-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 15px;
}
.panel-segment {
  margin-top: 20px;
}
.panel {
  padding-top: 10px;
}
.chat-panel {
  padding-left: 12px;
  padding-right: 12px;
}
.chat-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 180px;
  max-height: 420px;
  overflow-y: auto;
  padding: 4px 2px;
}
.panel-empty {
  padding: 40px 14px;
  text-align: center;
  color: var(--ceru-text-secondary);
  font-size: 12px;
}
.chat-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 88%;
}
.chat-message.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.chat-message.system {
  align-self: center;
  max-width: 100%;
  color: var(--ceru-text-secondary);
  font-size: 10px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--ceru-bg-soft);
}
.chat-bubble {
  padding: 8px 11px;
  border-radius: 13px;
  background: var(--ceru-bg-elevated);
  border: 1px solid var(--ceru-border);
  min-width: 0;
}
.chat-message.mine .chat-bubble {
  background: var(--ceru-brand);
  border-color: transparent;
  color: var(--ceru-brand-contrast);
}
.chat-name {
  font-size: 9px;
  font-weight: 650;
  opacity: 0.78;
}
.chat-text {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-message.highlighted .chat-bubble {
  box-shadow: 0 0 0 2px var(--ceru-brand);
}
.chat-quote {
  display: flex;
  gap: 6px;
  align-items: baseline;
  width: 100%;
  margin-top: 5px;
  padding: 5px 7px;
  border: 0;
  border-left: 2px solid currentColor;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.12);
  color: inherit;
  font-size: 10px;
  text-align: left;
  opacity: 0.85;
}
.quote-from {
  flex: 0 0 auto;
  font-weight: 650;
}
.quote-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}
.chat-mention {
  color: var(--ceru-brand);
  font-weight: 650;
}
.chat-message.mine .chat-mention {
  color: inherit;
  text-decoration: underline;
}
.chat-mention.self {
  text-decoration: underline;
}
.chat-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.composer-stack {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mention-popup {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px;
  border: 1px solid var(--ceru-border);
  border-radius: 12px;
  background: var(--ceru-bg-elevated);
}
.mention-option {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 140px;
  padding: 4px 9px 4px 5px;
  border: 1px solid var(--ceru-border);
  border-radius: 999px;
  background: var(--ceru-bg-soft);
  color: var(--ceru-text);
  font-size: 11px;
}
.reply-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border-left: 2px solid var(--ceru-brand);
  border-radius: 8px;
  background: var(--ceru-bg-soft);
}
.reply-chip-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.reply-chip-title {
  color: var(--ceru-brand);
  font-size: 10px;
  font-weight: 650;
}
.reply-chip-preview {
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.reply-chip-close {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  padding: 2px 4px;
}
.chat-input {
  width: 100%;
  max-height: 100px;
  --background: var(--ceru-bg-elevated);
  --padding-start: 11px;
  --padding-end: 11px;
  --padding-top: 8px;
  --padding-bottom: 8px;
  border: 1px solid var(--ceru-border);
  border-radius: 17px;
  font-size: 13px;
}
.chat-composer ion-button {
  --border-radius: 50%;
  width: 40px;
  height: 40px;
  margin: 0;
}
.queue-panel {
  padding-top: 14px;
}
.queue-block + .queue-block {
  margin-top: 20px;
}
.queue-block h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 750;
}
.queue-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 0;
  border-bottom: 1px solid var(--ceru-border);
}
.queue-index {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: var(--ceru-bg-soft);
  color: var(--ceru-text-secondary);
  font-size: 10px;
  flex: 0 0 auto;
}
.queue-copy {
  flex: 1;
  min-width: 0;
}
.queue-title {
  font-size: 13px;
  font-weight: 650;
}
.queue-sub {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.tiny-action {
  border: 0;
  background: transparent;
  color: var(--ceru-brand);
  font-size: 10px;
  padding: 4px;
  flex: 0 0 auto;
}
.tiny-action.ok {
  color: #25b27b;
}
.tiny-action.danger {
  color: var(--ceru-danger);
}
.pending-item {
  opacity: 0.92;
}
.members-panel {
  padding-top: 14px;
}
.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--ceru-border);
}
.member-copy {
  flex: 1;
  min-width: 0;
}
.member-name {
  font-size: 13px;
  font-weight: 650;
}
.member-role {
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.bottom-space {
  height: 120px;
}
</style>
