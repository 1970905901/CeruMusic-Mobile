exports.manifest = {
  manifestVersion: 2,
  id: 'ceru.mobile.test',
  name: '移动端测试音源',
  version: '1.0.0',
  description: '用于验证移动端搜索、播放、歌词与命令的本地插件',
  author: 'Ceru Mobile Test',
  license: 'MIT',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: {
    providers: [{
      id: 'demo',
      name: '演示音源',
      protocols: ['music.search@1', 'music.resolve@1', 'music.lyrics@1'],
      qualities: ['128k', '320k'],
      connectionMode: 'none'
    }],
    commands: [{ id: 'hello', title: '测试通知', action: 'hello' }]
  },
  permissions: []
};
exports.package = { formatVersion: 2, syntax: 'js', signature: null };
exports.activate = function (ctx) {
  var titles = ['晨光', '雨后的街', '夜航', '风与海', '慢慢', '星尘'];
  ctx.actions.register('hello', async function () {
    await ctx.ui.notify({ key: 'hello', level: 'info', message: '移动端插件运行正常' });
  });
  ctx.providers.register('demo', {
    tracks: {
      search: async function (request, operation) {
        operation.signal.throwIfAborted();
        var query = String(request.query || '').trim();
        var items = titles.map(function (title, index) {
          return {
            ref: {
              pluginId: ctx.plugin.id,
              providerId: 'demo',
              kind: 'track',
              id: 'demo-' + index,
              scope: 'provider'
            },
            title: title,
            subtitle: 'Ceru Demo',
            playable: true,
            capabilities: ['lyrics'],
            metadata: {
              artists: ['Ceru Demo'],
              album: { title: 'Mobile Sessions' },
              durationMs: 2000,
              qualities: ['128k', '320k'],
              artworkUrl: 'http://localhost:5173/logo.png'
            }
          };
        }).filter(function (item) {
          return !query || (item.title + ' ' + item.subtitle).toLowerCase().indexOf(query.toLowerCase()) >= 0 || query === '演示';
        });
        return { items: items, totalEstimate: items.length };
      },
      resolve: async function (resource, quality, operation) {
        operation.signal.throwIfAborted();
        return { ok: true, url: 'http://localhost:5173/demo.wav', expiresAt: Date.now() + 600000 };
      },
      lyrics: async function (resource, operation) {
        operation.signal.throwIfAborted();
        return {
          format: 'crlyric',
          version: 1,
          track: resource,
          offsetMs: 0,
          lines: [
            { startTimeMs: 0, endTimeMs: 500, text: '移动端歌词测试' },
            { startTimeMs: 500, endTimeMs: 1000, text: '搜索、播放与队列' },
            { startTimeMs: 1000, endTimeMs: 1500, text: '全部在设备上运行' },
            { startTimeMs: 1500, endTimeMs: 2000, text: 'Ceru Music Mobile' }
          ]
        };
      }
    }
  });
};
