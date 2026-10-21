import { alertController } from '@ionic/vue'
import type { SelfHarmSupport } from '@/services/communityApi'

/**
 * 自伤信号命中时的援助提示（桌面端 `utils/communitySupport.ts` 的移动端等价实现）。
 *
 * 后端口径：文本审核判定 `action='review'` 时，发帖 / 编辑 / 评论的响应会带 `support`。
 * 这里刻意用弹窗而不是 toast —— 一闪而过的提示等于没提示。
 * 发帖、编辑与评论三处共用本实现，避免同一业务规则在多处各写一份。
 */
export function buildSupportMessage(support: Pick<SelfHarmSupport, 'text' | 'hotline'>): string {
  return support.text + (support.hotline ? '\n\n心理援助热线：' + support.hotline : '')
}

export async function showSupportNotice(support?: SelfHarmSupport | null): Promise<void> {
  if (!support?.title) return
  const alert = await alertController.create({
    header: support.title,
    message: buildSupportMessage(support),
    buttons: ['我知道了']
  })
  await alert.present()
}
