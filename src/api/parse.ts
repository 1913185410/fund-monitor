/**
 * 云端回传的原始字节信封解码 + 解析。
 * 搜索（smartbox/东财）与行情（腾讯 qt）接口为 GBK 编码，Cloudflare Workers 运行时不支持
 * gbk 解码，因此云端只回传 base64 原始字节 + 编码标记，这里在浏览器侧解码（浏览器原生支持 gbk）。
 */

import type { Quote, SearchResult } from '@/types/instrument'

/** 解码信封：base64(带编码标记) → 文本 */
function decodeRaw(env: { enc: string; raw: string } | null): string | null {
  if (!env || !env.raw) return null
  const bytes = Uint8Array.from(atob(env.raw), (c) => c.charCodeAt(0))
  const dec = env.enc === 'utf-8' ? new TextDecoder('utf-8') : new TextDecoder('gbk')
  return dec.decode(bytes)
}

/** smartbox 返回的名称/拼音字段是 JSON 风格 \uXXXX 转义（如 \u9ec4\u91d1 = 黄金），还原为真实中文 */
function unescapeField(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/** smartbox 类型标签 → 统一标的类型 */
function kindFromTag(tag: string, code: string): SearchResult['kind'] {
  if (/ETF/i.test(tag)) return 'etf'
  if (/GP/i.test(tag)) return 'stock'
  if (/KJ|JJ/i.test(tag)) return 'fund'
  if (/INX|ZS/i.test(tag)) return 'index'
  if (/^[5]/.test(code)) return 'etf'
  if (/^(15|16)/.test(code)) return 'etf'
  if (/^(11|12)/.test(code)) return 'bond'
  return 'stock'
}

/** 解析搜索结果（兼容：腾讯 smartbox 文本 / 东财基金 JSON 兜底） */
export function parseSearch(env: { enc: string; raw: string } | null, limit = 20): SearchResult[] {
  const text = decodeRaw(env)
  if (!text) return []
  // 东财基金兜底：UTF-8 JSON
  if (text.trimStart().startsWith('{')) {
    try {
      const body = JSON.parse(text)
      const list = Array.isArray(body?.Datas) ? body.Datas : []
      return list
        .slice(0, limit)
        .map((it: Record<string, string>) => {
          const code = it.CODE || it.BACKCODE || it._id || ''
          const name = it.NAME || ''
          return code && name ? { code, name, kind: 'fund', symbol: code, type: '场外基金' } : null
        })
        .filter(Boolean) as SearchResult[]
    } catch {
      return []
    }
  }
  // 腾讯 smartbox（GBK）
  const m = text.match(/v_hint="([^"]*)"/)
  if (!m || !m[1]) return []
  const out: SearchResult[] = []
  for (const p of m[1].split('^').filter(Boolean)) {
    const [market, code, rawName, , kindTag] = p.split('~')
    if (!code || !rawName) continue
    const name = unescapeField(rawName)
    const kind = kindFromTag(kindTag || '', code)
    out.push({
      code,
      name,
      kind,
      market,
      symbol: kind === 'fund' ? code : `${market}${code}`,
      type: kindTag || '',
    })
    if (out.length >= limit) break
  }
  return out
}

/** 解析批量实时行情（腾讯 qt，GBK） */
export function parseQuote(env: { enc: string; raw: string } | null): Quote[] {
  const text = decodeRaw(env)
  if (!text) return []
  const out: Quote[] = []
  const re = /v_(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const symbol = m[1]
    const f = m[2].split('~')
    if (f.length < 35) continue
    out.push({
      symbol,
      code: f[2],
      name: f[1],
      price: Number(f[3]) || 0,
      prevClose: Number(f[4]) || 0,
      open: Number(f[5]) || 0,
      high: Number(f[33]) || 0,
      low: Number(f[34]) || 0,
      change: Number(f[31]) || 0,
      changePct: Number(f[32]) || 0,
      volume: Number(f[36]) || 0,
      amount: Number(f[37]) || 0,
      turnover: Number(f[38]) || 0,
      time: f[30] || '',
    })
  }
  return out
}
