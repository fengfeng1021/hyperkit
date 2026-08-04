import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, resolve } from 'node:path'

/* 服務 repo 根目錄（tools/ 的上一層），所以這支腳本可以從任何工作目錄啟動。 */
const ROOT = resolve(import.meta.dirname, '..')
const PORT = Number(process.env.PORT) || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const full = normalize(join(ROOT, p))
    if (!full.startsWith(normalize(ROOT))) {
      res.writeHead(403).end('forbidden')
      return
    }
    const s = await stat(full).catch(() => null)
    if (!s) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + p)
      return
    }
    if (s.isDirectory()) {
      res.writeHead(302, { location: p + '/' }).end()
      return
    }
    const body = await readFile(full)
    res.writeHead(200, {
      'content-type': MIME[extname(full).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      // 讓 WebGPU / transformers.js 的 SharedArrayBuffer 路徑可用
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'credentialless',
    })
    res.end(body)
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 ' + e.message)
  }
}).listen(PORT, () => console.log(`hyperkit dev server on http://localhost:${PORT}/`))
