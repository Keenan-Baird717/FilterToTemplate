/// <reference types="vite/client" />

interface ArtifactDownloads {
  save: (request: { filename: string; data: Blob | ArrayBuffer | string }) => Promise<{ status: 'saved' | 'delivered' }>
}

interface Window {
  /** Present only inside the claude.ai artifact viewer. */
  claude?: { use: (name: 'downloads') => Promise<ArtifactDownloads | null> }
}
