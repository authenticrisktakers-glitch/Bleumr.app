/**
 * Renderer-only Vite config — used for browser preview and CI builds.
 * The full electron.vite.config.ts is used for the real Electron build.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

/** Dev-only plugin: proxy /ddg requests to DuckDuckGo via Node fetch (bypasses CORS) */
function ddgProxyPlugin(): Plugin {
  return {
    name: 'ddg-proxy',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/ddg')) return next()
        const target = 'https://html.duckduckgo.com' + req.url.replace(/^\/ddg/, '')
        fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        })
          .then(r => r.text().then(body => {
            res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'text/html', 'Access-Control-Allow-Origin': '*' })
            res.end(body)
          }))
          .catch(() => {
            res.writeHead(502, { 'Content-Type': 'text/plain' })
            res.end('DDG proxy error')
          })
      })
    },
  }
}

/** Stamps build timestamp into sw.js so each deploy gets a unique cache name */
function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version-stamp',
    writeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js')
      const fs = require('fs')
      if (fs.existsSync(swPath)) {
        const content = fs.readFileSync(swPath, 'utf-8')
        fs.writeFileSync(swPath, content.replace('__BUILD_TIME__', Date.now().toString()))
      }
    },
  }
}

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
  plugins: [ddgProxyPlugin(), figmaAssetPlugin(), swVersionPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app'),
      '@mlc-ai/web-llm': resolve(__dirname, 'app/stubs/web-llm.ts'),
      'harper.js': resolve(__dirname, 'app/stubs/harper.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ddg': {
        target: 'https://html.duckduckgo.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path: string) => path.replace(/^\/ddg/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          });
        },
      },
    },
  },
  optimizeDeps: {
    // harper.js ships a large inline WASM binary that breaks esbuild pre-bundling
    exclude: ['harper.js', '@mlc-ai/web-llm'],
  },
})
