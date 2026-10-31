import { Clipboard } from '@capacitor/clipboard'
import { actionSheetController, alertController, toastController } from '@ionic/vue'
import type { Track } from '@/types/music'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { useDownloadStore } from '@/stores/downloads'
import { usePluginStore } from '@/stores/plugins'
import { useAuthStore } from '@/stores/auth'
import { useShareStore } from '@/stores/share'
import { useListenTogetherStore } from '@/stores/listenTogether'
import { resolveTrackQuality, trackQualityChoices } from '@/services/batchDownloadQuality'
import { getQualityDisplayName } from '@/services/qualityNames'
import { pluginTrackContext } from '@/services/hostEntity'

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}

export interface TrackActionOptions {
  extraButtons?: Array<{
    text: string
    role?: 'cancel' | 'destructive' | 'selected'
    handler?: () => boolean | void | Promise<boolean | void>
  }>
}

export async function openTrackActions(track: Track, options?: TrackActionOptions): Promise<void> {
  const player = usePlayerStore()
  const library = useLibraryStore()
  const downloads = useDownloadStore()
  const plugins = usePluginStore()
  const auth = useAuthStore()
  const share = useShareStore()

  const favorite = library.isFavorite(track)
  const sheet = await actionSheetController.create({
    header: track.title,
    subHeader: track.artists.join(' / '),
    buttons: [
      {
        text: '下一首播放',
        handler: () => {
          player.insertNext(track)
          void toast('已加入下一首')
        }
      },
      {
        text: '加入播放列表',
        handler: () => appendTrackToPlaylist(track)
      },
      {
        text: '添加到歌单',
        handler: () => {
          void addToPlaylist(track)
        }
      },
      {
        text: favorite ? '取消收藏' : '收藏',
        handler: () => {
          // 收藏要写 IndexedDB；失败时此前既没有提示也没有抛出处理，
          // 按钮看起来「点了没反应」，用户以为收藏成功了。
          void library
            .toggleFavorite(track)
            .then((added) => toast(added ? '已收藏' : '已取消收藏'))
            .catch((error) =>
              toast(error instanceof Error ? error.message : '收藏失败', 'danger')
            )
        }
      },
      {
        text: '下载',
        handler: () => {
          // 有多个可选音质时先让用户选一次（桌面版 downloadSingleSong 同口径）；
          // 只有一档或插件没声明时直接按默认音质入队，不为一次点击多弹一层。
          void downloadWithQualityChoice(track)
        }
      },
      ...plugins.menus
        .filter(
          (menu) =>
            menu.slot === 'track.actions' &&
            (!menu.when?.loggedIn || auth.authenticated) &&
            (!menu.when?.kinds?.length || menu.when.kinds.includes('track'))
        )
        .map((menu) => ({
          text: menu.title,
          handler: () => {
            void plugins
              .invokeAction(menu.pluginKey, menu.action, {
                // 本地曲目的 `raw` 没有 `ref`，原样交给插件等于给了一个假实体。
                track: pluginTrackContext(track),
                trackKey: track.key
              })
              .catch((error) =>
                toast(error instanceof Error ? error.message : '插件操作失败', 'danger')
              )
          }
        })),
      {
        text: '分享链接',
        handler: () => share.show(track)
      },
      {
        text: '复制歌曲信息',
        handler: () => {
          void Clipboard.write({
            string: `${track.title} - ${track.artists.join(' / ')}${track.album ? ` (${track.album})` : ''}`
          })
            .then(() => toast('已复制'))
            .catch(() => toast('复制失败', 'danger'))
        }
      },
      ...(options?.extraButtons ?? []),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

/**
 * 「加入播放列表」——桌面 `playlistManager.addToPlaylistEnd` 的移动端等价。
 *
 * 桌面版按房间身份分流：普通成员走点歌审核（不改共享列表），房主/管理员
 * 走 `ctl:queue-add` 增量入队，房间外才追加到本地队列末尾并做去重。
 * 移动端此前只有「下一首播放」，没有「加到队尾」这个动作——队列里排到
 * 中段想往后加一首，只能先清空再重排。
 */
async function appendTrackToPlaylist(track: Track): Promise<void> {
  const player = usePlayerStore()
  const lt = useListenTogetherStore()
  if (lt.inRoom) {
    if (lt.canControl) {
      lt.addTrackToQueue(track)
      await toast('已加入房间播放列表')
      return
    }
    const requested = lt.requestTrack(track)
    await toast(
      requested ? '已提交点歌，等待管理员审核' : '房间尚未连接，无法点歌',
      requested ? 'medium' : 'warning'
    )
    return
  }
  const added = player.appendToQueue(track)
  await toast(added ? '已加入播放列表' : '歌曲已在播放列表中', added ? 'medium' : 'warning')
}

/**
 * 单曲下载前选音质，对齐桌面版 `downloadSingleSong`：
 * 只列出这首歌声明支持的档位，选中后仍按「不高于所选」降级一次。
 * 只有一档可选时不弹面板，直接下载。
 */
async function downloadWithQualityChoice(track: Track): Promise<void> {
  const downloads = useDownloadStore()
  const plugins = usePluginStore()
  if (track.localUri) {
    void toast('本地歌曲无需下载')
    return
  }
  const order = plugins.qualityOrderFor(track.ref?.providerId ?? '')
  const options = trackQualityChoices(track, order)
  let quality: string | undefined
  if (options.length > 1) {
    const picked = await new Promise<string | null>((resolve) => {
      let choice: string | null = null
      void actionSheetController
        .create({
          header: '选择下载音质',
          buttons: [
            ...[...options].reverse().map((value) => ({
              text: getQualityDisplayName(value),
              handler: () => {
                choice = value
              }
            })),
            { text: '取消', role: 'cancel' }
          ]
        })
        .then(async (sheet) => {
          await sheet.present()
          await sheet.onDidDismiss()
          resolve(choice)
        })
    })
    if (!picked) return
    quality = resolveTrackQuality(track, picked, order) ?? picked
    if (quality !== picked) {
      void toast(`所选音质不可用，已调整为 ${getQualityDisplayName(quality)}`)
    }
  } else if (options.length === 1) {
    quality = options[0]
  }
  try {
    await downloads.createDownload(track, quality)
    await toast('已加入下载队列')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function addToPlaylist(track: Track): Promise<void> {
  const library = useLibraryStore()
  const sheet = await actionSheetController.create({
    header: '添加到歌单',
    buttons: [
      ...library.playlists.map((playlist) => ({
        text: playlist.name,
        handler: () => {
          void library
            .addTrackToPlaylist(playlist.id, track)
            .then(() => toast('已添加'))
            .catch((error) =>
              toast(error instanceof Error ? error.message : '添加失败', 'danger')
            )
        }
      })),
      {
        text: '新建歌单…',
        handler: () => {
          void createPlaylistAndAdd(track)
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function createPlaylistAndAdd(track: Track): Promise<void> {
  const library = useLibraryStore()
  const alert = await alertController.create({
    header: '新建歌单',
    inputs: [{ name: 'name', type: 'text', placeholder: '歌单名称' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '创建', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  const name = String(data?.values?.name ?? '').trim()
  if (role !== 'confirm' || !name) return
  const playlist = library.createPlaylist(name)
  await library.addTrackToPlaylist(playlist.id, track)
  await toast('已创建并添加')
}

export async function addTracksToPlaylistDialog(tracks: Track[]): Promise<void> {
  if (!tracks.length) return
  const library = useLibraryStore()
  const sheet = await actionSheetController.create({
    header: `将 ${tracks.length} 首歌曲添加到歌单`,
    buttons: [
      ...library.playlists.map((playlist) => ({
        text: playlist.name,
        handler: () => {
          void library
            .addTracksToPlaylist(playlist.id, tracks)
            .then((count) => toast(`已添加 ${count} 首歌曲到「${playlist.name}」`))
            .catch((error) =>
              toast(error instanceof Error ? error.message : '添加失败', 'danger')
            )
        }
      })),
      {
        text: '新建歌单…',
        handler: () => {
          void createPlaylistAndAddBatch(tracks)
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function createPlaylistAndAddBatch(tracks: Track[]): Promise<void> {
  const library = useLibraryStore()
  const alert = await alertController.create({
    header: '新建歌单',
    inputs: [{ name: 'name', type: 'text', placeholder: '歌单名称' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '创建', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  const name = String(data?.values?.name ?? '').trim()
  if (role !== 'confirm' || !name) return
  const playlist = library.createPlaylist(name)
  const count = await library.addTracksToPlaylist(playlist.id, tracks)
  await toast(`已创建「${playlist.name}」并添加 ${count} 首歌曲`)
}
