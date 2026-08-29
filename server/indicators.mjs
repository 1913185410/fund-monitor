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

/** 汇总计算全部指标，返回与 points 对齐的结构 */
export function computeIndicators(points) {
  const closes = points.map((p) => p.close)
  const highs = points.map((p) => p.high)
  const lows = points.map((p) => p.low)
  const { dif, dea, hist } = macd(closes)
  return {
    ma: {
      5: ma(closes, 5),
      10: ma(closes, 10),
      20: ma(closes, 20),
      60: ma(closes, 60),
    },
    macd: { dif, dea, hist },
    rsi: { 14: rsi(closes, 14) },
    kdj: kdj(highs, lows, closes),
  }
}
