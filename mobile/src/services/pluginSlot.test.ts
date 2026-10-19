import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import {
  collectPluginSlotExtensions,
  routeMatches
} from '@/services/pluginSlot'
import { prepareSurfaceMount } from '@/services/pluginSurfaceMount'

function record(id: string, enabled: boolean): PluginRecord {
  const manifest = {
    id,
    name: id.toUpperCase(),
    version: '1.0.0',
    modules: {
      surfaces: [
        {
          id: 'item-actions',
          kind: 'web',
          entry: 'actions.js',
          title: 'Actions'
        }
      ]
    },
    contributes: {
      uiExtensions: [
        {
          id: 'actions-extension',
          slot: 'playlist.item.actions',
          mode: 'append',
          view: 'item-actions',
          order: 7,
          when: { route: '/tabs/playlist' }
        }
      ]
    }
  } as unknown as PluginManifest
  return {
    key: id,
    manifestId: id,
    manifest,
    code: '',
    fileName: `${id}.js`,
    enabled,
    order: 0,
    installedAt: 0,
    updatedAt: 0,
    signatureStatus: 'unsigned'
  }
}

describe('plugin slot extensions', () => {
  it('collects matching enabled surfaces in order', () => {
    const first = record('first', true)
    const second = record('second', true)
    const extensions = collectPluginSlotExtensions(
      [record('disabled', false), first, second],
      'playlist.item.actions',
      { routePath: '/tabs/playlist/remote-a', authenticated: true }
    )
    expect(extensions.map((item) => item.plugin.key)).toEqual(['first', 'second'])
    expect(extensions[0]).toMatchObject({
      id: 'actions-extension',
      mode: 'append',
      order: 7,
      surface: { id: 'item-actions' }
    })
  })

  it('honours route and login predicates and drops missing surfaces', () => {
    const plugin = record('first', true)
    plugin.manifest.contributes!.uiExtensions![0]!.when = { loggedIn: true }
    expect(
      collectPluginSlotExtensions([plugin], 'playlist.item.actions', {
        routePath: '/tabs/library',
        authenticated: false
      })
    ).toHaveLength(0)
    expect(
      collectPluginSlotExtensions([plugin], 'playlist.item.actions', {
        routePath: '/tabs/playlist/remote-a',
        authenticated: false
      })
    ).toHaveLength(0)

    const missingSurface = {
      ...record('missing', true),
      manifest: {
        ...record('missing', true).manifest,
        modules: { surfaces: [] }
      }
    }
    expect(
      collectPluginSlotExtensions([missingSurface], 'playlist.item.actions', {
        routePath: '/tabs/playlist/remote-a',
        authenticated: true
      })
    ).toHaveLength(0)
  })

  it('matches exact and prefix routes only', () => {
    expect(routeMatches('/tabs/playlist', '/tabs/playlist')).toBe(true)
    expect(routeMatches('/tabs/playlist/a', '/tabs/playlist')).toBe(true)
    expect(routeMatches('/tabs/playlistx', '/tabs/playlist')).toBe(false)
    expect(routeMatches('/tabs/playlist/a', '/tabs/playlist/')).toBe(true)
  })
})

describe('plugin surface mount', () => {
  it('normalizes omitted and provided mount context', () => {
    expect(prepareSurfaceMount(undefined)).toEqual({ kind: 'page' })
    const mount = prepareSurfaceMount({
      kind: 'slot',
      slot: 'playlist.item.actions',
      mode: 'append',
      context: { track: { ref: { kind: 'track', id: '1' } } }
    })
    expect(mount).toEqual({
      kind: 'slot',
      slot: 'playlist.item.actions',
      mode: 'append',
      context: { track: { ref: { kind: 'track', id: '1' } } }
    })
  })

  it('rejects oversized mount context', () => {
    expect(() =>
      prepareSurfaceMount({
        kind: 'slot',
        slot: 'playlist.item.actions',
        mode: 'append',
        context: { value: 'x'.repeat(130 * 1024) }
      })
    ).toThrow('插件界面上下文过大')
  })
})
