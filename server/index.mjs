/**
 * 基金/股票/ETF 数据代理（零依赖，仅用 Node 内置 http + fetch + crypto）。
 *
 * 数据来源（均在本环境实测）：
 *  搜索：腾讯 smartbox（股票/ETF/场外基金/指数统一识别），东财联想兜底
 *  行情：腾讯 qt.gtimg.cn（批量实时）
 *  K线：腾讯 fqkline（日/周/月，前复权）；场外基金用东财净值序列
 *  资金流：新浪 MoneyFlow（日级）；基金用东财季度规模变动
 *  指标：MACD/MA/RSI/KDJ 由本服务统一计算
 *
 * 对外接口：
 *  GET /api/search-all?keyword=            统一搜索
 *  GET /api/quote?symbols=sh600519,sz000001 批量实时行情
 *  GET /api/kline?symbol=&kind=&code=&klt=day|week|month&count=   K线+指标
 *  GET /api/flow?symbol=&kind=&code=&days= 资金流（股票/ETF 日级，基金季度）
 *  GET /api/funds?codes= ...（沿用，场外基金实时）
 *  GET /api/auth?token=                    访问口令登录
 *
 * 访问保护：设置环境变量 ACCESS_TOKEN 后，所有请求需携带有效 Cookie；
 * 未登录时页面返回内置登录页，API 返回 401。
 */
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import {
  searchAll,
  quoteBatch,
  klineStock,
  klineFund,
  flowDaily,
  fundScale,
  fundBasicInfo,
} from './data.mjs'
import { computeIndicators } from './indicators.mjs'

const HOST = '0.0.0.0'
const PORT = Number(process.env.PORT || 8080)
const DIST = 'dist'
const ACCESS_TOKEN = process.env.ACCESS_TOKEN
const COOKIE_NAME = 'fm_auth'

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

/* ---------------- 简易 TTL 缓存 ---------------- */
const cache = new Map()
function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && hit.expire > Date.now()) return hit.value
  const value = fn()
  if (value && typeof value.then === 'function') {
    const p = Promise.resolve(value).catch((e) => {
      cache.delete(key)
      throw e
    })
    p.then((v) => {
      if (v == null) cache.delete(key)
    })
    cache.set(key, { value: p, expire: Date.now() + ttl })
    return p
  }
  if (value != null) cache.set(key, { value, expire: Date.now() + ttl })
  return value
}

/* ---------------- 访问保护 ---------------- */
function tokenHash(t) {
  return createHash('sha256').update(String(t)).digest('hex')
}
function isAuthed(req) {
  if (!ACCESS_TOKEN) return true
  const m = (req.headers.cookie || '').match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return !!m && m[1] === tokenHash(ACCESS_TOKEN)
}

const LOGIN_PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>访问验证 · 投资监控</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f2f4f8;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.card{background:#fff;border-radius:14px;padding:36px 32px;width:min(90vw,340px);box-shadow:0 8px 30px rgba(0,0,0,.08);text-align:center}
h1{font-size:18px;margin:0 0 6px;color:#1d2129}.sub{font-size:13px;color:#86909c;margin-bottom:22px}
input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e5e6eb;border-radius:8px;font-size:15px;outline:none}
input:focus{border-color:#165dff}
button{margin-top:14px;width:100%;padding:10px 0;border:none;border-radius:8px;background:#165dff;color:#fff;font-size:15px;cursor:pointer}
button:hover{background:#4080ff}
.err{color:#f53f3f;font-size:12px;margin-top:10px;min-height:16px}
</style></head><body>
<div class="card"><h1>投资监控</h1><div class="sub">请输入访问口令继续</div>
<form method="get" action="/api/auth">
<input type="password" name="token" placeholder="访问口令" autofocus autocomplete="current-password">
<button type="submit">进入</button>
</form><div class="err" id="err"></div></div>
<script>if(new URLSearchParams(location.search).get('e')==='1')document.getElementById('err').textContent='口令不正确，请重试';</script>
</body></html>`

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

/* ---------------- 数据路由 ---------------- */
function parseKlt(v) {
  return v === 'week' || v === 'month' ? v : 'day'
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  /* 访问口令登录 */
  if (path === '/api/auth') {
    const t = url.searchParams.get('token') || ''
    if (ACCESS_TOKEN && t === ACCESS_TOKEN) {
      res.writeHead(302, {
        Location: '/',
        'Set-Cookie': `${COOKIE_NAME}=${tokenHash(ACCESS_TOKEN)}; Path=/; HttpOnly; Max-Age=2592000`,
      })
      return res.end()
    }
    if (!ACCESS_TOKEN) return res.writeHead(302, { Location: '/' }).end()
    return res.writeHead(302, { Location: '/?e=1' }).end()
  }

  /* API 访问保护：除登录外，未登录一律 401 */
  if (path.startsWith('/api/') && !isAuthed(req)) {
    return sendJson(res, 401, { message: 'unauthorized' })
  }

  /* 统一搜索 */
  if (req.method === 'GET' && path === '/api/search-all') {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    if (!keyword) return sendJson(res, 200, [])
    const limit = Math.min(20, Number(url.searchParams.get('limit')) || 8)
    return sendJson(res, 200, await cached(`search:${keyword}`, 60_000, () => searchAll(keyword, limit)))
  }

  /* 批量实时行情（股票/ETF/指数/可转债） */
  if (req.method === 'GET' && path === '/api/quote') {
    const symbols = (url.searchParams.get('symbols') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^(sh|sz|bj)\d{6}$/.test(s))
    if (!symbols.length) return sendJson(res, 200, [])
    return sendJson(
      res,
      200,
      await cached(`quote:${symbols.join(',')}`, 15_000, async () => quoteBatch(symbols)),
    )
  }

  /* K线 + 指标（统一返回） */
  if (req.method === 'GET' && path === '/api/kline') {
    const symbol = (url.searchParams.get('symbol') || '').toLowerCase()
    const code = (url.searchParams.get('code') || '').trim()
    const kind = (url.searchParams.get('kind') || 'stock').trim()
    const klt = parseKlt(url.searchParams.get('klt'))
    const count = Math.min(500, Math.max(10, Number(url.searchParams.get('count')) || 120))
    const key = `kline:${symbol || code}:${kind}:${klt}:${count}`
    const data = await cached(key, 600_000, async () => {
      const points =
        kind === 'fund' ? await klineFund(code, klt, count) : await klineStock(symbol, klt, count)
      if (!points || !points.length) return null
      return { points, indicators: computeIndicators(points) }
    })
    return data ? sendJson(res, 200, data) : sendJson(res, 404, { message: '未取到K线数据' })
  }

  /* 资金流 */
  if (req.method === 'GET' && path === '/api/flow') {
    const symbol = (url.searchParams.get('symbol') || '').toLowerCase()
    const code = (url.searchParams.get('code') || '').trim()
    const kind = (url.searchParams.get('kind') || 'stock').trim()
    const days = Math.min(60, Math.max(5, Number(url.searchParams.get('days')) || 10))
    if (kind === 'fund') {
      const scale = await cached(`scale:${code}`, 3600_000, () => fundScale(code))
      return sendJson(res, 200, { mode: 'quarterly', points: scale })
    }
    const points = await cached(`flow:${symbol}:${days}`, 1_800_000, () => flowDaily(symbol, days))
    return sendJson(res, 200, { mode: 'daily', points })
  }

  /* ------- 沿用旧接口（场外基金） ------- */
  if (req.method === 'GET' && path === '/api/search') {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    return sendJson(res, 200, keyword ? await cached(`fs:${keyword}`, 300_000, async () => searchAll(keyword)) : [])
  }
  if (req.method === 'GET' && path === '/api/fund-info') {
    const code = (url.searchParams.get('code') || '').trim()
    if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { message: 'code 需为 6 位数字' })
    const info = await cached(`fb:${code}`, 15_000, () => fundBasicInfo(code))
    return info
      ? sendJson(res, 200, info)
      : sendJson(res, 404, { code, message: '未解析到该基金' })
  }
  if (req.method === 'GET' && path === '/api/funds') {
    const codes = (url.searchParams.get('codes') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{6}$/.test(s))
    if (!codes.length) return sendJson(res, 200, [])
    const out = []
    for (const code of codes) {
      const info = await cached(`fb:${code}`, 15_000, () => fundBasicInfo(code))
      if (info) out.push(info)
    }
    return sendJson(res, 200, out)
  }
  const navMatch = path.match(/^\/api\/funds\/(\d{6})\/nav$/)
  if (req.method === 'GET' && navMatch) {
    const code = navMatch[1]
    const data = await cached(`fnav:${code}`, 600_000, () => klineFund(code, 'day', 60))
    return sendJson(res, 200, data ? data.points.map((p) => ({ date: p.date, nav: p.close })) : [])
  }
  if (req.method === 'GET' && /^\/api\/funds\/\d{6}$/.test(path)) {
    const code = path.split('/')[3]
    const info = await cached(`fb:${code}`, 15_000, () => fundBasicInfo(code))
    return info ? sendJson(res, 200, info) : sendJson(res, 404, { code, message: '未取到该基金' })
  }

  /* 其它 /api 一律 404 */
  if (path.startsWith('/api/')) return sendJson(res, 404, { message: 'not found' })

  /* 访问保护：未登录一律返回登录页 */
  if (!isAuthed(req)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(LOGIN_PAGE)
  }

  /* 静态资源 + SPA 回退 */
  return serveStatic(req, res, path)
})

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
  console.log(`[fund-monitor] 服务已启动（前端+数据代理）: http://${HOST}:${PORT}`)
  console.log(ACCESS_TOKEN ? '[auth] 访问口令保护已开启' : '[auth] 未设置 ACCESS_TOKEN，任何人可访问')
})

export { server }
