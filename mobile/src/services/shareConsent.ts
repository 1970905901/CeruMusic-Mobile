/**
 * 分享前的合规承诺，对齐桌面版 `Share/ShareConsentBar.vue`。
 *
 * 桌面版要逐条勾选三项（音源合法取得、插件不含破解、自担侵权风险），
 * 全部勾选后把「版本 + 时间戳」写进 localStorage，下次打开折叠成一行
 * 「已于 YYYY/M/D 完成合规承诺」，并可随时「重新查看 / 撤回」。
 *
 * 移动端此前只有一个开关，没有版本、没有时间、也不持久化——每次分享都要重勾，
 * 用户并不知道自己承诺了什么。这里把读写与判定抽成纯函数，界面只负责展示。
 */

/** 承诺条款版本：条款内容变化时 +1，旧记录自动失效并要求重新确认。 */
export const CONSENT_VERSION = 1
export const CONSENT_STORAGE_KEY = 'ceru_share_consent'

export const LEGAL_DOC_URL =
  'https://ceru.docs.shiqianjiang.cn/#%E6%B3%95%E5%BE%8B%E5%A3%B0%E6%98%8E%E4%B8%8E%E5%85%8D%E8%B4%A3%E6%9D%A1%E6%AC%BE'

export interface ConsentRecord {
  version: number
  /** ISO 时间串。 */
  timestamp: string
}

/**
 * 解析存储里的记录。版本不符、结构不对、时间不可解析都视为无效——
 * 宁要求重新确认，也不要拿一份来路不明的记录默认「已同意」。
 */
export function readConsentRecord(raw: string | null, now = Date.now()): ConsentRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.version !== CONSENT_VERSION) return null
    if (typeof parsed.timestamp !== 'string') return null
    const time = new Date(parsed.timestamp).getTime()
    if (!Number.isFinite(time)) return null
    // 未来时间说明是脏数据（时钟被改过或人工写入），同样要求重新确认。
    if (time > now + 24 * 60 * 60 * 1000) return null
    return { version: CONSENT_VERSION, timestamp: parsed.timestamp }
  } catch {
    return null
  }
}

export function buildConsentRecord(now = new Date()): ConsentRecord {
  return { version: CONSENT_VERSION, timestamp: now.toISOString() }
}

/** `2026/10/22` 形式，与桌面版一致。非法时间为空串。 */
export function formatConsentDate(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

/** 三项条款文案：与桌面版逐字一致，避免两端对同一份承诺给出不同措辞。 */
export const CONSENT_ITEMS = [
  '该插件及音源由我合法取得或已获得授权',
  '该插件不包含破解、绕过正版平台验证的代码',
  '我了解侵权风险由我个人承担'
] as const

/** 只有在三项全部勾选后才算完成承诺。 */
export function consentComplete(checks: readonly boolean[]): boolean {
  return checks.length === CONSENT_ITEMS.length && checks.every(Boolean)
}
