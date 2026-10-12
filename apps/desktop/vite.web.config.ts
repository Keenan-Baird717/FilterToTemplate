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

// With VITE_ONLY_VARIANT set, imports of other prototype folders from the
// registry resolve to the stand-in, so one folder's work in progress can't
// break another prototype's build.
const onlyVariant = (): Plugin => {
  const only = process.env['VITE_ONLY_VARIANT']
  return {
    name: 'only-variant',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!only || !importer?.replace(/\\/g, '/').endsWith('variants/registry.ts')) return null
      const m = source.match(/^\.\/([\w-]+)$/)
      if (!m || m[1] === only || m[1] === 'workbench' || m[1] === 'skipped') return null
      return resolve(__dirname, 'src/renderer/src/variants/skipped.tsx')
    }
  }
}

// Browser build of the renderer as one self-contained HTML file. The agent runs
// in the page, so the UI can be shared and clicked through without Electron.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  },
  plugins: [onlyVariant(), react(), tailwindcss(), dropCsp(), viteSingleFile()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000
  }
})
