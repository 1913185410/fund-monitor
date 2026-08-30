/**
 * 云函数通用 API 核心：仅依赖 Web 标准 API（fetch / Request / Response / TextDecoder / crypto.subtle）。
 * 既可用于 Node 常驻服务（server/index.mjs 套一层 http 适配），
 * 也可直接运行在 Cloudflare Pages Functions / Workers 等 Serverless 运行时。
 *
 * 用法：
 *   import { handleApiRequest } from './api-core.mjs'
 *   const resp = await handleApiRequest(request, { ACCESS_TOKEN: 'xxx' })
 *   // resp === null 表示非 /api 路径（由外层负责静态资源）
 */
import { searchAll, quoteBatch, klineStock, klineFund, flowDaily, fundScale, fundBasicInfo } from './data.mjs'
import { computeIndicators } from './indicators.mjs'

const COOKIE_NAME = 'fm_auth'

/* ---------------- 工具 ---------------- */
const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

/** SHA-256 → hex（Web Crypto，异步） */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${name}=([^;]+)`))
  return m ? m[1] : null
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

async function isAuthed(request, env) {
  if (!env.ACCESS_TOKEN) return true
  return getCookie(request, COOKIE_NAME) === (await sha256Hex(env.ACCESS_TOKEN))
}

function parseKlt(v) {
  return v === 'week' || v === 'month' ? v : 'day'
}

/* ---------------- 主处理 ---------------- */
export async function handleApiRequest(request, env = {}) {
  const url = new URL(request.url)
  const path = url.pathname
  if (!path.startsWith('/api/')) return null

  /* 登录 */
  if (path === '/api/auth') {
    const t = url.searchParams.get('token') || ''
    if (env.ACCESS_TOKEN && t === env.ACCESS_TOKEN) {
      const cookieVal = await sha256Hex(env.ACCESS_TOKEN)
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE_NAME}=${cookieVal}; Path=/; HttpOnly; Max-Age=2592000; SameSite=Lax`,
        },
      })
    }
    if (!env.ACCESS_TOKEN) return new Response(null, { status: 302, headers: { Location: '/' } })
    return new Response(null, { status: 302, headers: { Location: '/?e=1' } })
  }

  /* 前端登录门探针 */
  if (path === '/api/auth/status') {
    return json(200, { enabled: !!env.ACCESS_TOKEN, authed: await isAuthed(request, env) })
  }

  /* 其余 /api 需要登录 */
  if (!(await isAuthed(request, env))) return json(401, { message: 'unauthorized' })

  /* 统一搜索 */
  if (path === '/api/search-all') {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    if (!keyword) return json(200, [])
    const limit = Math.min(20, Number(url.searchParams.get('limit')) || 8)
    return json(200, await cached(`search:${keyword}`, 60_000, () => searchAll(keyword, limit)))
  }

  /* 批量实时行情 */
  if (path === '/api/quote') {
    const symbols = (url.searchParams.get('symbols') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^(sh|sz|bj)\d{6}$/.test(s))
    if (!symbols.length) return json(200, [])
    return json(200, await cached(`quote:${symbols.join(',')}`, 15_000, async () => quoteBatch(symbols)))
  }

  /* K线 + 指标 */
  if (path === '/api/kline') {
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
    return data ? json(200, data) : json(404, { message: '未取到K线数据' })
  }

  /* 资金流 */
  if (path === '/api/flow') {
    const symbol = (url.searchParams.get('symbol') || '').toLowerCase()
    const code = (url.searchParams.get('code') || '').trim()
    const kind = (url.searchParams.get('kind') || 'stock').trim()
    const days = Math.min(60, Math.max(5, Number(url.searchParams.get('days')) || 10))
    if (kind === 'fund') {
      const scale = await cached(`scale:${code}`, 3600_000, () => fundScale(code))
      return json(200, { mode: 'quarterly', points: scale })
    }
    const points = await cached(`flow:${symbol}:${days}`, 1_800_000, () => flowDaily(symbol, days))
    return json(200, { mode: 'daily', points })
  }

  /* 基金实时（沿用） */
  if (path === '/api/fund-info') {
    const code = (url.searchParams.get('code') || '').trim()
    if (!/^\d{6}$/.test(code)) return json(400, { message: 'code 需为 6 位数字' })
    const info = await cached(`fb:${code}`, 15_000, () => fundBasicInfo(code))
    return info ? json(200, info) : json(404, { code, message: '未解析到该基金' })
  }
  if (path === '/api/funds') {
    const codes = (url.searchParams.get('codes') || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{6}$/.test(s))
    if (!codes.length) return json(200, [])
    const out = []
    for (const code of codes) {
      const info = await cached(`fb:${code}`, 15_000, () => fundBasicInfo(code))
      if (info) out.push(info)
    }
    return json(200, out)
  }
  const navMatch = path.match(/^\/api\/funds\/(\d{6})\/nav$/)
  if (navMatch) {
    const data = await cached(`fnav:${navMatch[1]}`, 600_000, () => klineFund(navMatch[1], 'day', 60))
    return json(200, data ? data.points.map((p) => ({ date: p.date, nav: p.close })) : [])
  }
  const detailMatch = path.match(/^\/api\/funds\/(\d{6})$/)
  if (detailMatch) {
    const info = await cached(`fb:${detailMatch[1]}`, 15_000, () => fundBasicInfo(detailMatch[1]))
    return info ? json(200, info) : json(404, { code: detailMatch[1], message: '未取到该基金' })
  }

  return json(404, { message: 'not found' })
}
