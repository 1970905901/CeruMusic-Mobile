/**
 * 歌单加载失败时给用户看的说明。
 *
 * 音源插件抛上来的错误原样显示没有意义：`fetch failed`、`Cannot read properties of
 * undefined`、`429` 这些是给开发者看的，用户看不懂也不知道下一步该做什么。桌面版
 * `utils/playlist/loadError.ts` 早就把这几类错误翻成了可执行的动作，移动端此前一直
 * 直接把 `error.message` 打进页面，同一张加载不出来的歌单，两边说法完全不同。
 *
 * 规则按「用户能做什么」归类，顺序不能随意调换：权限问题里常常同时带着连接失败的字样
 * （先授权才能连），限流信息里也常带 timeout，所以最具体、最能指向操作的规则排在最前。
 * 这里保持与桌面版同一套判定，判定不出时给中性的建议，不把内部实现细节暴露出去。
 */

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return String(error ?? '')
}

export function playlistLoadErrorMessage(error: unknown): string {
  const reason = describe(error)
  // 移动端插件未安装/未启用时，音源层直接抛中文提示；不拦下来会被兜底文案盖掉，
  // 用户看到「稍后重试」却永远重试不好。
  if (/未安装|未启用|找不到该.*插件|请先安装/i.test(reason)) {
    return '当前音源没有可用的插件，请先在设置中安装并启用音源插件后重试。'
  }
  if (/权限|未授权|permission|not authorized/i.test(reason)) {
    return '当前音源缺少访问权限，请在设置的插件权限中允许后重试。'
  }
  if (/429|限流|频繁|rate.limit/i.test(reason)) {
    return '平台请求较多，请稍等片刻再试。'
  }
  if (/404|不存在|已删除|私密|公开|无法访问/i.test(reason)) {
    return '暂时无法访问这张歌单，请确认歌单仍存在且已公开。'
  }
  if (/timeout|timed.out|超时|network|fetch|网络|断开|连接/i.test(reason)) {
    return '暂时连接不上音乐服务，请检查网络后重试。'
  }
  if (/Cannot read|undefined|null|TypeError|SyntaxError|数据|格式|结构/i.test(reason)) {
    return '音源暂时未能读取这张歌单，请重试或更换音源插件。'
  }
  return '这张歌单暂时无法加载，请稍后重试或更换音源插件。'
}
