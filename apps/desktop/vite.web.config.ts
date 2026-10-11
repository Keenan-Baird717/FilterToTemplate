import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The desktop CSP allows only bundled scripts; the single-file build inlines
// its script, so drop the meta tag there.
const dropCsp = (): Plugin => ({
  name: 'drop-csp-meta',
  transformIndexHtml: (html) => html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>\s*/, '')
})

// Browser build of the renderer as one self-contained HTML file. The agent runs
// in the page, so the UI can be shared and clicked through without Electron.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  },
  plugins: [react(), tailwindcss(), dropCsp(), viteSingleFile()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000
  }
})
