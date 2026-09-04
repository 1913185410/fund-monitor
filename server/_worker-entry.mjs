/**
 * Cloudflare Pages _worker.js 入口（手动打包用）
 *
 * Direct Upload API 只上传静态资源清单，不会带上 functions/ 目录，
 * 直接部署 dist 会导致 /api 全部失效。因此把 Pages Function 的逻辑预打包成单个
 * _worker.js，与静态资源一起上传（Pages 会把它当作 _worker.js 高级模式运行）。
 *
 * 路由：/api/* -> server/api-core.mjs；其余 -> Pages 静态资源（env.ASSETS）
 */
import { handleApiRequest } from './api-core.mjs'

const ALLOWED_ORIGINS = new Set([
  'https://1913185410.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
])

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

async function handle(request, env) {
  const url = new URL(request.url)
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      const h = corsHeaders(request)
      return h ? new Response(null, { status: 204, headers: h }) : new Response(null, { status: 204 })
    }
    try {
      const res = await handleApiRequest(request, env || {})
      if (res) return withCors(request, res)
      return jsonResponse(404, { message: 'not found' }, request)
    } catch (e) {
      return jsonResponse(500, { message: 'internal error', err: String(e && e.message ? e.message : e) }, request)
    }
  }
  if (env && env.ASSETS) return env.ASSETS.fetch(request)
  return new Response('Not Found', { status: 404 })
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx)
    } catch (e) {
      const msg = e && e.stack ? e.stack : String(e)
      return new Response('WORKER_ERR: ' + msg, { status: 500, headers: { 'Content-Type': 'text/plain' } })
    }
  },
}
