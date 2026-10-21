export interface SettingsSearchItem {
  /** DOM 锚点 id，与设置页分组上的 id 对应 */
  id: string
  category: string
  title: string
  description?: string
  keywords: string[]
}

type RawItem = Omit<SettingsSearchItem, 'keywords'> & { keywords?: string[] }

/**
 * 设置搜索索引。
 *
 * 桌面端把索引放在 views/settings/searchIndex.ts；移动端设置页是单文件长列表，
 * 因此这里用「分组锚点 id」代替分区跳转：命中后滚动到对应分组并高亮。
 * 新增设置项时同步补一条，避免搜索漏项。
 */
const rawItems: RawItem[] = [
  { id: 'group-account', category: '账号与社区', title: '账号', description: '登录 Ceru 账号，同步个人资料', keywords: ['登录', 'logto', 'profile', '头像'] },
  { id: 'group-account', category: '账号与社区', title: '消息通知', description: '点赞、回复和系统通知', keywords: ['消息', '通知', '未读', 'notification'] },
  { id: 'group-account', category: '账号与社区', title: '云端设置同步', description: '把偏好同步到云端账号', keywords: ['同步', '云', 'sync', '备份'] },
  { id: 'group-account', category: '账号与社区', title: '立即同步设置', keywords: ['同步', 'sync', '上传'] },
  { id: 'group-account', category: '账号与社区', title: '社区', description: '分享音乐、图片与此刻的心情', keywords: ['动态', '帖子', 'community'] },
  { id: 'group-account', category: '账号与社区', title: '一起听', description: '创建或加入房间，同步播放、聊天与点歌', keywords: ['房间', '同步听', 'room', 'listen together'] },
  { id: 'group-plugin', category: '音源与插件', title: '插件管理', description: '安装、启用与配置插件', keywords: ['插件', 'plugin', '音源'] },
  { id: 'group-plugin', category: '音源与插件', title: '自动更新插件', keywords: ['更新', '插件', 'update'] },
  { id: 'group-plugin', category: '音源与插件', title: '立即检查插件更新', keywords: ['更新', '检查', 'update'] },
  { id: 'group-plugin', category: '音源与插件', title: '音源实现', description: '为相同来源选择由哪个插件提供', keywords: ['路由', '能力', 'provider', 'routing'] },
  { id: 'group-playback', category: '播放', title: '播放器样式', description: '经典黑胶 / 沉浸封面', keywords: ['布局', '黑胶', '唱片', 'layout', 'cd', 'cover'] },
  { id: 'group-playback', category: '播放', title: '首选音质', description: '播放时向插件请求的音质', keywords: ['音质', 'quality', '无损', 'flac', 'hires'] },
  { id: 'group-playback', category: '播放', title: '播放音量', keywords: ['音量', 'volume'] },
  { id: 'group-playback', category: '播放', title: '播放速度', description: '0.5x - 2x 变速播放', keywords: ['倍速', '速度', 'speed', 'rate'] },
  { id: 'group-playback', category: '播放', title: '睡眠定时', keywords: ['定时', '关闭', 'sleep', 'timer'] },
  { id: 'group-playback', category: '播放', title: '均衡器与音效', description: '10 段均衡器、低音增强、环绕与响度均衡', keywords: ['eq', '音效', '低音', '环绕', '响度', 'effects'] },
  { id: 'group-playback', category: '播放', title: '暂停过渡', description: '播放与暂停时音量渐入渐出', keywords: ['渐变', '淡入', '淡出', 'fade'] },
  { id: 'group-playback', category: '播放', title: '无感过渡', description: '尾段安静时刻提前淡化到下一首', keywords: ['交叉淡化', 'crossfade', '过渡', 'seamless'] },
  { id: 'group-playback', category: '播放', title: '音频可视化', description: '播放页显示实时频谱', keywords: ['频谱', '可视化', 'visualizer'] },
  { id: 'group-playback', category: '播放', title: '自动隐藏控制栏', keywords: ['隐藏', '控制栏', 'auto hide'] },
  { id: 'group-playback', category: '播放', title: '系统媒体控件高清封面', keywords: ['锁屏', '通知', '封面', 'smtc', 'hires'] },
  { id: 'group-playback', category: '播放', title: '一起听通知', description: '后台时推送房间聊天与新点歌', keywords: ['一起听', '通知', '后台', 'listen together', 'notify'] },
  { id: 'group-playback', category: '播放', title: '被 @ 时强提醒', keywords: ['提及', 'mention', '强提醒', '通知'] },
  { id: 'group-playback', category: '播放', title: '一起听弹幕', description: '房间聊天飘过播放页', keywords: ['弹幕', 'danmaku', '聊天', '一起听'] },
  { id: 'group-playback', category: '播放', title: '弹幕速度', keywords: ['弹幕', '速度', 'danmaku', 'speed'] },
  { id: 'group-playback', category: '播放', title: '弹幕字号', keywords: ['弹幕', '字号', '字体', 'danmaku', 'font'] },
  { id: 'group-cache', category: '音频缓存', title: '离线播放缓存', keywords: ['缓存', 'cache', '离线'] },
  { id: 'group-cache', category: '音频缓存', title: '缓存容量上限', description: '超出后按频率与最近使用清理', keywords: ['容量', '大小', 'cache', 'limit'] },
  { id: 'group-cache', category: '音频缓存', title: '缓存音质上限', description: '高于上限的音质不缓存', keywords: ['音质', '缓存', 'quality'] },
  { id: 'group-cache', category: '音频缓存', title: '已用空间', description: '查看与清理已缓存的音频', keywords: ['清理', '空间', 'cache', 'clear'] },
  { id: 'group-lyric', category: '歌词', title: '歌词字号', keywords: ['字体', '大小', 'font', 'size'] },
  { id: 'group-lyric', category: '歌词', title: '歌词字号倍率', keywords: ['倍率', '缩放', 'font', 'scale'] },
  { id: 'group-lyric', category: '歌词', title: '歌词字重', keywords: ['字重', '粗体', 'font', 'weight'] },
  { id: 'group-lyric', category: '歌词', title: '显示翻译', keywords: ['翻译', 'translation'] },
  { id: 'group-lyric', category: '歌词', title: '显示音译', keywords: ['音译', '罗马音', 'romanization'] },
  { id: 'group-lyric', category: '歌词', title: '歌词动效', keywords: ['动画', '发光', 'animate'] },
  { id: 'group-lyric', category: '歌词', title: '跳动歌词', keywords: ['跳动', '弹跳', 'jump'] },
  { id: 'group-lyric', category: '歌词', title: '跳转时逐行错开', keywords: ['错开', 'stagger', 'seek'] },
  { id: 'group-lyric', category: '歌词', title: '使用 Apple 风格歌词', keywords: ['apple', '逐字', '扫光', 'karaoke'] },
  { id: 'group-lyric', category: '歌词', title: '沉浸色歌词', keywords: ['取色', '封面主色', '沉浸'] },
  { id: 'group-lyric', category: '歌词', title: '歌词模糊效果', keywords: ['模糊', 'blur'] },
  { id: 'group-lyric', category: '歌词', title: '过滤歌词信息', description: '隐藏作词、作曲、编曲等制作信息行', keywords: ['过滤', '作词', '作曲', 'filter'] },
  { id: 'group-lyric', category: '歌词', title: '严格过滤模式', keywords: ['严格', '冒号', 'filter'] },
  { id: 'group-lyric', category: '歌词', title: '歌词偏移', description: '全局歌词时间轴偏移', keywords: ['偏移', 'offset', '延迟'] },
  { id: 'group-lyric', category: '歌词', title: '单曲歌词微调缓存', keywords: ['微调', '校准', 'offset', '清空'] },
  { id: 'group-lyric', category: '歌词', title: '播放器背景动效', keywords: ['背景', '动效', '呼吸'] },
  { id: 'group-lyric', category: '歌词', title: '背景渲染器', keywords: ['渲染器', '网格渐变', '四色渐变', 'renderer'] },
  { id: 'group-lyric', category: '歌词', title: '背景随鼓点', keywords: ['鼓点', '节拍', 'beat'] },
  { id: 'group-storage', category: '下载与存储', title: '下载音质', keywords: ['下载', '音质', 'download', 'quality'] },
  { id: 'group-storage', category: '下载与存储', title: '同时下载', description: '并发下载任务数', keywords: ['并发', '任务', 'download'] },
  { id: 'group-storage', category: '下载与存储', title: '下载位置', keywords: ['目录', '文件夹', 'sd', 'directory'] },
  { id: 'group-storage', category: '下载与存储', title: '下载子目录', keywords: ['子目录', 'folder'] },
  { id: 'group-storage', category: '下载与存储', title: '选择 Android 文件夹', keywords: ['saf', '文件夹', '授权'] },
  { id: 'group-storage', category: '下载与存储', title: '下载管理', keywords: ['队列', '任务', 'download'] },
  { id: 'group-storage', category: '下载与存储', title: '清除已完成下载', keywords: ['清理', '删除', 'download'] },
  { id: 'group-storage', category: '下载与存储', title: '下载文件名', description: '文件名模板', keywords: ['命名', '模板', 'filename', 'template'] },
  { id: 'group-storage', category: '下载与存储', title: '写入音频标签', keywords: ['标签', 'tag', 'id3', '元数据'] },
  { id: 'group-local', category: '本地音乐', title: '扫描 Documents 目录', keywords: ['本地', '扫描', 'scan', '导入'] },
  { id: 'group-local', category: '本地音乐', title: '从 Android 文件夹导入', keywords: ['saf', '导入', '本地'] },
  { id: 'group-local', category: '本地音乐', title: '过滤过小音频', keywords: ['过滤', '大小', 'filter'] },
  { id: 'group-local', category: '本地音乐', title: '过滤短音频', keywords: ['过滤', '时长', 'filter'] },
  { id: 'group-appearance', category: '外观', title: '主题', keywords: ['深色', '浅色', '暗色', 'theme', 'dark', 'light'] },
  { id: 'group-appearance', category: '外观', title: '强调色', keywords: ['颜色', '主题色', 'accent', 'color'] },
  { id: 'group-wallpaper', category: '外观', title: '启用全局背景', keywords: ['壁纸', '背景', 'wallpaper', 'background'] },
  { id: 'group-wallpaper', category: '外观', title: '背景文件', description: '选择或更换图片 / 视频壁纸', keywords: ['壁纸', '图片', '视频', 'wallpaper'] },
  { id: 'group-wallpaper', category: '外观', title: '移除背景', keywords: ['壁纸', '删除', 'wallpaper'] },
  { id: 'group-wallpaper', category: '外观', title: '不透明度', keywords: ['透明度', '壁纸', 'opacity'] },
  { id: 'group-wallpaper', category: '外观', title: '模糊度', keywords: ['模糊', '壁纸', 'blur'] },
  { id: 'group-wallpaper', category: '外观', title: '亮度', keywords: ['明暗', '壁纸', 'brightness'] },
  { id: 'group-tools', category: '工具', title: 'AI 音乐助手', keywords: ['ai', '助手', 'deepseek'] },
  { id: 'group-tools', category: '工具', title: '听歌识曲', keywords: ['识别', '录音', 'recognize'] },
  { id: 'group-tools', category: '工具', title: '歌单转换器', keywords: ['转换', 'lxmc', 'cpl'] },
  { id: 'group-about', category: '关于', title: '澜音 Ceru Music', description: '版本信息', keywords: ['版本', 'version', 'about'] },
  { id: 'group-about', category: '关于', title: '项目主页', keywords: ['github', '源码', '仓库'] },
  { id: 'group-about', category: '关于', title: '插件文档', keywords: ['文档', 'docs', '插件'] },
  { id: 'group-about', category: '关于', title: '法律与隐私', keywords: ['协议', '隐私', 'license', 'eula'] }
]

export const settingsSearchItems: SettingsSearchItem[] = rawItems.map((item) => ({
  ...item,
  keywords: item.keywords ?? []
}))

/**
 * 桌面端 utils/search.ts 的等价实现：大小写不敏感的子串匹配，
 * 外加短查询（2-4 字符）的顺序字符模糊匹配。中文没有拼音字典，拼音靠 keywords 显式补充。
 */
export function matchSettingsText(text: string, query: string): boolean {
  if (!text || !query) return false
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  if (haystack.includes(needle)) return true

  let textIndex = 0
  let queryIndex = 0
  while (textIndex < haystack.length && queryIndex < needle.length) {
    if (haystack[textIndex] === needle[queryIndex]) queryIndex += 1
    textIndex += 1
  }
  return queryIndex === needle.length && needle.length > 1 && needle.length < 5
}

/** 标题 / 描述 / 关键词 / 分组任一命中即保留，顺序沿用索引声明顺序。 */
export function searchSettings(
  query: string,
  items: SettingsSearchItem[] = settingsSearchItems
): SettingsSearchItem[] {
  const keyword = query.trim()
  if (!keyword) return []
  return items.filter(
    (item) =>
      matchSettingsText(item.title, keyword) ||
      (!!item.description && matchSettingsText(item.description, keyword)) ||
      item.keywords.some((word) => matchSettingsText(word, keyword)) ||
      matchSettingsText(item.category, keyword)
  )
}

/** 「最近使用」最多保留的条目数，与桌面端 SettingsSearch.vue 的 MAX_RECENT 一致。 */
export const MAX_RECENT_SEARCHES = 5

/** 把一次选择提到最前，去重并截断。 */
export function pushRecentSearch(
  list: string[],
  id: string,
  max: number = MAX_RECENT_SEARCHES
): string[] {
  if (!id) return list.slice(0, max)
  return [id, ...list.filter((entry) => entry !== id)].slice(0, max)
}

/**
 * 清洗持久化的「最近使用」记录：丢弃非字符串、已从索引中移除或重复的 id，
 * 再按原顺序截断。记录损坏时返回空数组，不影响搜索本身。
 */
export function normalizeRecentSearches(
  raw: unknown,
  knownIds: Set<string> = new Set(settingsSearchItems.map((item) => item.id))
): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || !knownIds.has(entry) || out.includes(entry)) continue
    out.push(entry)
    if (out.length >= MAX_RECENT_SEARCHES) break
  }
  return out
}
