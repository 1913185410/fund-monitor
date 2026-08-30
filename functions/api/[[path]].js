/**
 * Cloudflare Pages Function：所有 /api/* 请求进入这里。
 * 复用 server/api-core.mjs（与本地服务同一套逻辑）。
 */
import { handleApiRequest } from '../../server/api-core.mjs'

export async function onRequest(context) {
  try {
    const res = await handleApiRequest(context.request, context.env || {})
    if (res) return res
    return new Response(JSON.stringify({ message: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ message: 'internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
}
