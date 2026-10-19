import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { actionSheetController, alertController, toastController } from '@ionic/vue'
import type { Track } from '@/types/music'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { useDownloadStore } from '@/stores/downloads'

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2000, color })
  await element.present()
}

export async function openTrackActions(track: Track): Promise<void> {
  const player = usePlayerStore()
  const library = useLibraryStore()
  const downloads = useDownloadStore()

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
      {
        text: '分享',
        handler: () => {
          void Share.share({
            title: track.title,
            text: `${track.title} - ${track.artists.join(' / ')}`
          }).catch(() => undefined)
        }
      },
      {
        text: '复制歌曲信息',
        handler: () => {
          void Clipboard.write({
            string: `${track.title} - ${track.artists.join(' / ')}${track.album ? ` (${track.album})` : ''}`
          }).then(() => toast('已复制'))
        }
      },
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
