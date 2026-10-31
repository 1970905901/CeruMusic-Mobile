/**
 * 判断插件要访问的地址是否落在局域网 / 本机范围，对齐桌面端 `requestNetwork`
 * 的 `allowPrivate` 回调：桌面版只有插件声明并获批 `network.private` 时，
 * 才允许访问本机与内网地址。
 *
 * 移动端此前完全不区分——插件只要拿到 `network.request`（或 `network.socket`），
 * 就能扫描 `127.0.0.1`、`192.168.*`、`.local` 等地址，探测用户家里的路由器、
 * 手机上的其它本地服务，甚至通过 WebView 所在的主机访问局域网设备。
 */

/** 严格点分四段 IPv4（0–255），用于 IPv6 尾部的嵌入地址。 */
function dottedIpv4(text: string): number[] | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))
  if (octets.some((value) => !Number.isInteger(value) || value > 255)) return null
  return octets
}

/**
 * IPv4 字面量，含 inet_aton 的 1–3 段简写（`127.1`、`127.0.1`、`2130706433`）。
 *
 * 简写不是学术细节：`http://127.1/` 与 `http://2130706433/` 指向的都是回环地址，
 * 只按「四段」匹配会漏掉它们——插件照样能摸到本机服务。段数决定位宽，
 * 与 inet_aton 一致：1 段 = 32 位，2 段 = 8+24，3 段 = 8+8+16。
 */
function ipv4Literal(text: string): number[] | null {
  if (!/^[\d.]+$/.test(text)) return null
  const parts = text.split('.')
  if (parts.some((part) => part === '')) return null
  const nums = parts.map(Number)
  if (nums.some((value) => !Number.isSafeInteger(value))) return null
  if (parts.length > 4) return null

  let value = 0
  if (parts.length === 1) {
    if (nums[0] > 0xffffffff) return null
    value = nums[0]
  } else if (parts.length === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null
    value = (nums[0] << 24) | nums[1]
  } else if (parts.length === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null
    value = (nums[0] << 24) | (nums[1] << 16) | nums[2]
  } else {
    if (nums.some((item) => item > 0xff)) return null
    value = (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]
  }
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

/**
 * IPv6 字面量 → 八组十六进制。无法解析时返回 null。
 *
 * 尾部嵌入的点分 IPv4（`::ffff:192.168.1.1`）先折成两个十六进制组，
 * 这样 `::` 缩写、大小写、前导零都走同一条路径。
 */
function ipv6Literal(host: string): number[] | null {
  if (!host.includes(':')) return null
  let value = host
  const lastColon = value.lastIndexOf(':')
  const tail = value.slice(lastColon + 1)
  if (tail.includes('.')) {
    const octets = dottedIpv4(tail)
    if (!octets) return null
    const high = octets[0] * 256 + octets[1]
    const low = octets[2] * 256 + octets[3]
    value =
      value.slice(0, lastColon + 1) +
      high.toString(16).padStart(4, '0') +
      ':' +
      low.toString(16).padStart(4, '0')
  }

  const parts = value.split('::')
  if (parts.length > 2) return null
  const parseGroups = (chunk: string): number[] | null => {
    if (!chunk) return []
    const groups: number[] = []
    for (const item of chunk.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null
      groups.push(parseInt(item, 16))
    }
    return groups
  }
  const head = parseGroups(parts[0])
  const rest = parseGroups(parts[1] ?? '')
  if (!head || !rest) return null
  if (parts.length === 1) return head.length === 8 ? head : null
  if (head.length + rest.length > 8) return null
  return [...head, ...Array(8 - head.length - rest.length).fill(0), ...rest]
}

/** 与桌面 `isPrivateAddress` 同一组网段（含 224/8 以上的多播与保留段）。 */
function ipv4Private(octets: number[]): boolean {
  const [a, b] = octets
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10/8
  if (a === 127) return true // 回环
  if (a === 169 && b === 254) return true // 链路本地
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 168) return true // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
  if (a >= 224) return true // 多播与保留段：不是公网目标
  return false
}

/**
 * 是否为内网/本机地址（IPv4、IPv6、以及常见内网主机名）。
 *
 * 先认 IP 字面量、再认主机名——顺序不能反。此前把 `fc` / `fd` 前缀当成
 * 「IPv6 唯一本地地址」去匹配任意字符串，`fdmusic.com`、`fcd.example.org`
 * 这样的公网域名会被判成本机：插件只是访问一个正常音源，却被要求授权
 * 「局域网访问」。反过来 `0:0:0:0:0:0:0:1`、`::ffff:7f00:1` 这类回环写法
 * 又没被认出来，能绕过授权。
 */
export function isPrivateHost(hostname: string): boolean {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true

  const ipv4 = ipv4Literal(host)
  if (ipv4) return ipv4Private(ipv4)

  const ipv6 = ipv6Literal(host)
  if (ipv6) {
    // `::ffff:7f00:1` 是 IPv4 映射形式，按内嵌的 IPv4 判。
    if (
      ipv6[0] === 0 &&
      ipv6[1] === 0 &&
      ipv6[2] === 0 &&
      ipv6[3] === 0 &&
      ipv6[4] === 0 &&
      ipv6[5] === 0xffff
    ) {
      return ipv4Private([
        ipv6[6] >> 8,
        ipv6[6] & 0xff,
        ipv6[7] >> 8,
        ipv6[7] & 0xff
      ])
    }
    // 与桌面同一条粗判据：首组落在 0x2000–0x3fff 才可能是公网
    // （`::1`、`::`、`fe80::`、`fc00::`、`fd00::` 都判为内网）。
    return ipv6[0] < 0x2000 || ipv6[0] >= 0x4000
  }

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  // mDNS / 局域网常见后缀。
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) return true
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
