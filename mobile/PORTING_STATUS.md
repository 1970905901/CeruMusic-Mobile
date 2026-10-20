# Ceru Music Mobile 移植进度交接

> 本文件是给后续 AI/人类开发者的进度快照。它记录“已实现、未实现、验证方式、继续开发入口”，不是功能规格书。

## 当前状态

- 仓库：`1970905901/CeruMusic-Mobile`
- 分支：`main`
- 版本：`2.5.13`
- 最后提交：见 `git log -1`
- 最新 CI：`39380074182`（功能提交 `38e76e2`），Android/iOS 均成功
- 移植目标：iOS 14+（iPhone/iPad）、Android 7.0+（arm64-v8a）
- CI 触发：`.github/workflows/mobile-build.yml`，手动 workflow `Build Ceru Music Mobile`
- 最新产物命名：
  - `CeruMusic-2.5.13-android-arm64.apk`
  - `CeruMusic-2.5.13-ios-unsigned.ipa`

## 架构与约定

- 移动端是独立工程，不启动 Electron 主进程。
- 前端栈：Vue 3 + TypeScript + Ionic Vue + Capacitor 7。
- 插件代码在 Web Worker 中运行，宿主能力通过 JSON RPC 暴露。
- 插件逻辑不直接访问网络、存储、播放器等宿主能力；必须经 Worker -> Host RPC。
- iOS 使用 Ionic iOS 模式、安全区、版本化 CSS 类；不是 SwiftUI/UIKit 原生控件逐版本实现。
- Android 使用 Material 模式；平板/分屏布局在 `src/theme/tablet.css`。
- 不要把 token、Cookie、密码、私钥写进仓库、README、进度文档或日志。

## 已完成能力

### 应用壳
- iOS 14+ 构建，部署目标 `14.0`。
- Android arm64 release APK，targetSdk 35。
- iPhone/iPad 通用布局。
- iPad 分屏/Stage Manager 响应式布局；最短边 ≥ 744px 启用 `ios-tablet`。
- Android 平板/大窗布局；最短边 ≥ 600dp 启用 `android-tablet`。
- 后台播放：iOS `audio` background mode + AVAudioSession；Android 前台媒体服务。
- 锁屏/通知媒体控制。
- iOS/Android 主题、品牌色、深色模式、安全区。
- 基础页面：发现、搜索、音乐库、下载、识别、歌单转换、播放器、设置、插件管理。

### 播放与媒体
- 播放、暂停、上一首、下一首、拖动进度、音量、静音、倍速。
- 播放队列、随机、循环模式。
- 播放队列管理：播放页队列支持拖动排序、单曲移除与一键清空；移除当前歌曲时自动切换相邻歌曲，清空时停止播放。
- 音乐库全部播放与历史管理：收藏列表、本地音乐与最近播放支持“播放全部”与“随机播放”，自动将对应列表设为当前播放上下文；最近播放支持“清空记录”（二次确认）与单曲“从记录中移除”。
- 均衡器与高级音效：10 段图形均衡器、低音增强、环绕混响、声道平衡、响度均衡，基于 Web Audio 实时处理，默认关闭并按设置持久化。
- 歌单排序：本地歌单支持进入排序模式，拖动调整歌曲顺序并持久化。
- 歌单多选与批量操作：歌单详情页支持进入多选模式，支持一键全选/取消全选，底部弹出毛玻璃批量操作栏（播放选中、下一首播放、批量添加到指定/新建歌单、批量加入下载队列，本地歌单专属批量移除歌曲并带二次确认弹窗）。
- 歌单自定义封面、详情编辑与列表即时搜索：本地歌单支持更换自定义封面，内置居中正方形裁剪与质量压缩避免大图膨胀；支持从相册选择新封面或一键恢复默认首曲封面；支持编辑歌单名称与简介并同步至关联云端歌单；歌单详情页支持展开即时搜索栏按歌曲/歌手/专辑过滤；媒体库页面优先呈现自定义封面并支持对收藏和本地歌曲进行即时搜索过滤。
- 歌词渲染、翻译、罗马音、时间偏移。
- 歌曲评论。
- 音频缓存：Cache Storage + IndexedDB 元数据，支持容量、音质上限、命中统计、手动清理。
- 后台播放与媒体会话。

### 文件与导入
- 本地音乐导入。
- 本地音乐扫描过滤：支持按文件大小（默认 100KB）与时长（默认 30s）两层过滤短音频与系统提示音，设置页提供自定义阈值与“不过滤”选项，扫描与 SAF 文件夹导入自动反馈导入与过滤数量。
- Android SAF 导入音频。
- Android SAF 下载目录。
- 下载管理与批量操作：支持下载全部暂停、全部开始、清空队列（含部分已下载临时文件清理）与清空失败/取消记录，配套二次确认弹窗。
- Android SAF 文件分享。
- iOS 文件分享。
- 本地标签编辑：标题、艺术家、专辑、年份、流派、歌词与封面；ID3 / FLAC / MP4 标签写入。
- M4A/MP4 标签写入会修正 `stco/co64` 偏移。
- 分片 MP4 明确拒绝，避免写坏文件。

### 分享
- 后端歌曲分享链接与深链打开。
- 后端歌单分享链接与分页浏览、整单导入、播放。
- 分享歌单多链接批量导入：粘贴多个分享链接，逐个拉取全部分页并导入为本地歌单。
- 后端歌单分享链接创建：本地歌单同步到云歌单后生成 App 内分享链接，支持复制链接与系统分享；网页在线播放待服务端解析模块导出。
- 歌单文件备份：本地歌单导出为加密 .cmpl 文件、复制加密数据到剪贴板，支持从 .cpl / .cmpl 文件导入。
- 插件生成的数据分享链接 `cerumusic://share/v2_...`。
- 插件分享链接只包含歌曲引用、标题、艺术家，不包含插件源码、token、媒体直链。

### 插件系统
- 插件安装、启用、禁用、配置、存储。
- Web / Native / Schema Surface。
- 插件 Worker 运行时与宿主 RPC。
- Guest 兼容子插件。
- 插件网络权限与逐项授权。
- 插件配置、存储、日志。
- 插件菜单：歌曲、播放器、搜索、歌单。
- `playlist.item.actions` 命令与共享 Surface。
- 插件歌单导入器。
- 插件歌词转换器，支持解析与导出。
- 插件周期任务 `ctx.tasks.schedule / cancel`。
- 插件 AI 调用 `ctx.ai.generate`。
- 插件数据分享 `ctx.sharing.create / resolve / revoke`。
- 插件一起听 `ctx.rooms.*`。
- 插件音频设备 `ctx.devices.list / select`，当前只暴露本机系统输出。
- 插件 Socket，支持原生 WebSocket 与 Socket.IO。
- 插件主机事件 `ctx.events.on`，已覆盖 `settings.changed`、`theme.changed`。
- 插件设置访问限制：只能读写公开设置白名单，不能读 AI API key、权限表等内部状态。

### 其他
- 云账号与 Logto。
- 通知与系统通知权限。
- 设置同步。
- 社区。
- AI 助手。
- 一起听。
- 识曲。
- 歌单转换器。
- 主题与设置。

## 验证命令

```bash
cd mobile
npm run typecheck
npm run test
npm run build
```

当前验证结果：

- `npm run typecheck`：通过
- `npm run test`：31 个测试文件，111 个测试全部通过
- `npm run build`：通过
- GitHub CI：Android arm64 APK 与 iOS unsigned IPA 均成功

## 当前未完成

- HTTP/SOCKS5 代理与自定义 CA。
- 每个 iOS 版本一套 SwiftUI/UIKit 原生控件；当前仍是 Ionic iOS 模式 + `ios-14` … `ios-26` 版本化样式。
- iPad Stage Manager / iOS 原生多窗口完整能力；当前只保证分屏与大窗口布局可用。
- 后端歌单分享的网页在线播放（需服务端解析模块导出）；App 内歌单分享链接创建已支持。
- 真机回归仍未系统性完成。

## 真机回归清单

优先级从高到低：

1. Android 播放、后台播放、锁屏控制、通知控制。
2. iOS 14/15/16/17/18/26 播放、后台播放、锁屏控制、通知控制。
3. Android SAF 导入、下载、删除、分享。
4. iOS 文件分享、后台播放、缓存命中率。
5. Android 平板、iOS iPad 分屏与窗口缩放。
6. 插件安装、Surface、歌曲操作、歌词转换、周期任务、AI、一起听、Socket。
7. 真实插件生态兼容性。

## 继续开发入口

- 应用入口：`mobile/src/main.ts`
- 路由：`mobile/src/router/index.ts`
- 插件 Worker：`mobile/src/workers/plugin.worker.ts`
- 插件宿主 RPC：`mobile/src/services/plugin/runtime.ts`
- 插件状态：`mobile/src/stores/plugins.ts`
- 播放器状态：`mobile/src/stores/player.ts`
- 音乐库：`mobile/src/stores/library.ts`
- 下载：`mobile/src/stores/downloads.ts`
- 设置：`mobile/src/stores/settings.ts`
- Android 平板/大窗：`mobile/src/theme/tablet.css`
- iOS 版本类名与样式：`mobile/src/theme/global.css`
- 构建工作流：`.github/workflows/mobile-build.yml`

## 修改与发布约定

1. 每个功能分支/提交保持小步提交。
2. 提交前至少跑 `npm run typecheck`、`npm run test`、`npm run build`。
3. 若改版本号，需同步：
   - `mobile/package.json`
   - `mobile/package-lock.json`
   - `mobile/android/app/build.gradle`
   - `mobile/ios/App/App.xcodeproj/project.pbxproj`
   - `.github/workflows/mobile-build.yml` 中的产物名
4. Android 不在本地构建；统一走 GitHub CI。
5. iOS 仍为未签名 IPA，需要用户证书重签。
6. 不要在文档、代码、日志中写入任何 GitHub token 或用户凭据。

## 已知风险

- 未做系统化真机回归。
- 音效依赖 Web Audio；iOS 后台播放时若 AudioContext 被系统挂起，可能影响音效，需要真机回归确认。
- Android release APK 在没有配置 keystore secret 时使用 debug key。
- iOS IPA 未签名，需要用户重签。
- 插件 WebView 不是操作系统级安全沙箱，只应安装可信插件。
- 缓存、通知、后台播放、SAF 等能力依赖系统行为，需要在多机型上确认。
