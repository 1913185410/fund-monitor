/**
 * Cloudflare Pages Function：所有 /api/* 请求进入这里。
 * 复用 server/api-core.mjs（与本地服务同一套逻辑）。
 */
import { handleApiRequest } from '../../server/api-core.mjs'

// 跨域白名单：v2 部署在 GitHub Pages 下，需跨域访问主力站 API。
// 仅精确放行，避免写成 * 导致任意站点可读写本后端。
// 要新增允许的来源（如自有域名），在此数组追加即可。
const ALLOWED_ORIGINS = new Set([
  'https://1913185410.github.io',
])

function corsHeaders(origin) {
  const headers = new Headers()
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  // 免登录 + token 走 query 参数，不需要凭据；保持 credentials 关闭最安全
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return headers
}

function withCors(res, request) {
  const out = new Headers(res.headers)
  const cors = corsHeaders(request.headers.get('origin'))
  for (const [k, v] of cors.entries()) out.set(k, v)
  return new Response(res.body, { status: res.status, headers: out })
}

export async function onRequest(context) {
  const { request } = context
  // CORS 预检（OPTIONS）：浏览器对 PUT 等非简单请求会先发预检，直接放行不进业务
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
  }
  try {
    const res = await handleApiRequest(context.request, context.env || {})
    if (res) return withCors(res, request)
    return withCors(new Response(JSON.stringify({ message: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }), request)
  } catch (e) {
    return withCors(new Response(JSON.stringify({ message: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }), request)
  }
}
