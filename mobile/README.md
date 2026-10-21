# 澜音 Ceru Music · Mobile

这是 Ceru Music 的 iOS / Android 移植工程，独立于仓库根目录的 Electron 桌面端。\n\n> 移植进度、已完成能力、待办与继续开发入口见 [PORTING_STATUS.md](./PORTING_STATUS.md)。

- iOS：iPhone + iPad，部署目标 **iOS 14.0**，使用 Ionic iOS 视觉模式、安全区、系统字体、系统分享、后台音频与锁屏媒体控制。
- Android：Material 视觉模式，**arm64-v8a** release APK，Android 7.0（API 23）及以上。
- 业务：Vue 3 + TypeScript + Ionic Vue，Capacitor 7。移动端不启动 Electron 主进程。

## 构建

~~~bash
cd mobile
npm ci
npm run build
npx cap sync android
npx cap sync ios
~~~

### Android

本地需要 JDK 21、Android SDK Platform 35、Build-Tools 35.0.0。

~~~bash
cd mobile/android
./gradlew assembleRelease
~~~

产物：

~~~text
mobile/android/app/build/outputs/apk/release/app-release.apk
~~~

仓库自带 GitHub Actions 工作流：.github/workflows/mobile-build.yml。手动触发 **Build Ceru Music Mobile** 即可得到：

~~~text
CeruMusic-2.3.3-android-arm64.apk
CeruMusic-2.3.3-ios-unsigned.ipa
~~~

未提供签名 secret 时，release APK 使用 Android debug key 签名，可直接侧载安装。生产发布请配置：

- ANDROID_KEYSTORE_BASE64
- ANDROID_STORE_PASSWORD
- ANDROID_KEY_ALIAS
- ANDROID_KEY_PASSWORD

### iOS

iOS 编译必须在 macOS + Xcode 上完成。工作流会在 macos-15 runner 上执行 pod install 并编译 iPhone/iPad 通用设备包。

~~~bash
cd mobile/ios/App
pod install
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS'
~~~

未配置 Apple 签名时，CI 产物是 **unsigned .ipa**，需要用你自己的证书/描述文件通过 Sideloadly、AltStore 或企业签名工具重签。要生成可直接安装的签名 IPA，请在仓库 Secrets 中配置 Apple 证书和描述文件，并在 xcodebuild archive / -exportArchive 步骤中填入你的 Team ID 与导出方式。iOS 14.0 的部署目标已写入 Podfile 和 Xcode 工程。

## 目录

~~~text
mobile/
├── src/
│   ├── services/plugin/       # v2 插件解析、Worker 运行时、宿主 RPC
│   ├── workers/plugin.worker.ts
│   ├── stores/                # 插件、播放器、音乐库、下载、设置
│   ├── views/                 # 发现、搜索、音乐库、播放器、设置、插件详情
│   └── theme/                 # iOS / Android 自适应主题
├── android/
├── ios/
├── resources/                 # 图标与启动图
└── public/
~~~

## 插件运行方式

插件仍然是用户提供的 Ceru v2 plugin.js，不内置任何音乐源。

1. 应用解析静态 exports.manifest 头部，不执行头部。
2. 插件逻辑在独立 Web Worker 中执行，通过 JSON RPC 使用宿主的网络、存储、播放器、库、下载等服务。
3. 网络与文件权限在首次使用时逐项询问；可在插件详情中全部允许或清除授权。
4. 插件配置、存储与已启用状态保存在本机 IndexedDB。
5. 支持 tracks.search / resolve / lyrics / artwork / artworkHires、播放列表、排行榜、命令、歌单导入、歌词转换等 v2 协议。
6. 未签名插件可安装；签名文件会显示“未签名/签名存在”，移动端不做发布者信任背书。

## 移动端能力映射

| 桌面端能力 | 移动端实现 |
| --- | --- |
| Electron 主进程 IPC | Web Worker + 宿主 RPC |
| 本地文件、下载目录 | Capacitor Filesystem + 系统文件选择器 |
| 系统媒体控件 | Media Session（Android 通知栏 / iOS 锁屏与耳机控制） |
| 后台播放 | iOS UIBackgroundModes: audio + AVAudioSession；Android 前台媒体服务 |
| 桌面歌词、托盘、全局快捷键、DLNA、系统音频采集 | 不适用于手机；以锁屏控制、分享、本地导入替代 |
| 自动更新 | 由应用商店/侧载更新取代 |

## 本轮新增能力

- 播放速度：0.5×、0.75×、1×、1.25×、1.5×、2×；播放页和设置页均可切换，并随播放器状态持久化。
- 本地目录扫描：扫描应用 `Documents` 目录（Android 额外扫描应用外部目录），递归识别常见音频格式并按文件路径/大小去重。
- Android SAF 导入：通过系统目录选择器授权任意文件夹，流式复制音频到应用私有目录后复用现有标签解析、去重与曲库入库；临时文件导入后清理。
- 本地歌曲标签编辑：应用内可编辑标题、艺术家、专辑、年份、流派与歌词，并支持选择/更换/移除封面；MP3 写回 ID3v2.3，FLAC 写回 Vorbis Comments，M4A/MP4 写回 `ilst`，封面与歌词一并写入。
- 下载文件名模板：支持 `{title}`、`{artist}`、`{album}`、`{quality}`、`{ext}`，自动处理非法字符和重名文件。
- 下载标签写入：可选在 MP3、FLAC、M4A/MP4 下载完成后写入标题、艺术家和专辑；M4A 写入会同步修正 `stco/co64` 偏移。
- 下载管理与批量操作：下载页支持“全部开始”、“全部暂停”、“清空队列”与“清空失败”，清空队列与失败记录具备二次确认弹窗，并实时联动任务状态禁用操作。
- 插件系统通知：插件调用 `ui.notify` 时，原生端请求通知权限并显示系统通知；未授权时回退到应用内提示。
- 歌曲评论：播放页支持热门/最新评论、分页加载、回复展开、图片查看与插件错误重试。
- 云分享：歌曲分享支持 1–7 天有效期、插件解析模块指纹检查与显式上传确认、歌词/热评打包、复制链接和系统分享；cerumusic://share/<id> 可直达分享详情页。
- 歌单云分享：本地歌单同步到云端后生成 App 内分享链接，支持复制链接与系统分享；网页在线播放暂未开放。
- 歌单文件备份：本地歌单导出为加密 .cmpl 文件、复制加密数据到剪贴板，支持从 .cpl / .cmpl 文件导入。
- 均衡器与高级音效：设置页新增音效入口，提供 10 段图形均衡器、低音增强、环绕混响、声道平衡与响度均衡；基于 Web Audio 实时处理本机播放，默认关闭，状态持久化。
- 歌单排序：本地歌单支持进入排序模式，拖动右侧手柄调整歌曲顺序并自动保存。
- 播放队列管理：播放页队列支持拖动排序、单曲移除与一键清空；移除当前播放歌曲时会自动切到相邻歌曲，清空会停止播放。
- 音乐库批量播放与历史管理：音乐库中的收藏、本地音乐与最近播放列表均支持“播放全部”与“随机”播放；最近播放支持一键清空播放记录与单曲从历史记录中移除。
- 洛雪兼容子插件：Guest 脚本在沙箱 iframe 中运行，网络权限逐项确认，脚本 SHA-256 校验并在 IndexedDB 持久化。
- iOS 版本外观类名：根据运行中的 iOS 主版本添加 `ios-14` … `ios-26`、`ios-legacy`、`ios-modern`、`ios-liquid`，用于版本差异化外壳样式。
- iPad 宽屏布局：内容区宽度限制、弹窗宽度和歌单网格列数在大屏设备上自适应。
- Android 平板/大屏：最短边 ≥ 600dp 时启用平板布局，浮动 Material 导航栏、1180px 内容区、四列发现卡片、六列歌单网格、播放页双栏；横竖屏与分屏窗口缩放会实时切换；AndroidManifest 声明
esizeableActivity 与大屏支持。
- 设置搜索：设置页搜索栏支持按中英文关键词、别名与分组名检索 11 个设置分组，空查询显示本地持久化的最近使用记录，可键盘上下键与回车跳转，选中后自动滚动并高亮目标分组。
- 请求竞态守卫：新增 `services/requestGuard.ts`，播放页切歌、评论面板分页、搜索与发现页联想/榜单、社区分类切换、分类页与远程歌单详情共用同一套「结果是否仍有效」判定，慢返回的旧请求不再覆盖当前内容。
- 后台降载：新增 `services/appVisibility.ts`，合并原生 `appStateChange` 与 `document.hidden` 判定应用前后台；切后台时暂停播放页背景呼吸动画、低频鼓点采样、音频可视化与全局视频壁纸解码，回到前台自动恢复。后台播放与系统媒体控件不受影响。
- 社区图片按需缩放：新增 `services/ossImage.ts`（与桌面端同源），社区列表与评论图片走 `ossCard`、详情大图走 `ossDetail`、头像走 `ossAvatar`，减少移动网络下的原图流量；非 OSS 域名保持原样。
- 援助提示统一：新增 `services/communitySupport.ts`，发帖、编辑与评论命中自伤风险信号时统一弹窗（含心理援助热线），不再在两个页面各写一份。
- 分享歌单分页保护：按新增歌曲数统计进度，连续两页无新增即停止，避免音源返回重复页时提前结束或空转。
- 路由预加载：首屏后空闲时按标签顺序预拉页面分包，切后台自动暂停，可在设置 → 播放中关闭。

> 说明：iOS 版本差异化目前是 Ionic 外壳上的版本类名与样式分支，不是 SwiftUI/UIKit 原生控件级的逐版本实现。其余剩余边界见下方“当前版本边界”。

## 工具与插件 UI 更新

- 听歌识曲：支持麦克风录制最多 12 秒，或上传音频；使用 AFP 指纹模块生成指纹，并调用插件的 `recognize` 命令。识别结果可直接搜索并播放。
- 歌单转换器：支持桌面端 `.json` / `.lxmc` 歌单，生成并分享 Ceru Music `.cpl` 文件。
- 插件进度 UI：`ui.progress.create / update / close` 现在会显示可更新的进度卡片，不再是无操作占位。
- 分享歌单批量导入：支持粘贴一个或多个分享链接，逐个按分页拉取整张歌单后导入为本地歌单。
- 权限：iOS 已增加麦克风用途说明，Android 已增加 `RECORD_AUDIO` 权限。
## 权限与安全边界

- iOS NSAllowsArbitraryLoads 与 Android usesCleartextTraffic=true 是为了支持用户自建、局域网或插件指定的 HTTP 音乐服务；发布到 App Store 时请按审核要求收紧。
- 插件代码在 Worker 中运行，但 WebView 不是操作系统级安全沙箱。只安装你信任的插件。
- 不要在插件、日志或分享内容中放入 token、Cookie、密码或私钥。

## 当前版本边界

已实现的移动端能力包括：插件安装/启用与管理、Web/Native/Schema Surface、Guest 兼容子插件、Home/Settings/Sidebar/Playlist 贡献入口、playlist.item.actions 命令与共享 Surface、插件歌单导入器、歌词转换器、插件周期任务、插件 AI 调用、插件数据分享链接、插件一起听、插件音频设备、插件主机事件、插件 Socket、插件账号、搜索、播放、均衡器与音效、歌词、歌曲评论、后端歌曲分享、歌单分享创建（App 内导入）、歌单文件导入导出与深链打开、队列、收藏、歌单、本地导入、下载、识别、歌单转换、社区、AI 助手、一起听、通知、云账号与 Logto、主题与设置。

以下能力仍待后续里程碑完成，界面上不会伪装成可用：

- 后端歌单分享的网页在线播放（需服务端解析模块导出）

- HTTP/SOCKS5 代理与自定义 CA
- iPad Stage Manager 与 iOS 原生多窗口/分屏（Android/iPad 已支持分屏与大窗口布局，Android SAF 导入/下载已接入）
- 每个 iOS 版本一套 SwiftUI/UIKit 原生控件（当前为 Ionic iOS 模式、安全区与 `ios-14` … `ios-26` 版本化样式）

DLNA、桌面歌词、全局快捷键、托盘、系统音频采集仍属于桌面专属能力，不以移动端占位界面伪装实现。

## 验证

~~~bash
cd mobile
npm run typecheck
npm run test
npm run build
~~~

Android release 构建已在 Windows 上实际完成并通过 apksigner verify。iOS 工程已完成静态配置检查；最终 Swift 编译由 GitHub Actions 的 macOS runner 执行。
