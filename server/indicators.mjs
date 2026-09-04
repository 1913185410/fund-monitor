/** 技术指标计算（纯函数，零依赖）。所有输出数组与输入点位一一对齐。 */

function ema(list, n) {
  const out = []
  const alpha = 2 / (n + 1)
  let prev
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    prev = i === 0 ? v : alpha * v + (1 - alpha) * prev
    out.push(prev)
  }
  return out
}

function ma(list, n) {
  const out = []
  let sum = 0
  for (let i = 0; i < list.length; i++) {
    sum += list[i]
    if (i >= n) sum -= list[i - n]
    out.push(i >= n - 1 ? sum / n : null)
  }
  return out
}

/** 健壮版均线：跳过 null（用于 RS 这类可能存在缺口对齐的序列） */
function maSkip(list, n) {
  const out = new Array(list.length).fill(null)
  const win = []
  let sum = 0
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    if (v == null) continue
    win.push(v)
    sum += v
    if (win.length > n) sum -= win.shift()
    if (win.length === n) out[i] = sum / n
  }
  return out
}

/** MACD(12,26,9)：DIF / DEA / 柱(2*(DIF-DEA)) */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i])
  const dea = ema(dif, signal)
  const hist = closes.map((_, i) => (dif[i] - dea[i]) * 2)
  return { dif, dea, hist }
}

/** RSI(14)，Wilder 平滑 */
export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null)
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    const gain = ch > 0 ? ch : 0
    const loss = ch < 0 ? -ch : 0
    if (i <= n) {
      avgGain += gain / n
      avgLoss += loss / n
      if (i === n) {
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      }
    } else {
      avgGain = (avgGain * (n - 1) + gain) / n
      avgLoss = (avgLoss * (n - 1) + loss) / n
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }
  return out
}

/** KDJ(9,3,3) */
export function kdj(highs, lows, closes, n = 9, kSmooth = 3, dSmooth = 3) {
  const k = new Array(closes.length).fill(50)
  const d = new Array(closes.length).fill(50)
  const j = new Array(closes.length).fill(50)
  let pk = 50
  let pd = 50
  for (let i = 0; i < closes.length; i++) {
    const start = Math.max(0, i - n + 1)
    let hh = -Infinity
    let ll = Infinity
    for (let t = start; t <= i; t++) {
      hh = Math.max(hh, highs[t])
      ll = Math.min(ll, lows[t])
    }
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100
    pk = (pk * (kSmooth - 1) + rsv) / kSmooth
    pd = (pd * (dSmooth - 1) + pk) / dSmooth
    k[i] = pk
    d[i] = pd
    j[i] = 3 * pk - 2 * pd
  }
  return { k, d, j }
}

/**
 * 相对强弱（RS）：基金净值 ÷ 基准收盘，首个有效值归一化为 100。
 * 曲线上行＝跑赢基准，下行＝跑输基准；rsMa 为其 20 日均线（用于判断强弱趋势方向）。
 * 注意：净值需用累计净值（accum），否则分红除权造成的净值跳空会污染比值。
 */
export function relativeStrength(navs, base, maN = 20) {
  const n = Math.min(navs.length, base ? base.length : 0)
  const rs = new Array(n).fill(null)
  let first = null
  for (let i = 0; i < n; i++) {
    const b = base[i]
    if (!(b > 0) || !(navs[i] > 0)) continue
    const v = navs[i] / b
    if (first == null) first = v
    if (first > 0) rs[i] = (v / first) * 100
  }
  return { rs, rsMa: maSkip(rs, maN) }
}

/** 偏离均线幅度（%）：(close − MA20) / MA20 × 100。正值＝强势区，负值＝弱势区 */
export function deviation(closes, n = 20) {
  const m = maSkip(closes, n)
  return closes.map((c, i) => (m[i] != null && m[i] !== 0 ? ((c - m[i]) / m[i]) * 100 : null))
}

/**
 * 汇总计算全部指标，返回与 points 对齐的结构。
 * @param points K 线点位；若带 accum（累计净值，场外基金）则优先用它，避免分红跳空导致指标失真
 * @param baseCloses 基准收盘序列（如沪深300），与 points 按日期对齐；传了才计算相对强弱
 */
export function computeIndicators(points, baseCloses = null) {
  const useAccum = points.some((p) => p.accum > 0)
  const pick = (p, key) => (useAccum && p.accum > 0 ? p.accum : p[key])
  const closes = points.map((p) => pick(p, 'close'))
  const highs = points.map((p) => pick(p, 'high'))
  const lows = points.map((p) => pick(p, 'low'))
  const { dif, dea, hist } = macd(closes)
  const out = {
    ma: { 5: maSkip(closes, 5), 10: maSkip(closes, 10), 20: maSkip(closes, 20), 60: maSkip(closes, 60) },
    macd: { dif, dea, hist },
    rsi: { 14: rsi(closes, 14) },
    kdj: kdj(highs, lows, closes),
    dev: deviation(closes, 20),
  }
  if (baseCloses && baseCloses.length) out.rs = relativeStrength(closes, baseCloses, 20)
  return out
}
