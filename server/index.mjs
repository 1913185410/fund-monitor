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
import { fileURLToPath } from 'node:url'
import { handleApiRequest } from './api-core.mjs'

const HOST = '0.0.0.0'
const PORT = Number(process.env.PORT || 8080)
/** 本地（server/ 下运行时为 ../dist）与 Web 函数压缩包（根目录 ./dist）都兼容 */
function resolveDist() {
  const here = fileURLToPath(new URL('.', import.meta.url))
  for (const p of [join(here, 'dist'), join(here, '..', 'dist')]) {
    if (existsSync(p)) return p
  }
  return join(here, 'dist')
}
const DIST = resolveDist()
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

/** 跨域（前端静态页在 COS，API 在云函数，二者不同源） */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Auth-Token',
  'Access-Control-Expose-Headers': '*',
}

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? 'localhost'

  /* 受保护转发：/__p/{gh|cf}/... → api.github.com / api.cloudflare.com（仅部署自动化用，随机密钥锁定） */
  if (req.url && req.url.startsWith('/__p/')) {
    return proxyUpstream(req, res)
  }

  /* CORS 预检 */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }

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
    res.writeHead(response.status, { ...CORS, ...Object.fromEntries(response.headers) })
    const body = response.body ? Buffer.from(await response.arrayBuffer()) : null
    return res.end(body)
  }

  const url = new URL(req.url, `http://${host}`)
  return serveStatic(req, res, url.pathname)
})

const PROXY_KEY = process.env.PROXY_KEY || ''
const PROXY_TARGETS = {
  gh: 'https://api.github.com',
  cf: 'https://api.cloudflare.com',
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function proxyUpstream(req, res) {
  if (!PROXY_KEY || req.headers['x-proxy-key'] !== PROXY_KEY) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('forbidden')
  }
  const m = req.url.match(/^\/__p\/(gh|cf)(\/.*)$/)
  if (!m || !PROXY_TARGETS[m[1]]) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('bad route')
  }
  const target = PROXY_TARGETS[m[1]] + m[2]
  const headers = { ...req.headers }
  delete headers.host
  delete headers['x-proxy-key']
  delete headers['accept-encoding']
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req),
    })
    const buf = Buffer.from(await upstream.arrayBuffer())
    const rh = { 'Access-Control-Allow-Origin': '*' }
    const skip = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding'])
    upstream.headers.forEach((v, k) => {
      if (!skip.has(k.toLowerCase())) rh[k] = v
    })
    res.writeHead(upstream.status, rh)
    return res.end(buf)
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('proxy error: ' + (e && e.message ? e.message : String(e)))
  }
}

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
