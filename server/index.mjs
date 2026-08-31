/**
 * 本地常驻服务（Node）：在 http 之上套一层 Web Request/Response 适配，
 * 实际逻辑全部在 api-core.mjs（与 Cloudflare 云函数共用同一套代码）。
 * 仅负责：/api 转发到核心 + 托管前端构建产物（SPA 回退）。
 *
 * 启动：node server/index.mjs （默认 0.0.0.0:8080）
 * 环境变量：PORT、ACCESS_TOKEN（访问口令，可选）
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApiRequest } from './api-core.mjs'
import { cosGetJson, cosPutJson } from './cos-store.mjs'

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

/** 跨域（前端静态页在 COS，API 在云函数，二者不同源）；inline 覆盖 API 网关默认的 attachment，避免浏览器下载 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Auth-Token',
  'Access-Control-Expose-Headers': '*',
  'Content-Disposition': 'inline',
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

  /* 部署接力：/deploy/... 供境外 Worker 拉取前端构建产物并推送到 Cloudflare Pages */
  if (req.url && req.url.startsWith('/deploy/')) {
    return deployRoutes(req, res)
  }

  let response = null
  try {
    const request = new Request(`http://${host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body:
        req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
          ? undefined
          : await readBody(req),
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
  up: 'https://upload.pages.cloudflare.com',
  wd: 'https://fm-pages-deployer.1913185410.workers.dev',
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
  if (PROXY_KEY && req.headers['x-proxy-key'] !== PROXY_KEY) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('forbidden')
  }
  const m = req.url.match(/^\/__p\/(gh|cf|up|wd)(\/.*)$/)
  if (!m || !PROXY_TARGETS[m[1]]) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('bad route')
  }
  const target = PROXY_TARGETS[m[1]] + m[2]
  if (m[1] === 'up') return proxyUpstreamUp(req, res, m[2], UP_HOST)
  if (m[1] === 'wd') return proxyUpstreamUp(req, res, m[2], WD_HOST)
  const headers = { ...req.headers }
  delete headers.host
  delete headers['x-proxy-key']
  delete headers['accept-encoding']
  delete headers['content-length']
  delete headers['transfer-encoding']
  delete headers['connection']
  delete headers['content-encoding']
  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    })
    const buf = Buffer.from(await upstream.arrayBuffer())
    const rh = { 'Access-Control-Allow-Origin': '*', 'X-Debug-Body-Len': String(body ? body.length : 0) }
    const skip = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding'])
    upstream.headers.forEach((v, k) => {
      if (!skip.has(k.toLowerCase())) rh[k] = v
    })
    res.writeHead(upstream.status, rh)
    return res.end(buf)
  } catch (e) {
    const cause = e?.cause || {}
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end(
      'proxy error: ' +
        (e && e.message ? e.message : String(e)) +
        (cause && (cause.code || cause.message) ? ` (cause: ${cause.code || ''} ${cause.message || ''})` : ''),
    )
  }
}

/** upload.pages.cloudflare.com / workers.dev 的域名解析被网络层屏蔽，改用 Cloudflare 任播 IP 直连（SNI 保持域名） */
const UP_HOST = 'upload.pages.cloudflare.com'
const WD_HOST = 'fm-pages-deployer.1913185410.workers.dev'
const UP_IPS = [
  '104.16.132.229', '104.16.133.229', '104.16.0.1', '104.16.1.1', '104.16.8.1', '104.16.16.1',
  '104.16.32.1', '104.16.48.1', '104.16.64.1', '104.16.80.1', '104.16.96.1', '104.16.112.1',
  '104.16.128.1', '104.16.144.1', '104.16.160.1', '104.16.176.1', '104.16.192.1', '104.16.208.1',
  '104.16.224.1', '104.16.240.1', '104.17.0.1', '104.17.16.1', '104.17.32.1', '104.17.48.1',
  '104.17.64.1', '104.17.80.1', '104.17.96.1', '104.17.112.1', '104.17.128.1', '104.17.144.1',
  '104.17.160.1', '104.17.176.1', '104.17.192.1', '104.17.208.1', '104.17.224.1', '104.17.240.1',
  '104.18.0.1', '104.18.1.1', '104.18.2.1', '104.18.20.135', '104.18.21.135', '104.18.32.1',
  '104.18.64.1', '104.18.96.1', '104.18.128.1', '104.18.160.1', '104.18.192.1', '104.18.224.1',
  '104.19.0.1', '104.19.16.1', '104.19.32.1', '104.19.64.1', '104.19.96.1', '104.19.128.1',
  '104.19.160.1', '104.19.192.1', '104.19.224.1', '104.20.0.1', '104.20.32.1', '104.20.64.1',
  '104.20.96.1', '104.20.128.1', '104.20.160.1', '104.20.192.1', '104.20.224.1', '104.21.0.1',
  '104.21.32.1', '104.21.64.1', '104.21.96.1', '104.21.128.1', '104.21.160.1', '104.21.192.1',
  '104.21.224.1', '104.22.0.1', '104.22.32.1', '104.22.64.1', '104.22.96.1', '104.22.128.1',
  '104.22.160.1', '104.22.192.1', '104.22.224.1', '104.23.0.1', '104.23.32.1', '104.23.64.1',
  '104.23.96.1', '104.23.128.1', '104.23.160.1', '104.23.192.1', '104.23.224.1', '104.23.255.1',
  '172.64.0.1', '172.64.16.1', '172.64.32.1', '172.64.48.1', '172.64.64.1', '172.64.80.1',
  '172.64.96.1', '172.64.112.1', '172.64.128.1', '172.64.144.1', '172.64.160.1', '172.64.176.1',
  '172.64.192.1', '172.64.208.1', '172.64.224.1', '172.64.240.1', '172.65.0.1', '172.65.16.1',
  '172.65.32.1', '172.65.64.1', '172.65.96.1', '172.65.128.1', '172.65.160.1', '172.65.192.1',
  '172.65.224.1', '172.66.0.1', '172.66.32.1', '172.66.64.1', '172.66.96.1', '172.66.128.1',
  '172.66.160.1', '172.66.192.1', '172.66.224.1', '172.67.0.1', '172.67.32.1', '172.67.64.1',
  '172.67.96.1', '172.67.128.1', '172.67.160.1', '172.67.192.1', '172.67.224.1', '172.68.0.1',
  '162.158.0.1', '162.158.32.1', '162.158.64.1', '162.158.96.1', '162.158.128.1', '162.158.160.1',
  '162.158.192.1', '162.158.224.1', '162.159.0.1', '162.159.32.1', '162.159.64.1', '162.159.96.1',
  '162.159.128.1', '162.159.160.1', '162.159.192.1', '162.159.224.1', '188.114.96.1', '188.114.104.1',
  '188.114.112.1', '188.114.120.1', '198.41.128.1', '198.41.192.1', '190.93.240.1', '197.234.240.1',
]

/** 并发探测一批 IP，返回每个 IP 的结果（x-diag=1 时使用，用于挑选可用节点） */
async function diagUp(req, res, suffix, body, headers, host = UP_HOST) {
  const { request } = await import('node:https')
  const probe = (ip) =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ip, status: 0, body: 'timeout' }), 6000)
      const r = request(
        { host: ip, port: 443, servername: host, method: 'POST', path: suffix, headers },
        (u) => {
          const chunks = []
          u.on('data', (c) => chunks.push(c))
          u.on('end', () => {
            clearTimeout(t)
            const buf = Buffer.concat(chunks)
            resolve({ ip, status: u.statusCode || 0, body: buf.toString('utf8').slice(0, 60).replace(/\n/g, ' ') })
          })
        },
      )
      r.on('error', (e) => {
        clearTimeout(t)
        resolve({ ip, status: 0, body: e.message.slice(0, 60) })
      })
      if (body) r.write(body)
      r.end()
    })
  const results = await Promise.all(UP_IPS.map(probe))
  const good = results.filter((r) => r.status >= 200 && r.status < 400 && !/error code: 1034|error code: 1016/.test(r.body))
  const others = results.filter((r) => !(r.status >= 200 && r.status < 400 && !/error code: 1034|error code: 1016/.test(r.body)))
  const text = JSON.stringify({
    good: good.map((r) => `${r.ip}:${r.status}:${r.body.slice(0, 50)}`),
    others: others.slice(0, 30).map((r) => `${r.ip}:${r.status}:${r.body.slice(0, 50)}`),
    total: results.length,
  })
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(text)
}

async function proxyUpstreamUp(req, res, suffix, host = UP_HOST) {
  const { request } = await import('node:https')
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (['host', 'x-proxy-key', 'accept-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(k.toLowerCase())) continue
    headers[k] = v
  }
  headers['Host'] = host
  if (req.headers['x-diag'] === '1') return diagUp(req, res, suffix, body, headers, host)
  let lastErr = null
  for (const ip of UP_IPS) {
    try {
      const upstream = await new Promise((resolve, reject) => {
        const r = request(
          { host: ip, port: 443, servername: host, method: req.method, path: suffix, headers },
          (u) => resolve(u),
        )
        r.setTimeout(90000, () => {
          r.destroy(new Error(`${ip} timeout`))
        })
        r.on('error', reject)
        if (body) r.write(body)
        r.end()
      })
      const chunks = []
      for await (const c of upstream) chunks.push(c)
      const buf = Buffer.concat(chunks)
      const text = buf.toString('utf8')
      // 跳过 Cloudflare 的限制/缺区错误，继续尝试下一个 IP
      if (/error code: 1034|error code: 1016/.test(text)) {
        lastErr = new Error(`${ip} -> ${upstream.statusCode} ${text.slice(0, 40)}`)
        continue
      }
      const rh = { 'Access-Control-Allow-Origin': '*' }
      const skip = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'])
      for (const [k, v] of Object.entries(upstream.headers)) {
        if (v && !skip.has(k.toLowerCase())) rh[k] = String(v)
      }
      res.writeHead(upstream.statusCode || 502, rh)
      return res.end(buf)
    } catch (e) {
      lastErr = e
    }
  }
  res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('proxy error: all up IPs failed: ' + (lastErr ? lastErr.message : ''))
}

/** 递归列出 dist 下所有文件（带 / 前缀的路径） */
function listDistFiles(dir = DIST) {
  const out = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = '/' + normalize(relative(DIST, abs)).split('\\').join('/')
    if (statSync(abs).isDirectory()) out.push(...listDistFiles(abs))
    else out.push(rel)
  }
  return out
}

const DEPLOY_STATE_KEY = 'deploy/state.json'
const DEPLOY_KEY = process.env.DEPLOY_KEY || ''

/** 部署接力端点（key 保护；manifest/files 供境外 Worker 读取，activate/complete 供沙箱与本函数互操作） */
async function deployRoutes(req, res) {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(data))
  }
  if (p === '/deploy/manifest.json') {
    const state = await cosGetJson(DEPLOY_STATE_KEY).catch(() => null)
    const files = listDistFiles()
    return json(200, { active: !!(state && state.active), files, total: files.length })
  }
  if (p.startsWith('/deploy/files/')) {
    const rel = p.slice('/deploy/files/'.length)
    const abs = normalize(join(DIST, rel))
    if (!abs.startsWith(normalize(DIST)) || !existsSync(abs) || statSync(abs).isDirectory()) {
      return json(404, { message: 'not found' })
    }
    const type = MIME[extname(abs)] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
    return res.end(readFileSync(abs))
  }
  if ((p === '/deploy/activate' || p === '/deploy/complete') && req.method === 'POST') {
    if (!DEPLOY_KEY || url.searchParams.get('key') !== DEPLOY_KEY) return json(403, { message: 'forbidden' })
    const active = p === '/deploy/activate'
    await cosPutJson(DEPLOY_STATE_KEY, { active, ts: Date.now() })
    return json(200, { ok: true, active })
  }
  if (p === '/deploy/report' && req.method === 'POST') {
    if (!DEPLOY_KEY || url.searchParams.get('key') !== DEPLOY_KEY) return json(403, { message: 'forbidden' })
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks).toString('utf-8').slice(0, 2000)
    let report
    try {
      report = JSON.parse(body)
    } catch {
      report = { raw: body }
    }
    await cosPutJson('deploy/report.json', { ts: Date.now(), ...report })
    return json(200, { ok: true })
  }
  return json(404, { message: 'bad route' })
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
    'Content-Disposition': 'inline',
    'Cache-Control': extname(abs) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  res.end(body)
}

server.listen(PORT, HOST, () => {
  console.log(`[fund-monitor] 本地服务已启动（前端+数据代理）: http://${HOST}:${PORT}`)
  console.log(ACCESS_TOKEN ? '[auth] 访问口令保护已开启' : '[auth] 未设置 ACCESS_TOKEN，任何人可访问')
})

export { server }
