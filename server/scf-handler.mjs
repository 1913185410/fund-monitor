/**
 * 腾讯云 SCF（Serverless Cloud Function）入口适配器。
 * 用法：API 网关 / HTTP 触发器把请求以事件形式传入，这里转成 Web Request 交给 api-core，
 *      并把前端 dist 作为静态资源一并托管（SPA 回退到 index.html）。
 * 云函数包内结构：
 *   scf-handler.mjs
 *   package.json（type: module）
 *   server/（api-core.mjs / data.mjs / indicators.mjs）
 *   dist/（前端构建产物）
 * 配置：环境变量 ACCESS_TOKEN（可选，设置后启用登录门）
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, normalize, extname } from 'node:path'
import { handleApiRequest } from './api-core.mjs'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

/** 从 SCF 事件构造 Web Request（兼容 API 网关与 HTTP 触发器两种事件结构） */
function buildRequest(event) {
  const httpMethod =
    event.httpMethod || event.requestContext?.httpMethod || event.requestContext?.method || 'GET'
  const headers = event.headers || event.headersObject || {}
  const query = event.queryString || event.queryStringParameters || {}
  const queryString = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString()
  const host = headers['Host'] || headers['host'] || 'scf.local'
  const path = event.path || event.requestContext?.path || '/'
  const url = `https://${host}${path}${queryString ? `?${queryString}` : ''}`
  const init = { method: httpMethod, headers }
  if (event.body) {
    init.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body
  }
  return new Request(url, init)
}

/** 把 Web Response 转成 SCF 返回结构 */
async function toScfResponse(res) {
  const body = await res.text()
  const headers = {}
  res.headers.forEach((v, k) => {
    // SCF/API 网关不允许逐行写 Set-Cookie，这里合并成单值
    if (k.toLowerCase() === 'set-cookie') {
      headers['Set-Cookie'] = headers['Set-Cookie'] ? `${headers['Set-Cookie']}; ${v}` : v
    } else {
      headers[k] = v
    }
  })
  return { statusCode: res.status, headers, body, isBase64Encoded: false }
}

/** 静态资源（含 SPA 回退） */
function serveStatic(pathname) {
  let p = decodeURIComponent((pathname || '/').split('?')[0])
  if (p === '/' || p === '') p = '/index.html'
  const file = normalize(join(DIST_ROOT, p))
  if (file.startsWith(DIST_ROOT) && existsSync(file) && statSync(file).isFile()) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' },
      body: readFileSync(file),
      isBase64Encoded: true,
    }
  }
  const idx = join(DIST_ROOT, 'index.html')
  if (existsSync(idx)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: readFileSync(idx),
      isBase64Encoded: true,
    }
  }
  return { statusCode: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'not found' }
}

export async function handler(event, context) {
  try {
    const req = buildRequest(event)
    if (req.url.includes('/api/')) {
      const apiRes = await handleApiRequest(req, { ACCESS_TOKEN: process.env.ACCESS_TOKEN || '' })
      if (apiRes) return await toScfResponse(apiRes)
    }
    return serveStatic(new URL(req.url).pathname)
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ message: 'internal error', detail: String(e && e.message || e) }),
    }
  }
}

export { handler as main }
