/**
 * 轻量 HTTP 封装：统一走相对路径 /api，生产可用 VITE_API_BASE_URL 覆盖后端地址。
 * 发送请求时带上与 SharpX 相同的 token、GA 等元数据（后续接入基金平台可扩展）。
 */

/** 发送 GET 请求并解析 JSON，失败时抛出带状态码的错误 */
export async function getJSON<T>(path: string, timeout = 20000): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${base}/api${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeaders() },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`请求失败：${res.status} ${path}`)
    }
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timer)
  }
}

/** 发送 GET 请求，返回原始字节信封（{ enc, raw }），用于云端不解码、浏览器侧解码的场景 */
export async function getRaw(
  path: string,
  timeout = 20000,
): Promise<{ enc: string; raw: string } | null> {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${base}/api${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...authHeaders() },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`请求失败：${res.status} ${path}`)
    }
    const data = await res.json()
    return data ?? null
  } finally {
    window.clearTimeout(timer)
  }
}

/** 跨域鉴权：登录成功后把服务端返回的令牌存到 localStorage，随请求以 Bearer 头发送 */
function authHeaders(): Record<string, string> {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('fm_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}