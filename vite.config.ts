import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const host = process.env.TAURI_DEV_HOST
const demoRoot = resolve(process.cwd(), 'dev-demo')

/** Serves demo assets only in dev; keeps the production desktop bundle small. */
function demoAssetsPlugin(): Plugin {
  const mime: Record<string, string> = {
    '.wav': 'audio/wav',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
  }
  return {
    name: 'kexgo-demo-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/demo', async (request, response, next) => {
        try {
          const pathname = decodeURIComponent((request.url ?? '/').split('?')[0])
          const target = normalize(join(demoRoot, pathname.replace(/^\/+/, '')))
          if (!target.startsWith(demoRoot)) {
            next()
            return
          }
          const data = await readFile(target)
          response.setHeader('Content-Type', mime[extname(target).toLowerCase()] ?? 'application/octet-stream')
          response.setHeader('Cache-Control', 'no-cache')
          response.end(data)
        } catch {
          next()
        }
      })
    }
  }
}

// Tauri expects a fixed port and does not want Vite to obscure Rust errors.
export default defineConfig({
  plugins: [vue(), demoAssetsPlugin()],
  clearScreen: false,
  server: {
    host: host || '127.0.0.1',
    port: 1420,
    strictPort: true,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/.*.tmpdir/**', '**/.DS_Store'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false
  }
})
