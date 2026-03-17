/**
 * Renderer-only Vite config — used for browser preview and CI builds.
 * The full electron.vite.config.ts is used for the real Electron build.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'

function figmaAssetPlugin(): Plugin {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) return '\0figma:' + id
      // Stub @mlc-ai/web-llm — 6.5 MB WASM bundle, unusable in browser preview.
      // In Electron, LocalLLM.ts falls back to ElectronRPC automatically.
      if (id === '@mlc-ai/web-llm') return '\0web-llm-stub'
      return null
    },
    load(id) {
      if (id.startsWith('\0figma:')) return 'export default ""'
      if (id === '\0web-llm-stub') {
        return `
export class MLCEngine {}
export async function CreateMLCEngine() { return new MLCEngine(); }
export class InitProgressReport {}
`
      }
      return null
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, '.'),
  plugins: [figmaAssetPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app'),
      '@mlc-ai/web-llm': resolve(__dirname, 'app/stubs/web-llm.ts'),
      'harper.js': resolve(__dirname, 'app/stubs/harper.ts'),
    },
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // harper.js ships a large inline WASM binary that breaks esbuild pre-bundling
    exclude: ['harper.js', '@mlc-ai/web-llm'],
  },
})
