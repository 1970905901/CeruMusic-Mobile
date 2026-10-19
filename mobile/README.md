# 澜音 Ceru Music · Mobile

这是 Ceru Music 的 iOS / Android 移植工程，独立于仓库根目录的 Electron 桌面端。

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
- 本地歌曲标签编辑：应用内标题、艺术家、专辑可编辑；MP3 写回 ID3v2.3，FLAC 写回 Vorbis Comments，M4A/MP4 写回 `ilst`，封面与歌词在存在时一并写入。
- 下载文件名模板：支持 `{title}`、`{artist}`、`{album}`、`{quality}`、`{ext}`，自动处理非法字符和重名文件。
- 下载标签写入：可选在 MP3、FLAC、M4A/MP4 下载完成后写入标题、艺术家和专辑；M4A 写入会同步修正 `stco/co64` 偏移。
- 插件系统通知：插件调用 `ui.notify` 时，原生端请求通知权限并显示系统通知；未授权时回退到应用内提示。
- 歌曲评论：播放页支持热门/最新评论、分页加载、回复展开、图片查看与插件错误重试。
- 云分享：歌曲分享支持 1–7 天有效期、插件解析模块指纹检查与显式上传确认、歌词/热评打包、复制链接和系统分享；cerumusic://share/<id> 可直达分享详情页。
- 洛雪兼容子插件：Guest 脚本在沙箱 iframe 中运行，网络权限逐项确认，脚本 SHA-256 校验并在 IndexedDB 持久化。
- iOS 版本外观类名：根据运行中的 iOS 主版本添加 `ios-14` … `ios-26`、`ios-legacy`、`ios-modern`、`ios-liquid`，用于版本差异化外壳样式。
- iPad 宽屏布局：内容区宽度限制、弹窗宽度和歌单网格列数在大屏设备上自适应。

> 说明：iOS 版本差异化目前是 Ionic 外壳上的版本类名与样式分支，不是 SwiftUI/UIKit 原生控件级的逐版本实现。其余剩余边界见下方“当前版本边界”。

## 工具与插件 UI 更新

- 听歌识曲：支持麦克风录制最多 12 秒，或上传音频；使用 AFP 指纹模块生成指纹，并调用插件的 `recognize` 命令。识别结果可直接搜索并播放。
- 歌单转换器：支持桌面端 `.json` / `.lxmc` 歌单，生成并分享 Ceru Music `.cpl` 文件。
- 插件进度 UI：`ui.progress.create / update / close` 现在会显示可更新的进度卡片，不再是无操作占位。
- 权限：iOS 已增加麦克风用途说明，Android 已增加 `RECORD_AUDIO` 权限。
## 权限与安全边界

- iOS NSAllowsArbitraryLoads 与 Android usesCleartextTraffic=true 是为了支持用户自建、局域网或插件指定的 HTTP 音乐服务；发布到 App Store 时请按审核要求收紧。
- 插件代码在 Worker 中运行，但 WebView 不是操作系统级安全沙箱。只安装你信任的插件。
- 不要在插件、日志或分享内容中放入 token、Cookie、密码或私钥。

## 当前版本边界

已实现的移动端能力包括：插件安装/启用与管理、Web/Native/Schema Surface、Guest 兼容子插件、Home/Settings/Sidebar/Playlist 贡献入口、插件账号、搜索、播放、歌词、歌曲评论、后端歌曲分享链接与深链打开、队列、收藏、歌单、本地导入、下载、识别、歌单转换、社区、AI 助手、一起听、通知、云账号与 Logto、主题与设置。

以下能力仍待后续里程碑完成，界面上不会伪装成可用：

- 后端歌单分享链接（依赖云歌单）与分享链接批量导入
- `uiExtensions` 的 `playlist.item.actions` 内嵌与 slot 级样式；应用级样式与菜单贡献已接入
- 自动缓存容量管理、HTTP/SOCKS5 代理与自定义 CA
- Android SAF 任意目录授权；iPad Stage Manager、原生多窗口与原生分屏
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
