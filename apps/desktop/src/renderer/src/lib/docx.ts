import { toast } from 'sonner'
import layoutUrl from '../../../../templates/engagement-letter/layout.docx?url'
import georgiaFallback from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url'
import calibriFallback from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url'
import { fieldDefs } from '../../../agent-core/demo-data'
import { renderDocx, toRenderData } from '../../../doc-engine/render'
import { useApp } from './store'

let layout: Promise<Uint8Array> | null = null

/** The template's layout.docx: inlined as a data URL in builds, served in dev. */
export function loadLayout(): Promise<Uint8Array> {
  layout ??= (async () => {
    if (layoutUrl.startsWith('data:')) {
      const b64 = layoutUrl.slice(layoutUrl.indexOf(',') + 1)
      return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    }
    return new Uint8Array(await (await fetch(layoutUrl)).arrayBuffer())
  })()
  return layout
}

/** Use the real Georgia/Calibri when installed; otherwise bundled stand-ins. */
let fontsReady = false
export function registerDocumentFonts() {
  if (fontsReady) return
  fontsReady = true
  for (const [family, url] of [
    ['Georgia', georgiaFallback],
    ['Calibri', calibriFallback]
  ] as const) {
    const face = new FontFace(family, `local("${family}"), url(${url}) format("woff2")`, { weight: '100 900' })
    face.load().then((f) => document.fonts.add(f)).catch(() => {})
  }
}

export async function renderPreviewDocx() {
  const { fields, rates } = useApp.getState()
  return renderDocx(await loadLayout(), toRenderData(fields, rates, { preview: true }))
}

const required = Object.values(fieldDefs).filter((d) => d.required)

export async function exportDocx() {
  const { fields, rates } = useApp.getState()
  const bytes = renderDocx(await loadLayout(), toRenderData(fields, rates))
  const name = 'Engagement Letter - Acme Holdings.docx'
  const gaps = required.filter((d) => fields[d.id]?.value === null || fields[d.id]?.value === undefined).map((d) => d.label)
  const note = gaps.length ? `Placeholders left for: ${gaps.join(', ')}` : 'Every required field is filled.'

  if (window.ftt?.saveDocx) {
    const result = await window.ftt.saveDocx(name, bytes)
    if (result.saved) toast.success(`Saved ${result.saved.split(/[\\/]/).pop()}`, { description: note })
    return
  }
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })

  // Inside the claude.ai artifact viewer, files go through its downloads
  // capability (the viewer confirms the save).
  const downloads = window.claude ? await window.claude.use('downloads').catch(() => null) : null
  if (downloads) {
    try {
      await downloads.save({ filename: name, data: blob })
      toast.success(`Saved ${name}`, { description: note })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'declined') toast.error('The file couldn’t be saved here', { description: (error as Error).message })
    }
    return
  }

  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  toast.success(`Downloaded ${name}`, { description: note })
}
