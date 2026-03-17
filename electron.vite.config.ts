import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'

/**
 * Resolves Figma-specific asset imports (figma:asset/...) to empty strings.
 * These are only valid inside the Figma plugin environment. Outside of it
 * we return an empty default export so the app loads without crashing.
 */
function figmaAssetPlugin(): Plugin {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) return '\0figma:' + id
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
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.ts'),
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.ts'),
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },

  renderer: {
    root: resolve(__dirname, '.'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'app'),
        '@mlc-ai/web-llm': resolve(__dirname, 'app/stubs/web-llm.ts'),
        'harper.js': resolve(__dirname, 'app/stubs/harper.ts'),
      },
    },
    plugins: [figmaAssetPlugin(), react(), tailwindcss()],
    optimizeDeps: {
      exclude: ['harper.js', '@mlc-ai/web-llm'],
    },
  },
})
