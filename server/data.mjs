/**
 * 上游数据抓取（零依赖，仅用运行时内置 fetch/TextDecoder，可在 Node 与 Workers 云函数运行）。
 * 所有数据源均在本环境实测可用：
 *  - 搜索：腾讯 smartbox（股票/ETF/场外基金/指数 统一识别）
 *  - 实时行情：腾讯 qt.gtimg.cn（批量）
 *  - K线：腾讯 fqkline（日/周/月，前复权）
 *  - 资金流：新浪 MoneyFlow（日级，股票/ETF）
 *  - 基金净值/名称：东方财富（沿用）
 *  - 基金规模变动：东财 pingzhongdata（季度）
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** 抓取原始字节（Uint8Array）并加超时 */
async function fetchBuf(url, headers = {}, timeout = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 字节 → 文本（默认 utf-8，可指定 gbk） */
function bufToText(buf, encoding = 'utf-8') {
  try {
    return new TextDecoder(encoding).decode(buf)
  } catch {
    return new TextDecoder().decode(buf)
  }
}

async function fetchText(url, headers, timeout, encoding = 'utf-8') {
  const buf = await fetchBuf(url, headers, timeout)
  return buf ? bufToText(buf, encoding) : null
}

/** Uint8Array → base64（跨运行时，不依赖 Node Buffer；浏览器/Workers 原生 btoa 可用） */
function bytesToBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

async function fetchJson(url, headers, timeout) {
  const text = await fetchText(url, headers, timeout)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * 统一搜索（股票/ETF/基金/指数）：腾讯 smartbox 为主，东财基金联想为兜底。
 * 云端只负责抓取原始字节并以 base64 回传（含编码标记），GBK 解码交给浏览器，
 * 避免 Cloudflare Workers 运行时不支持 gbk 导致中文乱码。
 * 返回 { enc:'gbk'|'utf-8', raw: base64 } 或 null。
 */
export async function searchAll(keyword, limit = 8) {
  const buf = await fetchBuf(
    `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(keyword)}&t=all`,
    {},
    12000,
  )
  if (buf && buf.length) return { enc: 'gbk', raw: bytesToBase64(buf) }
  // 兜底：东财基金联想（UTF-8）
  const text = await fetchText(
    `http://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}&_=${Date.now()}`,
  )
  if (text) return { enc: 'utf-8', raw: bytesToBase64(new TextEncoder().encode(text)) }
  return null
}

/** 批量实时行情（股票/ETF/指数/可转债），返回原始字节信封（GBK） */
export async function quoteBatch(symbols) {
  if (!symbols.length) return null
  const buf = await fetchBuf(`https://qt.gtimg.cn/q=${symbols.join(',')}`, {}, 12000)
  if (buf && buf.length) return { enc: 'gbk', raw: bytesToBase64(buf) }
  return null
}

/** 股票/ETF 日/周/月 K 线（腾讯，前复权） */
/** 腾讯K线多域名轮换，避免单域名被限流 */
const KLINE_HOSTS = ['https://web.ifzq.gtimg.cn', 'https://proxy.finance.qq.com', 'https://ifzq.gtimg.cn']

export async function klineStock(symbol, klt = 'day', count = 120) {
  for (const host of KLINE_HOSTS) {
    const json = await fetchJson(`${host}/appstock/app/fqkline/get?param=${symbol},${klt},,,${count},qfq`)
    const d = json?.data?.[symbol]
    const list = d?.[`qfq${klt}`] || d?.[klt]
    if (Array.isArray(list) && list.length) {
      const points = list
        .map((r) => ({
          date: r[0],
          open: Number(r[1]),
          close: Number(r[2]),
          high: Number(r[3]),
          low: Number(r[4]),
          volume: Number(r[5]) || 0,
        }))
        .filter((p) => p.date && p.close > 0)
      if (points.length) return points
    }
  }
  // 最后兜底：新浪日K（不复权），周/月由日线聚合
  return klineSinaFallback(symbol, klt, count)
}

/** 新浪日K兜底（scale=240 日线；datalen 上限约 800） */
async function klineSinaFallback(symbol, klt, count) {
  const url = `https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${Math.min(800, Math.max(count * 8, 120))}`
  const text = await fetchText(url, { Referer: 'https://finance.sina.com.cn' })
  if (!text) return null
  const m = text.match(/=\s*(\[[\s\S]*\])/)
  if (!m) return null
  try {
    const list = JSON.parse(m[1])
    const points = list
      .filter((r) => r.day && Number(r.close) > 0)
      .map((r) => ({
        date: r.day,
        open: Number(r.open),
        close: Number(r.close),
        high: Number(r.high),
        low: Number(r.low),
        volume: Number(r.volume) || 0,
      }))
    if (!points.length) return null
    return klt === 'day' ? points.slice(-count) : aggregate(points, klt).slice(-count)
  } catch {
    return null
  }
}

/** 东财 FTYPE → 前端类型枚举 */
const TYPE_MAP = [
  [/货币/, '货币'],
  [/Q.?DII/i, 'QDII'],
  [/FOF|理财/, '其他'],
  [/指数/, '指数'],
  [/债券|债/, '债券'],
  [/混合|平衡/, '混合'],
  [/股票/, '股票'],
]
function mapFtype(ftype = '') {
  for (const [re, t] of TYPE_MAP) if (re.test(ftype)) return t
  return '其他'
}

/** 场外基金实时信息：优先东财移动端接口，被限流时降级用官网净值走势 */
export async function fundBasicInfo(code) {
  const body = await fetchJson(
    `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBasicInformation?FCODE=${code}&deviceid=test&plat=Iphone&product=EFund&version=6.2.7`,
  )
  const d = body?.Datas
  if (d && d.FCODE) {
    const nav = Number(d.DWJZ)
    const growth = Number(d.RZDF)
    return {
      code: d.FCODE,
      name: d.SHORTNAME ?? '',
      kind: 'fund',
      symbol: code,
      type: mapFtype(d.FTYPE ?? ''),
      nav: Number.isFinite(nav) ? nav : 0,
      navDate: d.FSRQ ?? '',
      dailyGrowth: Number.isFinite(growth) ? growth : 0,
    }
  }
  // 降级：pingzhongdata 的每日净值趋势
  const text = await fetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js`)
  if (text) {
    const m = text.match(/Data_netWorthTrend = (\[[\s\S]*?\]);/)
    if (m) {
      try {
        const list = JSON.parse(m[1])
        const last = list[list.length - 1]
        if (last && typeof last.y === 'number') {
          const d2 = new Date(last.x + 8 * 3600 * 1000).toISOString().slice(0, 10)
          return {
            code,
            name: '',
            kind: 'fund',
            symbol: code,
            type: '其他',
            nav: last.y,
            navDate: d2,
            dailyGrowth: Number(last.equityReturn) || 0,
          }
        }
      } catch {
        /* 忽略解析失败 */
      }
    }
  }
  return null
}

/** 基金净值日序列（东财 lsjz，每页最多 20 条，并行分页；失败时降级用官网净值走势） */
async function fundNavDaily(code, count = 120) {
  const pageSize = 20
  const pages = Math.max(1, Math.min(30, Math.ceil(count / pageSize)))
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetchJson(
        `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=${i + 1}&pageSize=${pageSize}`,
        { Referer: 'http://fundf10.eastmoney.com/' },
      ),
    ),
  )
  const all = []
  for (const body of results) {
    const list = body?.Data?.LSJZList ?? []
    if (!list.length) break
    for (const r of list) {
      const close = Number(r.DWJZ)
      if (!r.FSRQ || !(close > 0)) continue
      all.push({
        date: r.FSRQ,
        open: close,
        close,
        high: close,
        low: close,
        volume: 0,
      })
    }
  }
  if (all.length) return all.sort((a, b) => (a.date < b.date ? -1 : 1))
  return fundNavFromPingzhong(code)
}

/** 降级：从官网 pingzhongdata 取每日净值序列（约一年） */
async function fundNavFromPingzhong(code) {
  const text = await fetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js`)
  if (!text) return []
  const m = text.match(/Data_netWorthTrend = (\[[\s\S]*?\]);/)
  if (!m) return []
  try {
    const list = JSON.parse(m[1])
    return list
      .filter((r) => r && typeof r.y === 'number' && r.y > 0)
      .map((r) => {
        const date = new Date(r.x + 8 * 3600 * 1000).toISOString().slice(0, 10)
        const close = r.y
        return { date, open: close, close, high: close, low: close, volume: 0 }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  } catch {
    return []
  }
}

/** 周/月 K 由日线聚合 */
function aggregate(daily, klt) {
  const map = new Map()
  for (const p of daily) {
    let key
    if (klt === 'month') {
      key = p.date.slice(0, 7)
    } else {
      const t = new Date(`${p.date}T00:00:00`)
      const day = (t.getDay() + 6) % 7 // 周一为 0
      const d = new Date(t)
      d.setDate(t.getDate() - day)
      key = d.toISOString().slice(0, 10)
    }
    const g = map.get(key)
    if (!g) map.set(key, { date: key, open: p.open, close: p.close, high: p.high, low: p.low, volume: 0 })
    else {
      g.close = p.close
      g.high = Math.max(g.high, p.high)
      g.low = Math.min(g.low, p.low)
      g.volume += p.volume
    }
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** 基金 K 线：日线取净值序列，周/月由日线聚合（日线总量封顶，避免请求过多） */
export async function klineFund(code, klt = 'day', count = 120) {
  const raw =
    klt === 'month' ? count * 24 : klt === 'week' ? count * 8 : count
  const needDays = Math.min(480, raw)
  const daily = await fundNavDaily(code, needDays)
  if (!daily.length) return null
  const points = klt === 'day' ? daily : aggregate(daily, klt)
  return points.slice(-count)
}

/** 股票/ETF 日级资金流向（新浪 MoneyFlow） */
export async function flowDaily(symbol, days = 10) {
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_qsfx_zjlrqs?daima=${symbol}&num=${days}`
  const json = await fetchJson(url, { Referer: 'https://finance.sina.com.cn' })
  if (!Array.isArray(json)) return []
  return json.map((r) => ({
    date: r.opendate,
    close: Number(r.trade) || 0,
    changePct: Number(r.changeratio) || 0,
    netAmount: Number(r.netamount) || 0,
    netRatio: Number(r.ratioamount) || 0,
    mainNet: Number(r.r0_net) || 0,
    mainRatio: Number(r.r0_ratio) || 0,
  }))
}

/** 基金季度规模变动（东财 pingzhongdata） */
export async function fundScale(code) {
  const text = await fetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js`)
  if (!text) return []
  const m = text.match(/Data_fluctuationScale = (\{[\s\S]*?\});/)
  if (!m) return []
  try {
    const data = JSON.parse(m[1])
    const cats = data.categories || []
    const ser = data.series || []
    return cats.map((date, i) => ({
      date,
      scale: Number(ser[i]?.y) || 0,
      mom: ser[i]?.mom ?? '',
    }))
  } catch {
    return []
  }
}
