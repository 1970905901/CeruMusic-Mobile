import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const appVersion = process.env.npm_package_version ?? '2.3.1'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  build: {
    target: 'safari14',
    cssTarget: 'safari14',
    sourcemap: false,
    chunkSizeWarningLimit: 1600
  },
  worker: {
    // iOS 14 WKWebView does not reliably support module workers.
    format: 'iife'
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts']
  }
})

