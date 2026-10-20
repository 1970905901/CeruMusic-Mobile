import { Clipboard } from '@capacitor/clipboard'
import { actionSheetController, alertController, toastController } from '@ionic/vue'
import type { Track } from '@/types/music'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { useDownloadStore } from '@/stores/downloads'
import { usePluginStore } from '@/stores/plugins'
import { useAuthStore } from '@/stores/auth'
import { useShareStore } from '@/stores/share'

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
        text: '添加到歌单',
        handler: () => {
          void addToPlaylist(track)
        }
      },
      {
        text: favorite ? '取消收藏' : '收藏',
        handler: () => {
          void library.toggleFavorite(track).then((added) =>
            toast(added ? '已收藏' : '已取消收藏')
          )
        }
      },
      {
        text: '下载',
        handler: () => {
          void downloads
            .createDownload(track)
            .then(() => toast('已加入下载队列'))
            .catch((error) => toast(error instanceof Error ? error.message : String(error), 'danger'))
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
                track: track.raw,
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
          }).then(() => toast('已复制'))
        }
      },
      ...(options?.extraButtons ?? []),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function addToPlaylist(track: Track): Promise<void> {
  const library = useLibraryStore()
  const sheet = await actionSheetController.create({
    header: '添加到歌单',
    buttons: [
      ...library.playlists.map((playlist) => ({
        text: playlist.name,
        handler: () => {
          void library.addTrackToPlaylist(playlist.id, track).then(() => toast('已添加'))
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
