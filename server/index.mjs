/**
 * 本地常驻服务（Node）：在 http 之上套一层 Web Request/Response 适配，
 * 实际逻辑全部在 api-core.mjs（与 Cloudflare 云函数共用同一套代码）。
 * 仅负责：/api 转发到核心 + 托管前端构建产物（SPA 回退）。
 *
 * 启动：node server/index.mjs （默认 0.0.0.0:8080）
 * 环境变量：PORT、ACCESS_TOKEN（访问口令，可选）
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { handleApiRequest } from './api-core.mjs'

const HOST = '0.0.0.0'
const PORT = Number(process.env.PORT || 8080)
const DIST = 'dist'
const ACCESS_TOKEN = process.env.ACCESS_TOKEN

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? 'localhost'
  let response = null
  try {
    const request = new Request(`http://${host}${req.url}`, {
      method: req.method,
      headers: req.headers,
    })
    response = await handleApiRequest(request, { ACCESS_TOKEN })
  } catch (e) {
    console.error('[api] error:', e)
    response = new Response(JSON.stringify({ message: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  if (response) {
    res.writeHead(response.status, Object.fromEntries(response.headers))
    const body = response.body ? Buffer.from(await response.arrayBuffer()) : null
    return res.end(body)
  }

  const url = new URL(req.url, `http://${host}`)
  return serveStatic(req, res, url.pathname)
})

/** 托管 dist 静态资源，前端路由回退到 index.html */
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('前端未构建：请先执行 npm run build')
    return
  }
  let file = pathname === '/' ? '/index.html' : pathname
  let abs = normalize(join(DIST, file))
  if (!abs.startsWith(normalize(DIST))) {
    res.writeHead(403).end()
    return
  }
  if (!existsSync(abs) || extname(abs) === '') {
    abs = join(DIST, 'index.html')
  }
  const type = MIME[extname(abs)] || 'application/octet-stream'
  const body = readFileSync(abs)
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': extname(abs) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  res.end(body)
}

server.listen(PORT, HOST, () => {
  console.log(`[fund-monitor] 本地服务已启动（前端+数据代理）: http://${HOST}:${PORT}`)
  console.log(ACCESS_TOKEN ? '[auth] 访问口令保护已开启' : '[auth] 未设置 ACCESS_TOKEN，任何人可访问')
})

export { server }
