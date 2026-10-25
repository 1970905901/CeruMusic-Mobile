<template>
  <ion-modal
    class="first-run-modal"
    :is-open="open"
    :backdrop-dismiss="false"
    @didDismiss="$emit('acknowledged')"
  >
    <div class="notice ceru-pad">
      <h2>欢迎使用澜音 Ceru Music</h2>
      <p>本软件完全免费，代码已开源。</p>
      <p>
        开源地址：
        <a
          href="https://github.com/timeshiftsauce/CeruMusic"
          @click.prevent="openExternal('https://github.com/timeshiftsauce/CeruMusic')"
          >GitHub</a
        >
      </p>
      <p>唯一交流 QQ 群：<span class="highlight">951962664</span></p>

      <div class="divider" />

      <p>软件开发的初衷仅是对新技术的学习与研究，直至停止维护都会保持纯净。</p>
      <p>原始发布地址只有 GitHub 和 QQ 群，其他渠道均为第三方转载，可信度请自行鉴别。</p>
      <p class="warning">
        本项目没有微博、抖音、小红书等「官方账号」，也没有在任何下载站或应用商店发布同名应用，谨防被骗！
      </p>
      <p class="warning">
        若使用中遇到广告或引流（加群关注公众号才能使用/升级），说明你运行的是「第三方修改版」。
      </p>
      <p class="warning">本软件不对用户数据安全性做任何担保，请自行备份重要数据。</p>
      <p class="more">
        拓展阅读：
        <a
          href="https://ceru.docs.shiqianjiang.cn/#%E6%B3%95%E5%BE%8B%E5%A3%B0%E6%98%8E%E4%B8%8E%E5%85%8D%E8%B4%A3%E6%9D%A1%E6%AC%BE"
          @click.prevent="openLegal"
        >
          法律声明与免责条款
        </a>
      </p>

      <ion-button expand="block" size="large" class="ack-btn" @click="confirm">
        我已了解，开始使用
      </ion-button>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonModal } from '@ionic/vue'
import { Browser } from '@capacitor/browser'

defineProps<{ open?: boolean }>()
const emit = defineEmits<{ acknowledged: [] }>()

/** 与桌面版同一个 localStorage 键：两端各自首启各弹一次，不会重复打扰。 */
const STORAGE_KEY = 'ceru_music_has_seen_first_run_notice_tips'

function openExternal(url: string) {
  void Browser.open({ url })
}

function openLegal() {
  openExternal(
    'https://ceru.docs.shiqianjiang.cn/#%E6%B3%95%E5%BE%8B%E5%A3%B0%E6%98%8E%E4%B8%8E%E5%85%8D%E8%B4%A3%E6%9D%A1%E6%AC%BE'
  )
}

function confirm() {
  localStorage.setItem(STORAGE_KEY, 'true')
  emit('acknowledged')
}
</script>

<style scoped>
.first-run-modal {
  --border-radius: 20px;
}
.notice {
  height: 100%;
  overflow-y: auto;
  padding-top: max(24px, env(safe-area-inset-top));
}
.notice h2 {
  margin: 0 0 14px;
  font-size: 18px;
  text-align: center;
  color: var(--ceru-text);
}
.notice p {
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ceru-text-secondary);
}
.notice a {
  color: var(--ceru-brand);
  text-decoration: underline;
}
.highlight {
  color: var(--ceru-text);
  font-weight: 600;
}
.divider {
  height: 1px;
  margin: 14px 0;
  background: var(--ceru-border);
}
.warning {
  color: var(--ion-color-danger, #d54941);
}
.more {
  margin-top: 12px;
}
.ack-btn {
  margin-top: 18px;
}
</style>
