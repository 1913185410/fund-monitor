/**
 * Cloudflare Pages Function：所有 /api/* 请求进入这里。
 * 复用 server/api-core.mjs（与本地服务同一套逻辑）。
 *
 * CORS：api-core 自身不带跨域头（同源场景无需），此处统一为白名单来源补齐，
 * 使 GitHub Pages（1913185410.github.io）等站点能跨域调用本后端。
 * 认证统一走 Authorization: Bearer <fm_token>（存于各站点的 localStorage，不依赖 Cookie）。
 */
import { handleApiRequest } from '../../server/api-core.mjs'

/** 允许跨域调用的来源白名单（按需增删；本地开发端口供调试用） */
const ALLOWED_ORIGINS = new Set([
  'https://1913185410.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
])

/** 来源在白名单内才返回跨域头，否则保持原样（仅同源可用） */
function corsHeaders(request) {
  const origin = request.headers.get('origin') || ''
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function withCors(request, res) {
  const h = corsHeaders(request)
  if (!h) return res
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v)
  return res
}

function jsonResponse(status, data, request) {
  return withCors(
    request,
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    }),
  )
}

export async function onRequest(context) {
  const request = context.request

  /* 预检请求：直接放行，不进入业务逻辑 */
  if (request.method === 'OPTIONS') {
    const h = corsHeaders(request)
    return h ? new Response(null, { status: 204, headers: h }) : new Response(null, { status: 204 })
  }

  try {
    const res = await handleApiRequest(request, context.env || {})
    if (res) return withCors(request, res)
    return jsonResponse(404, { message: 'not found' }, request)
  } catch (e) {
    return jsonResponse(500, { message: 'internal error' }, request)
  }
}
