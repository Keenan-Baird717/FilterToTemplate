import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'agent-worker': resolve(__dirname, 'src/main/agent-worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') }
    },
    plugins: [react(), tailwindcss()],
    build: {
      // Ship the template layout inside the bundle; the renderer decodes it.
      assetsInlineLimit: (file: string) => (file.endsWith('.docx') ? true : undefined)
    }
  }
})
