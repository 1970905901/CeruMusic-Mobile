/**
 * 判断插件要访问的地址是否落在局域网 / 本机范围，对齐桌面端 `requestNetwork`
 * 的 `allowPrivate` 回调：桌面版只有插件声明并获批 `network.private` 时，
 * 才允许访问本机与内网地址。
 *
 * 移动端此前完全不区分——插件只要拿到 `network.request`（或 `network.socket`），
 * 就能扫描 `127.0.0.1`、`192.168.*`、`.local` 等地址，探测用户家里的路由器、
 * 手机上的其它本地服务，甚至通过 WebView 所在的主机访问局域网设备。
 */

/** 是否为内网/本机地址（IPv4、IPv6 回环与私有段，以及常见内网主机名）。 */
export function isPrivateHost(hostname: string): boolean {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  // mDNS / 局域网常见后缀。
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return true

  if (host === '::1' || host === '::') return true
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true
  // IPv4 映射的 IPv6 地址（::ffff:192.168.1.1）。
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateHost(mapped[1])

  const parts = host.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((value) => value > 255)) return false
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10/8
  if (a === 127) return true // 回环
  if (a === 169 && b === 254) return true // 链路本地
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 168) return true // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
  return false
}

/** 判据来自 URL 字符串；无法解析时按「私有」处理，宁可拒绝也别放行。 */
export function isPrivateUrl(url: string): boolean {
  try {
    return isPrivateHost(new URL(url).hostname)
  } catch {
    return true
  }
}

/** 给用户看的拒绝文案，与权限名一致。 */
export const PRIVATE_NETWORK_ERROR = '访问局域网或本机地址需要“局域网访问”权限'
