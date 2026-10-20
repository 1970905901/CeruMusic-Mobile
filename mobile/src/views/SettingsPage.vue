<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>设置</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="settings-head ceru-pad">
        <p class="eyebrow">CERU MUSIC</p>
        <h1 class="ceru-title">按你的方式听</h1>
        <p class="head-sub">插件、音质、外观与本地数据都保存在这台设备上。</p>
        <SettingsSearchBar @select="handleSearchSelect" />
      </div>

      <ion-list id="group-account" class="group">
        <div class="group-title">账号与社区</div>
        <ion-item button detail @click="$router.push('/account')">
          <ion-icon slot="start" :icon="personCircleOutline" color="primary" />
          <ion-label>
            <h2>账号</h2>
            <p>{{ auth.authenticated ? auth.displayName : '登录 Ceru 账号，同步个人资料' }}</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/notifications')">
          <ion-icon slot="start" :icon="notificationsOutline" color="primary" />
          <ion-label>
            <h2>消息通知</h2>
            <p>{{ notifications.counts.all ? notifications.counts.all + ' 条未读' : '点赞、回复和系统通知' }}</p>
          </ion-label>
          <ion-badge v-if="notifications.counts.all" color="danger">{{ notifications.counts.all > 99 ? '99+' : notifications.counts.all }}</ion-badge>
        </ion-item>
        <ion-item v-if="auth.authenticated">
          <ion-icon slot="start" :icon="cloudDoneOutline" color="primary" />
          <ion-label>
            <h2>云端设置同步</h2>
            <p>{{ syncStatusText }}</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.cloudSyncEnabled"
            @ionChange="settings.settings.cloudSyncEnabled = $event.detail.checked"
          />
        </ion-item>
        <ion-item v-if="auth.authenticated" button :disabled="settingsSyncState.status === 'checking' || settingsSyncState.status === 'uploading'" @click="syncNow">
          <ion-icon slot="start" :icon="syncOutline" color="primary" />
          <ion-label>
            <h2>立即同步设置</h2>
            <p>主题、音质、下载偏好与播放模式</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/community')">
          <ion-icon slot="start" :icon="peopleOutline" color="primary" />
          <ion-label>
            <h2>社区</h2>
            <p>分享音乐、图片与此刻的心情</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/listen-together')">
          <ion-icon slot="start" :icon="headsetOutline" color="primary" />
          <ion-label>
            <h2>一起听</h2>
            <p>创建或加入房间，同步播放、聊天与点歌</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list id="group-plugin" class="group">
        <div class="group-title">音源与插件</div>

        <ion-item button detail @click="$router.push('/tabs/plugins')">
          <ion-icon slot="start" :icon="extensionPuzzleOutline" color="primary" />
          <ion-label>
            <h2>插件管理</h2>
            <p>{{ pluginStore.enabledPlugins.length }} 个已启用 · {{ pluginStore.plugins.length }} 个已安装</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="syncOutline" color="primary" />
          <ion-label>
            <h2>自动更新插件</h2>
            <p>启动时检查有来源 URL 的插件并安装新版本</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.autoUpdatePlugins"
            @ionChange="settings.settings.autoUpdatePlugins = $event.detail.checked"
          />
        </ion-item>
        <ion-item button :disabled="checkingUpdates || !pluginStore.plugins.some((plugin) => plugin.sourceUrl)" @click="checkPluginUpdates">
          <ion-icon slot="start" :icon="cloudDownloadOutline" color="primary" />
          <ion-label>
            <h2>{{ checkingUpdates ? '正在检查…' : '立即检查插件更新' }}</h2>
            <p>{{ pluginStore.plugins.filter((plugin) => plugin.sourceUrl).length }} 个插件可检查</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="pluginStore.sources.length" button detail @click="openSourceRouting">
          <ion-icon slot="start" :icon="gitNetworkOutline" color="primary" />
          <ion-label>
            <h2>音源实现</h2>
            <p>为相同来源选择由哪个插件提供</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="pluginPages.length" class="group">
        <div class="group-title">插件页面</div>
        <ion-item v-for="page in pluginPages" :key="page.key" button detail @click="openPluginPage(page)">
          <ion-icon slot="start" :icon="albumsOutline" color="primary" />
          <ion-label>
            <h2>{{ page.title }}</h2>
            <p>{{ page.pluginName }}<span v-if="page.group"> · {{ page.group }}</span></p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list id="group-playback" class="group">
        <div class="group-title">播放</div>
        <ion-item>
          <ion-icon slot="start" :icon="albumsOutline" color="primary" />
          <ion-label>
            <h2>播放器样式</h2>
            <p>{{ settings.settings.playerLayout === 'cd' ? '经典黑胶：旋转唱片与唱针' : '沉浸封面：大封面搭配封面光晕' }}</p>
          </ion-label>
          <ion-segment
            :value="settings.settings.playerLayout"
            @ionChange="setPlayerLayout($event.detail.value)"
          >
            <ion-segment-button value="cd">经典黑胶</ion-segment-button>
            <ion-segment-button value="cover">沉浸封面</ion-segment-button>
          </ion-segment>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="sparklesOutline" color="primary" />
          <ion-label>
            <h2>首选音质</h2>
            <p>{{ preferredQualityDescription }}</p>
          </ion-label>
          <ion-select
            v-model="settings.settings.preferredQuality"
            interface="action-sheet"
            cancel-text="取消"
          >
            <ion-select-option
              v-for="option in preferredQualityOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="volumeHighOutline" color="primary" />
          <ion-label>
            <h2>播放音量</h2>
            <p>{{ Math.round(player.volume * 100) }}%</p>
          </ion-label>
          <ion-range
            :value="player.volume"
            :min="0"
            :max="1"
            :step="0.01"
            @ionInput="player.setVolume(Number($event.detail.value))"
          />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="speedometerOutline" color="primary" />
          <ion-label>
            <h2>播放速度</h2>
            <p>当前 {{ player.playbackRate }}×</p>
          </ion-label>
          <ion-select
            :value="player.playbackRate"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="setPlaybackRate($event.detail.value)"
          >
            <ion-select-option :value="0.5">0.5×</ion-select-option>
            <ion-select-option :value="0.75">0.75×</ion-select-option>
            <ion-select-option :value="1">1×（正常）</ion-select-option>
            <ion-select-option :value="1.25">1.25×</ion-select-option>
            <ion-select-option :value="1.5">1.5×</ion-select-option>
            <ion-select-option :value="2">2×</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="moonOutline" color="primary" />
          <ion-label>
            <h2>睡眠定时</h2>
            <p>{{ sleepLabel }}</p>
          </ion-label>
          <ion-select
            :value="settings.settings.sleepTimerMinutes ?? 0"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="setSleep($event.detail.value)"
          >
            <ion-select-option :value="0">关闭</ion-select-option>
            <ion-select-option :value="15">15 分钟</ion-select-option>
            <ion-select-option :value="30">30 分钟</ion-select-option>
            <ion-select-option :value="60">60 分钟</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item button detail @click="openAudioEffects">
          <ion-icon slot="start" :icon="optionsOutline" color="primary" />
          <ion-label>
            <h2>均衡器与音效</h2>
            <p>10 段均衡器、低音增强、环绕与响度均衡</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="swapHorizontalOutline" color="primary" />
          <ion-label>
            <h2>暂停过渡</h2>
            <p>播放与暂停时音量渐入渐出，一起听房间内自动关闭</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.pauseTransition" @ionChange="settings.settings.pauseTransition = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="syncOutline" color="primary" />
          <ion-label>
            <h2>无感过渡</h2>
            <p>尾段安静时刻提前淡化到下一首，剩余 12 秒保底触发；一起听房间内自动关闭</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.seamlessTransition" @ionChange="settings.settings.seamlessTransition = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="pulseOutline" color="primary" />
          <ion-label>
            <h2>音频可视化</h2>
            <p>播放页以封面主色显示实时频谱；需要音频走同源代理，关闭可省电</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.audioVisualizer" @ionChange="settings.settings.audioVisualizer = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="eyeOffOutline" color="primary" />
          <ion-label>
            <h2>自动隐藏控制栏</h2>
            <p>播放中 3 秒无操作后淡出播放控制与底部操作栏</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.autoHideControls" @ionChange="settings.settings.autoHideControls = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="headsetOutline" color="primary" />
          <ion-label>
            <h2>系统媒体控件高清封面</h2>
            <p>锁屏与通知卡片改用插件高清封面协议取大图，需插件支持</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.smtcHiresCover" @ionChange="settings.settings.smtcHiresCover = $event.detail.checked" />
        </ion-item>
      </ion-list>

      <ion-list id="group-cache" class="group">
        <div class="group-title">音频缓存</div>
        <ion-item>
          <ion-icon slot="start" :icon="layersOutline" color="primary" />
          <ion-label>
            <h2>离线播放缓存</h2>
            <p>{{ cacheStats.supported ? '播放过的歌曲可重复快速加载' : '当前 WebView 不支持' }}</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.audioCacheEnabled"
            :disabled="!cacheStats.supported"
            @ionChange="settings.settings.audioCacheEnabled = $event.detail.checked"
          />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="downloadOutline" color="primary" />
          <ion-label>
            <h2>缓存容量上限</h2>
            <p>超出后自动按频率与最近使用清理</p>
          </ion-label>
          <ion-select
            :value="settings.settings.audioCacheMaxBytes"
            :disabled="!cacheStats.supported"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="changeAudioCacheLimit(Number($event.detail.value))"
          >
            <ion-select-option :value="268435456">256 MB</ion-select-option>
            <ion-select-option :value="536870912">512 MB</ion-select-option>
            <ion-select-option :value="1073741824">1 GB</ion-select-option>
            <ion-select-option :value="2147483648">2 GB</ion-select-option>
            <ion-select-option :value="4294967296">4 GB</ion-select-option>
            <ion-select-option :value="8589934592">8 GB</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="pricetagOutline" color="primary" />
          <ion-label>
            <h2>缓存音质上限</h2>
            <p>高于上限的音质不缓存</p>
          </ion-label>
          <ion-select
            :value="settings.settings.audioCacheMaxQuality"
            :disabled="!cacheStats.supported"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="settings.settings.audioCacheMaxQuality = $event.detail.value"
          >
            <ion-select-option
              v-for="option in cacheQualityOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="informationCircleOutline" color="primary" />
          <ion-label>
            <h2>已用空间</h2>
            <p>{{ cacheStats.supported ? formatCacheSize(cacheStats.sizeBytes) + ' · ' + cacheStats.entries + ' 项' : '不支持' }}</p>
          </ion-label>
          <ion-button fill="outline" size="small" :disabled="clearingCache || !cacheStats.entries" @click="clearAudioCache">
            清理
          </ion-button>
        </ion-item>
      </ion-list>

      <ion-list id="group-lyric" class="group">
        <div class="group-title">歌词</div>
        <ion-item>
          <ion-icon slot="start" :icon="textOutline" color="primary" />
          <ion-label>
            <h2>歌词字号</h2>
            <p>{{ settings.settings.lyricFontSize }} px</p>
          </ion-label>
          <ion-range :value="settings.settings.lyricFontSize" :min="16" :max="34" :step="1" @ionInput="settings.settings.lyricFontSize = Number($event.detail.value)" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="languageOutline" color="primary" />
          <ion-label>
            <h2>显示翻译</h2>
            <p>歌词包含翻译时同时显示</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricShowTranslation" @ionChange="settings.settings.lyricShowTranslation = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="globeOutline" color="primary" />
          <ion-label>
            <h2>显示音译</h2>
            <p>歌词包含罗马音时同时显示</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricShowRomanization" @ionChange="settings.settings.lyricShowRomanization = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="sparklesOutline" color="primary" />
          <ion-label>
            <h2>歌词动效</h2>
            <p>当前句跳动与发光</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricAnimate" @ionChange="settings.settings.lyricAnimate = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="sparklesOutline" color="primary" />
          <ion-label>
            <h2>跳动歌词</h2>
            <p>当前句按行长时间起跳并回弹，占用更高性能</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricJump" @ionChange="settings.settings.lyricJump = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="optionsOutline" color="primary" />
          <ion-label>
            <h2>跳转时逐行错开</h2>
            <p>跳转后各行错开过渡，关闭则同时过渡</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricSeekStagger" @ionChange="settings.settings.lyricSeekStagger = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="musicalNotesOutline" color="primary" />
          <ion-label>
            <h2>使用 Apple 风格歌词</h2>
            <p>当前句按行时间推进逐字扫过效果</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricAppleStyle" @ionChange="settings.settings.lyricAppleStyle = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="colorPaletteOutline" color="primary" />
          <ion-label>
            <h2>沉浸色歌词</h2>
            <p>当前句歌词取封面主色调的浅色版本</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricImmersiveColor" @ionChange="settings.settings.lyricImmersiveColor = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="eyeOffOutline" color="primary" />
          <ion-label>
            <h2>歌词模糊效果</h2>
            <p>离当前句越远的歌词越模糊</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricBlur" @ionChange="settings.settings.lyricBlur = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="optionsOutline" color="primary" />
          <ion-label>
            <h2>过滤歌词信息</h2>
            <p>隐藏作词、作曲、编曲等制作信息行</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricFilterInfo" @ionChange="settings.settings.lyricFilterInfo = $event.detail.checked" />
        </ion-item>
        <ion-item v-if="settings.settings.lyricFilterInfo">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" color="primary" />
          <ion-label>
            <h2>严格过滤模式</h2>
            <p>含冒号的行都会隐藏，可能误伤歌词</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.lyricStrictFilter" @ionChange="settings.settings.lyricStrictFilter = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="timerOutline" color="primary" />
          <ion-label>
            <h2>歌词偏移</h2>
            <p>{{ formatLyricOffset(settings.settings.lyricOffsetMs) }}</p>
          </ion-label>
          <ion-select :value="settings.settings.lyricOffsetMs" interface="action-sheet" cancel-text="取消" @ionChange="settings.settings.lyricOffsetMs = Number($event.detail.value)">
            <ion-select-option :value="-2000">-2.0 秒</ion-select-option>
            <ion-select-option :value="-1000">-1.0 秒</ion-select-option>
            <ion-select-option :value="-500">-0.5 秒</ion-select-option>
            <ion-select-option :value="0">不偏移</ion-select-option>
            <ion-select-option :value="500">+0.5 秒</ion-select-option>
            <ion-select-option :value="1000">+1.0 秒</ion-select-option>
            <ion-select-option :value="2000">+2.0 秒</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="timerOutline" color="primary" />
          <ion-label>
            <h2>单曲歌词微调缓存</h2>
            <p>{{ lyricExtras.adjustedCount > 0 ? '已独立校准 ' + lyricExtras.adjustedCount + ' 首歌曲' : '暂无单曲校准记录' }}</p>
          </ion-label>
          <ion-button
            v-if="lyricExtras.adjustedCount > 0"
            slot="end"
            size="small"
            fill="outline"
            color="danger"
            @click="clearLyricOffsets"
          >
            清空
          </ion-button>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="colorWandOutline" color="primary" />
          <ion-label>
            <h2>播放器背景动效</h2>
            <p>封面光晕缓慢呼吸</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.playerBackgroundAnimation" @ionChange="settings.settings.playerBackgroundAnimation = $event.detail.checked" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="colorPaletteOutline" color="primary" />
          <ion-label>
            <h2>背景渲染器</h2>
            <p>{{ backgroundRendererDescription }}</p>
          </ion-label>
          <ion-select
            :value="settings.settings.playerBackgroundRenderer"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="settings.setBackgroundRenderer($event.detail.value)"
          >
            <ion-select-option v-for="renderer in backgroundRenderers" :key="renderer.value" :value="renderer.value">
              {{ renderer.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item v-if="backgroundSupportsBeat(settings.settings.playerBackgroundRenderer)">
          <ion-icon slot="start" :icon="pulseOutline" color="primary" />
          <ion-label>
            <h2>背景随鼓点</h2>
            <p>低频驱动背景缩放与明暗变化，需要音频走同源代理</p>
          </ion-label>
          <ion-toggle :checked="settings.settings.playerBackgroundBeat" @ionChange="settings.settings.playerBackgroundBeat = $event.detail.checked" />
        </ion-item>
      </ion-list>

      <ion-list id="group-storage" class="group">
        <div class="group-title">下载与存储</div>
        <ion-item>
          <ion-icon slot="start" :icon="cloudDownloadOutline" color="primary" />
          <ion-label>
            <h2>下载音质</h2>
            <p>下载队列会使用该音质请求插件</p>
          </ion-label>
          <ion-select
            v-model="settings.settings.downloadQuality"
            interface="action-sheet"
            cancel-text="取消"
          >
            <ion-select-option
              v-for="option in downloadQualityOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="layersOutline" color="primary" />
          <ion-label>
            <h2>同时下载</h2>
            <p>最多 {{ settings.settings.maxConcurrentDownloads }} 个任务</p>
          </ion-label>
          <ion-range
            :value="settings.settings.maxConcurrentDownloads"
            :min="1"
            :max="4"
            :step="1"
            @ionInput="settings.settings.maxConcurrentDownloads = Number($event.detail.value)"
          />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="folderOpenOutline" color="primary" />
          <ion-label>
            <h2>下载位置</h2>
            <p>{{ downloadLocationLabel }}</p>
          </ion-label>
          <ion-select
            :value="settings.settings.downloadDirectoryMode"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="changeDownloadDirectory($event.detail.value)"
          >
            <ion-select-option value="data">应用私有目录</ion-select-option>
            <ion-select-option value="documents">Documents（文件 App）</ion-select-option>
            <ion-select-option v-if="safAvailable" value="saf">Android 授权文件夹</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item v-if="settings.settings.downloadDirectoryMode === 'documents'" button @click="editDownloadSubfolder">
          <ion-icon slot="start" :icon="createOutline" color="primary" />
          <ion-label>
            <h2>下载子目录</h2>
            <p>{{ settings.settings.downloadSubfolder }}</p>
          </ion-label>
        </ion-item>
        <ion-item v-if="settings.settings.downloadDirectoryMode === 'saf'" button :disabled="choosingSafDownload" @click="chooseSafDownloadFolder">
          <ion-icon slot="start" :icon="albumsOutline" color="primary" />
          <ion-label>
            <h2>选择 Android 文件夹</h2>
            <p>{{ settings.settings.safDownloadName || '未选择' }}</p>
          </ion-label>
          <ion-spinner v-if="choosingSafDownload" name="crescent" />
        </ion-item>
        <ion-item button detail @click="$router.push('/downloads')">
          <ion-icon slot="start" :icon="downloadOutline" color="primary" />
          <ion-label>
            <h2>下载管理</h2>
            <p>{{ downloadStore.tasks.length }} 个任务 · {{ downloadStore.completed.length }} 个已完成</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="clearDownloads">
          <ion-icon slot="start" :icon="trashOutline" color="danger" />
          <ion-label color="danger">
            <h2>清除已完成下载</h2>
            <p>同时删除应用内下载文件</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="editFilenameTemplate">
          <ion-icon slot="start" :icon="documentTextOutline" color="primary" />
          <ion-label>
            <h2>下载文件名</h2>
            <p>{{ settings.settings.downloadFilenameTemplate }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="pricetagOutline" color="primary" />
          <ion-label>
            <h2>写入音频标签</h2>
            <p>MP3 / FLAC 下载完成后写入标题、艺术家和专辑</p>
          </ion-label>
          <ion-toggle
            :checked="settings.settings.downloadWriteTags"
            @ionChange="settings.settings.downloadWriteTags = $event.detail.checked"
          />
        </ion-item>
      </ion-list>

      <ion-list id="group-local" class="group">
        <div class="group-title">本地音乐</div>
        <ion-item button :disabled="library.importingLocal" @click="scanLocal">
          <ion-icon slot="start" :icon="folderOpenOutline" color="primary" />
          <ion-label>
            <h2>扫描 Documents 目录</h2>
            <p>识别放入应用文档目录的音频文件，自动去重</p>
          </ion-label>
          <ion-spinner v-if="library.importingLocal" name="crescent" />
        </ion-item>
        <ion-item
          v-if="safAvailable"
          button
          :disabled="safImporting || library.importingLocal"
          @click="importSaf"
        >
          <ion-icon slot="start" :icon="albumsOutline" color="primary" />
          <ion-label>
            <h2>从 Android 文件夹导入</h2>
            <p>{{ safImporting || safProgress ? safProgress || '正在导入…' : '通过系统目录选择器导入任意文件夹' }}</p>
          </ion-label>
          <ion-spinner v-if="safImporting" name="crescent" />
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="optionsOutline" color="primary" />
          <ion-label>
            <h2>过滤过小音频</h2>
            <p>扫描时忽略小于设定大小的文件</p>
          </ion-label>
          <ion-select
            :value="settings.settings.localScanFilterMinSizeKb"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="settings.settings.localScanFilterMinSizeKb = Number($event.detail.value)"
          >
            <ion-select-option :value="0">不过滤</ion-select-option>
            <ion-select-option :value="50">小于 50 KB</ion-select-option>
            <ion-select-option :value="100">小于 100 KB（默认）</ion-select-option>
            <ion-select-option :value="300">小于 300 KB</ion-select-option>
            <ion-select-option :value="500">小于 500 KB</ion-select-option>
            <ion-select-option :value="1024">小于 1 MB</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="timerOutline" color="primary" />
          <ion-label>
            <h2>过滤短音频</h2>
            <p>扫描时忽略短于设定时长的提示音与音效</p>
          </ion-label>
          <ion-select
            :value="settings.settings.localScanFilterMinDurationSec"
            interface="action-sheet"
            cancel-text="取消"
            @ionChange="settings.settings.localScanFilterMinDurationSec = Number($event.detail.value)"
          >
            <ion-select-option :value="0">不过滤</ion-select-option>
            <ion-select-option :value="15">短于 15 秒</ion-select-option>
            <ion-select-option :value="30">短于 30 秒（默认）</ion-select-option>
            <ion-select-option :value="60">短于 60 秒</ion-select-option>
            <ion-select-option :value="120">短于 2 分钟</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-list id="group-appearance" class="group">
        <div class="group-title">外观</div>
        <ion-item>
          <ion-icon slot="start" :icon="colorPaletteOutline" color="primary" />
          <ion-label>
            <h2>主题</h2>
            <p>跟随系统，或固定浅色 / 深色</p>
          </ion-label>
          <ion-segment :value="settings.settings.theme" @ionChange="setTheme($event.detail.value)">
            <ion-segment-button value="system"><ion-label>系统</ion-label></ion-segment-button>
            <ion-segment-button value="light"><ion-label>浅色</ion-label></ion-segment-button>
            <ion-segment-button value="dark"><ion-label>深色</ion-label></ion-segment-button>
          </ion-segment>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" :icon="colorWandOutline" color="primary" />
          <ion-label>
            <h2>强调色</h2>
            <p>用于按钮、进度与高亮</p>
          </ion-label>
        </ion-item>
        <div class="accent-row">
          <button
            v-for="color in accents"
            :key="color"
            class="accent-dot"
            :class="{ active: settings.settings.accent === color }"
            :style="{ background: color }"
            type="button"
            @click="settings.settings.accent = color"
          />
        </div>
      </ion-list>

      <GlobalBackgroundSettings />

      <ion-list id="group-tools" class="group">
        <div class="group-title">工具</div>
        <ion-item button detail @click="$router.push('/ai')">
          <ion-icon slot="start" :icon="sparklesOutline" color="primary" />
          <ion-label>
            <h2>AI 音乐助手</h2>
            <p>推荐音乐、分析歌曲与生成歌单建议</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/recognize')">
          <ion-icon slot="start" :icon="micOutline" color="primary" />
          <ion-label>
            <h2>听歌识曲</h2>
            <p>录制或上传音频，由插件识别歌曲</p>
          </ion-label>
        </ion-item>
        <ion-item button detail @click="$router.push('/playlist-converter')">
          <ion-icon slot="start" :icon="swapHorizontalOutline" color="primary" />
          <ion-label>
            <h2>歌单转换器</h2>
            <p>把 JSON / LXMC 歌单转换为 .cpl</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list id="group-about" class="group">
        <div class="group-title">关于</div>
        <ion-item>
          <ion-icon slot="start" :icon="informationCircleOutline" color="primary" />
          <ion-label>
            <h2>澜音 Ceru Music</h2>
            <p>移动端 v{{ version }} · iOS 14+ / Android arm64</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="openLink('https://github.com/timeshiftsauce/CeruMusic')">
          <ion-icon slot="start" :icon="logoGithub" color="primary" />
          <ion-label>
            <h2>项目主页</h2>
            <p>源代码与 AGPL-3.0 许可证</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="openLink('https://ceru.docs.shiqianjiang.cn')">
          <ion-icon slot="start" :icon="bookOutline" color="primary" />
          <ion-label>
            <h2>插件文档</h2>
            <p>了解 Ceru v2 插件协议</p>
          </ion-label>
        </ion-item>
        <ion-item button @click="showLegal">
          <ion-icon slot="start" :icon="shieldCheckmarkOutline" color="primary" />
          <ion-label>
            <h2>法律与隐私</h2>
            <p>应用不内置音乐源，不存储或分发音乐文件</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <p class="version-note">
        桌面端专属功能（桌面歌词、全局快捷键、托盘、DLNA、系统音频采集）已替换为移动端能力：
        后台播放、锁屏控制、文件导入与系统分享。
      </p>
      <div class="ceru-pad"><PluginSlot slot="settings.sections" /></div>
      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue'
import {
  albumsOutline,
  bookOutline,
  createOutline,
  cloudDownloadOutline,
  documentTextOutline,
  folderOpenOutline,
  colorPaletteOutline,
  globeOutline,
  languageOutline,
  textOutline,
  timerOutline,
  cloudDoneOutline,
  colorWandOutline,
  downloadOutline,
  extensionPuzzleOutline,
  eyeOffOutline,
  gitNetworkOutline,
  headsetOutline,
  informationCircleOutline,
  layersOutline,
  notificationsOutline,
  optionsOutline,
  peopleOutline,
  personCircleOutline,
  logoGithub,
  micOutline,
  moonOutline,
  musicalNotesOutline,
  pricetagOutline,
  pulseOutline,
  shieldCheckmarkOutline,
  speedometerOutline,
  sparklesOutline,
  swapHorizontalOutline,
  syncOutline,
  trashOutline,
  volumeHighOutline
} from 'ionicons/icons'
import { Browser } from '@capacitor/browser'
import { useSettingsStore } from '@/stores/settings'
import { useLyricExtrasStore } from '@/stores/lyricExtras'
import { usePluginStore } from '@/stores/plugins'
import PluginSlot from '@/components/PluginSlot.vue'
import GlobalBackgroundSettings from '@/components/GlobalBackgroundSettings.vue'
import SettingsSearchBar from '@/components/SettingsSearchBar.vue'
import type { SettingsSearchItem } from '@/services/settingsSearch'
import { usePlayerStore } from '@/stores/player'
import { useDownloadStore } from '@/stores/downloads'
import { useLibraryStore } from '@/stores/library'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { checkCloudSettings, settingsSyncState } from '@/services/settingsSync'
import { findPluginUpdates, installPluginUpdate } from '@/services/pluginUpdates'
import {
  clearMediaCache,
  enforceMediaCacheLimit,
  getMediaCacheStats,
  type MediaCacheStats
} from '@/services/mediaCache'
import { importSafFolder, pickSafDirectory, safImportSupported } from '@/services/safImport'
import {
  backgroundRenderers,
  backgroundSupportsBeat,
  getBackgroundRenderer
} from '@/services/backgroundRenderers'
import {
  buildQualitySelectOptions,
  collectQualityTypes,
  getQualityDescription,
  mergeSavedQualityTypes
} from '@/services/qualityNames'

const settings = useSettingsStore()
const pluginStore = usePluginStore()
const player = usePlayerStore()
const lyricExtras = useLyricExtrasStore()
const downloadStore = useDownloadStore()
const library = useLibraryStore()
const auth = useAuthStore()
const notifications = useNotificationsStore()

const safAvailable = safImportSupported()
const safImporting = ref(false)
const safProgress = ref('')
const cacheStats = ref<MediaCacheStats>({ supported: false, entries: 0, sizeBytes: 0 })
const clearingCache = ref(false)
const choosingSafDownload = ref(false)

watch(() => auth.authenticated, (value) => { if (value) void notifications.refreshCounts() }, { immediate: true })
const version = __APP_VERSION__
const accents = ['#00b39b', '#00dac0', '#4f7cff', '#a259ff', '#ff7a45', '#ff5470']

/**
 * 没有启用插件（或插件未声明音质）时的兜底音质。
 * 这里沿用移动端原有的四个常见音质，保证首次安装后下拉依然可用。
 */
const FALLBACK_QUALITY_TYPES = ['128k', '320k', 'flac', 'hires']

/** 已启用插件声明的音质并集，顺序沿用清单声明顺序（低 → 高）。 */
const declaredQualityTypes = computed(() =>
  collectQualityTypes(pluginStore.providers.map((provider) => provider.qualities))
)

const qualityTypes = computed(() =>
  declaredQualityTypes.value.length ? declaredQualityTypes.value : FALLBACK_QUALITY_TYPES
)

/**
 * 已保存的音质可能来自当前已卸载/已禁用的插件。这类值必须保留在选项里，
 * 否则 ion-select 匹配不到会显示空白，用户也看不到自己选的是什么。
 */
const qualityTypesWithSaved = computed(() => {
  return mergeSavedQualityTypes(qualityTypes.value, [
    settings.settings.preferredQuality,
    settings.settings.audioCacheMaxQuality,
    settings.settings.downloadQuality
  ])
})

const preferredQualityOptions = computed(() =>
  buildQualitySelectOptions(qualityTypesWithSaved.value, '自动（最高）')
)

const cacheQualityOptions = computed(() =>
  buildQualitySelectOptions(qualityTypesWithSaved.value, '不限制')
)

const downloadQualityOptions = computed(() =>
  buildQualitySelectOptions(qualityTypesWithSaved.value, '跟随首选音质')
)

const preferredQualityDescription = computed(() => {
  const value = settings.settings.preferredQuality
  return value ? getQualityDescription(value) : '插件支持时优先使用，未指定时取插件最高音质'
})

const pluginPages = computed(() => {
  const pages: Array<{ key: string; title: string; view: string; pluginKey: string; pluginName: string; group?: string }> = []
  const seen = new Set<string>()
  for (const plugin of pluginStore.enabledPlugins) {
    for (const page of plugin.manifest.contributes?.settingsPages || []) {
      const key = plugin.key + ':' + page.view
      if (seen.has(key)) continue
      seen.add(key)
      pages.push({
        key,
        title: page.title,
        view: page.view,
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name
      })
    }
    for (const page of plugin.manifest.contributes?.sidebarItems || []) {
      const key = plugin.key + ':' + page.view
      if (seen.has(key)) continue
      seen.add(key)
      pages.push({
        key,
        title: page.title,
        view: page.view,
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        group: page.group
      })
    }
  }
  return pages
})

function openPluginPage(page: { pluginKey: string; view: string }) {
  void import('@/router').then(({ default: router }) => {
    void router.push(
      '/plugin-surface/' +
        encodeURIComponent(page.pluginKey) +
        '/' +
        encodeURIComponent(page.view)
    )
  })
}

function openAudioEffects() {
  void import('@/router').then(({ default: router }) => {
    void router.push('/audio-effects')
  })
}

const HIGHLIGHT_DURATION_MS = 2000
const HIGHLIGHT_MAX_ATTEMPTS = 20
const HIGHLIGHT_RETRY_MS = 80

/**
 * 命中搜索后滚动到对应分组并高亮一次。
 * 分组是 v-if 渲染的（如「插件页面」），所以找不到时按帧重试，而不是立即放弃。
 */
function scrollToSettingsGroup(id: string, attempt = 0): void {
  const element = document.getElementById(id)
  if (!element) {
    if (attempt < HIGHLIGHT_MAX_ATTEMPTS) {
      setTimeout(() => scrollToSettingsGroup(id, attempt + 1), HIGHLIGHT_RETRY_MS)
    }
    return
  }
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  element.classList.remove('highlight-flash')
  void element.offsetWidth
  element.classList.add('highlight-flash')
  setTimeout(() => element.classList.remove('highlight-flash'), HIGHLIGHT_DURATION_MS)
}

function handleSearchSelect(item: SettingsSearchItem) {
  void nextTick(() => scrollToSettingsGroup(item.id))
}

const checkingUpdates = ref(false)

const syncStatusText = computed(() => {
  const status = settingsSyncState.status
  if (status === 'checking') return '正在检查云端设置…'
  if (status === 'uploading') return '正在上传本机设置…'
  if (status === 'downloading') return '正在应用云端设置…'
  if (status === 'error') return settingsSyncState.message || '同步失败'
  if (!settings.settings.cloudSyncEnabled) return '已关闭自动同步'
  if (settingsSyncState.lastSync) return '上次同步：' + new Date(settingsSyncState.lastSync).toLocaleString()
  return '登录后自动同步'
})

async function syncNow() {
  const ok = await checkCloudSettings(true)
  await toast(ok ? '设置已同步' : settingsSyncState.message || '同步失败', ok ? 'success' : 'danger')
}

const downloadLocationLabel = computed(() => {
  const mode = settings.settings.downloadDirectoryMode
  if (mode === 'documents') return '文件 App / Documents / ' + settings.settings.downloadSubfolder
  if (mode === 'saf') return 'Android 授权文件夹 / ' + (settings.settings.safDownloadName || '未选择')
  return '应用私有目录'
})

const sleepLabel = computed(() => {
  if (!player.sleepRemainingMs) return '关闭'
  const minutes = Math.ceil(player.sleepRemainingMs / 60000)
  return `约 ${minutes} 分钟后暂停`
})

const backgroundRendererDescription = computed(() => {
  const renderer = getBackgroundRenderer(settings.settings.playerBackgroundRenderer)
  return `${renderer.label}：${renderer.description}`
})

function setTheme(value: any) {
  if (value === 'system' || value === 'light' || value === 'dark') settings.setTheme(value)
}

function setPlayerLayout(value: unknown) {
  if (value === 'cd' || value === 'cover') settings.settings.playerLayout = value
}

function setSleep(value: any) {
  const minutes = Number(value) || 0
  player.setSleepTimer(minutes > 0 ? minutes : null)
}

async function clearLyricOffsets() {
  const alert = await alertController.create({
    header: '清空单曲歌词微调',
    message: '确定要清空全部 ' + lyricExtras.adjustedCount + ' 首歌曲的独立时间轴微调记录吗？',
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '清空',
        role: 'destructive',
        handler: () => {
          lyricExtras.clearAllOffsets()
          void toast('已清空单曲歌词微调记录')
        }
      }
    ]
  })
  await alert.present()
}

function formatLyricOffset(value: number): string {
  if (!value) return '不偏移'
  const seconds = Math.abs(value) / 1000
  return (value > 0 ? '+' : '-') + seconds.toFixed(1) + ' 秒'
}

function setPlaybackRate(value: any) {
  player.setPlaybackRate(Number(value) || 1)
}

async function changeDownloadDirectory(value: any) {
  const mode = String(value)
  if (mode !== 'saf') {
    settings.settings.downloadDirectoryMode = mode === 'documents' || mode === 'data' ? mode : 'data'
    return
  }
  if (!safAvailable) {
    await toast('SAF 下载目录仅在 Android 原生环境可用', 'danger')
    return
  }
  const picked = await chooseSafDownloadFolder()
  if (picked) settings.settings.downloadDirectoryMode = 'saf'
}

async function chooseSafDownloadFolder(): Promise<boolean> {
  if (choosingSafDownload.value) return false
  choosingSafDownload.value = true
  try {
    const folder = await pickSafDirectory()
    settings.settings.safDownloadUri = folder.uri
    settings.settings.safDownloadName = folder.name
    settings.settings.downloadDirectoryMode = 'saf'
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('取消')) await toast(message, 'danger')
    return false
  } finally {
    choosingSafDownload.value = false
  }
}

async function editDownloadSubfolder() {
  const alert = await alertController.create({
    header: '下载子目录',
    message: '文件将保存到 Documents 下的该目录。',
    inputs: [
      {
        name: 'folder',
        type: 'text',
        value: settings.settings.downloadSubfolder,
        placeholder: 'CeruMusic'
      }
    ],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const folder = String(data?.values?.folder ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim().replace(/[<>:\"|?*]/g, ''))
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
  settings.settings.downloadSubfolder = folder || 'CeruMusic'
}

async function editFilenameTemplate() {
  const alert = await alertController.create({
    header: '下载文件名模板',
    message: '可用变量：{title} {artist} {album} {quality} {ext}',
    inputs: [
      {
        name: 'template',
        type: 'text',
        value: settings.settings.downloadFilenameTemplate
      }
    ],
    buttons: [
      {
        text: '恢复默认',
        handler: () => {
          settings.settings.downloadFilenameTemplate = '{artist} - {title}'
        }
      },
      { text: '取消', role: 'cancel' },
      { text: '保存', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return
  const template = String(data?.values?.template ?? '').trim()
  if (template) settings.settings.downloadFilenameTemplate = template
}

async function scanLocal() {
  try {
    const records = await library.scanLocalMusic()
    const filtered = (records.filteredSizeCount || 0) + (records.filteredDurationCount || 0)
    if (records.length) {
      const filterTip = filtered ? ` (已过滤 ${filtered} 个短音频)` : ''
      await toast(`已导入 ${records.length} 首本地歌曲${filterTip}`)
    } else if (filtered) {
      await toast(`没有发现新的歌曲 (已过滤 ${filtered} 个短音频)`)
    } else {
      await toast('没有发现新的音频文件')
    }
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

function formatCacheSize(value: number): string {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function refreshCacheStats() {
  try {
    cacheStats.value = await getMediaCacheStats()
  } catch {
    cacheStats.value = { supported: false, entries: 0, sizeBytes: 0 }
  }
}

async function changeAudioCacheLimit(value: number) {
  const limit = Math.max(0, Number(value) || 0)
  settings.settings.audioCacheMaxBytes = limit
  try {
    await enforceMediaCacheLimit(limit)
  } catch (error) {
    await toast(error instanceof Error ? error.message : '清理缓存失败', 'danger')
  } finally {
    await refreshCacheStats()
  }
}

async function clearAudioCache() {
  if (clearingCache.value) return
  clearingCache.value = true
  try {
    const result = await clearMediaCache()
    await toast(`已清理 ${result.deleted} 项缓存`)
  } catch (error) {
    await toast(error instanceof Error ? error.message : '清理缓存失败', 'danger')
  } finally {
    await refreshCacheStats()
    clearingCache.value = false
  }
}

async function importSaf() {
  if (safImporting.value || library.importingLocal) return
  safImporting.value = true
  safProgress.value = ''
  try {
    const result = await importSafFolder((message) => {
      safProgress.value = message
    })
    if (result.imported || result.failed) {
      const parts = [`已导入 ${result.imported} 首`]
      if (result.skipped) parts.push(`跳过/过滤 ${result.skipped} 首`)
      if (result.failed) parts.push(`失败 ${result.failed} 首`)
      await toast(parts.join('，'), result.failed ? 'danger' : 'medium')
    } else if (result.skipped) {
      await toast(`所选文件夹没有新的歌曲 (已跳过/过滤 ${result.skipped} 首)`)
    } else {
      await toast('所选文件夹没有新的音频文件')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await toast(message, message.includes('取消') ? 'medium' : 'danger')
  } finally {
    safImporting.value = false
    safProgress.value = ''
  }
}

async function checkPluginUpdates() {
  if (checkingUpdates.value) return
  checkingUpdates.value = true
  try {
    const updates = await findPluginUpdates()
    if (!updates.length) {
      await toast('所有插件都是最新版本')
      return
    }
    const alert = await alertController.create({
      header: '发现插件更新',
      message: updates
        .map((item) => item.name + '：' + item.currentVersion + ' → ' + item.version)
        .join('\n'),
      buttons: [
        { text: '稍后', role: 'cancel' },
        { text: '全部更新', role: 'confirm' }
      ]
    })
    await alert.present()
    const { role } = await alert.onDidDismiss()
    if (role !== 'confirm') return
    for (const update of updates) await installPluginUpdate(update)
    await toast('插件已更新')
  } catch (error) {
    await toast(error instanceof Error ? error.message : '检查更新失败', 'danger')
  } finally {
    checkingUpdates.value = false
  }
}

async function openSourceRouting() {
  const sheet = await actionSheetController.create({
    header: '音源实现',
    buttons: [
      ...pluginStore.sources.map((source) => ({
        text: `${source.name}${source.implementations.length > 1 ? ` (${source.implementations.length})` : ''}`,
        handler: () => {
          void chooseImplementation(source)
        }
      })),
      { text: '关闭', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function chooseImplementation(source: any) {
  const sheet = await actionSheetController.create({
    header: source.name,
    buttons: [
      ...source.implementations.map((implementation: any) => ({
        text: implementation.pluginName,
        handler: () => {
          settings.setProviderOwner(source.id, implementation.pluginKey)
          void toast('已切换音源实现')
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function clearDownloads() {
  const alert = await alertController.create({
    header: '清除已完成下载？',
    message: '应用内下载文件会被删除，历史记录中的歌曲不会删除。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '清除', role: 'destructive' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'destructive') return
  await downloadStore.clearCompleted()
  await toast('已清除')
}

async function openLink(url: string) {
  await Browser.open({ url })
}

async function showLegal() {
  const alert = await alertController.create({
    header: '法律与隐私',
    message:
      '澜音仅提供插件运行框架与播放功能，不存储、提供或分发任何音乐源文件。插件由第三方提供，使用前请确认你有权访问相应服务。本地数据保存在设备内。',
    buttons: ['知道了']
  })
  await alert.present()
}

void refreshCacheStats()

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 1800, color })
  await element.present()
}
</script>

<style scoped>
.settings-head {
  padding-top: 16px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--ceru-brand);
}
.head-sub {
  margin: 10px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.group {
  margin-top: 22px;
  --ion-item-background: var(--ceru-bg-elevated);
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
}
.group.highlight-flash {
  position: relative;
  animation: settings-flash 2s ease-out;
}
@keyframes settings-flash {
  0% {
    background-color: rgba(var(--ion-color-primary-rgb), 0.16);
    box-shadow: inset 0 0 0 2px var(--ceru-brand);
  }
  100% {
    background-color: transparent;
    box-shadow: inset 0 0 0 2px transparent;
  }
}
.group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ceru-text-secondary);
  letter-spacing: 0.04em;
  padding: 0 18px 8px;
}
ion-item h2 {
  font-size: 15px;
  font-weight: 650;
}
ion-item p {
  font-size: 12px;
  color: var(--ceru-text-secondary);
  margin-top: 3px;
}
ion-select {
  max-width: 48%;
  font-size: 13px;
}
ion-range {
  max-width: 46%;
  padding-left: 12px;
}
ion-segment {
  max-width: 58%;
}
.accent-row {
  display: flex;
  gap: 14px;
  padding: 12px 20px 18px;
  background: var(--ceru-bg-elevated);
}
.accent-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid transparent;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}
.accent-dot.active {
  border-color: var(--ceru-bg-elevated);
  outline: 2px solid var(--ceru-text);
}
.version-note {
  padding: 22px 20px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.65;
}
.bottom-space {
  height: 140px;
}
</style>
