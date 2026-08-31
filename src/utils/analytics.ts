/** 分析工具：风险指标 / 相关性 / 定投回测 / 买卖建议打分（纯函数，零依赖，前后端可复用） */
import type { KLinePoint } from '@/types/instrument'
import type { Metrics } from '@/engine/evaluate'

/* ---------------- 风险指标 ---------------- */
export interface RiskMetrics {
  /** 最大回撤（%，负数） */
  maxDrawdown: number
  /** 年化波动率（%） */
  annualVol: number
  /** 夏普比率（无风险利率按 0） */
  sharpe: number
  /** 区间收益（%） */
  rangeReturn: number
  /** 用于计算的交易日数 */
  rangeDays: number
}

export function computeRisk(points: KLinePoint[]): RiskMetrics | null {
  if (!points || points.length < 2) return null
  const closes = points.map((p) => p.close).filter((v) => Number.isFinite(v) && v > 0)
  if (closes.length < 2) return null

  let peak = closes[0]
  let maxDD = 0
  for (const c of closes) {
    if (c > peak) peak = c
    const dd = (c - peak) / peak
    if (dd < maxDD) maxDD = dd
  }

  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)
  const dailyVol = Math.sqrt(Math.max(0, variance))
  const annualVol = dailyVol * Math.sqrt(252) * 100
  const sharpe = dailyVol > 0 ? (mean / dailyVol) * Math.sqrt(252) : 0
  const rangeReturn = (closes[closes.length - 1] / closes[0] - 1) * 100

  return {
    maxDrawdown: maxDD * 100,
    annualVol,
    sharpe,
    rangeReturn,
    rangeDays: closes.length,
  }
}

/* ---------------- 相关性 ---------------- */
/** 皮尔逊相关系数（按较短序列长度对齐） */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 3) return null
  const x = a.slice(0, n)
  const y = b.slice(0, n)
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

/* ---------------- 定投回测 ---------------- */
export interface DcaResult {
  investCount: number
  totalInvest: number
  marketValue: number
  profit: number
  profitRate: number
  annualized: number
}

/** 用日线序列模拟定投：每周期（周/月）首个交易日投入固定金额 */
export function backtestDCA(
  points: KLinePoint[],
  amountPerPeriod: number,
  freq: 'week' | 'month',
  years: number,
): DcaResult | null {
  const daily = (points || []).filter((p) => Number.isFinite(p.close) && p.close > 0)
  if (daily.length < 5) return null
  const slice = daily.slice(-Math.min(daily.length, Math.ceil(years * 365 * 1.25)))
  if (!slice.length) return null

  const periodKey = (date: string) => {
    if (freq === 'month') return date.slice(0, 7)
    const dt = new Date(date)
    if (Number.isNaN(dt.getTime())) return date.slice(0, 10)
    const day = (dt.getDay() + 6) % 7
    dt.setDate(dt.getDate() - day)
    return dt.toISOString().slice(0, 10)
  }

  let totalShares = 0
  let totalInvest = 0
  let count = 0
  let lastKey = ''
  for (const p of slice) {
    const k = periodKey(p.date)
    if (k === lastKey) continue
    lastKey = k
    totalShares += amountPerPeriod / p.close
    totalInvest += amountPerPeriod
    count++
  }
  if (!count) return null
  const lastClose = slice[slice.length - 1].close
  const marketValue = totalShares * lastClose
  const profit = marketValue - totalInvest
  const profitRate = totalInvest ? (profit / totalInvest) * 100 : 0
  const yearsSpan = Math.max(0.1, slice.length / 252)
  const annualized = totalInvest > 0 ? (Math.pow(marketValue / totalInvest, 1 / yearsSpan) - 1) * 100 : 0

  return { investCount: count, totalInvest, marketValue, profit, profitRate, annualized }
}

/* ---------------- 买卖建议打分 ---------------- */
export interface Advice {
  signal: 'buy' | 'sell' | 'hold'
  score: number
  label: string
  reasons: string[]
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** 综合技术面 + 资金面，输出 0~100 分与买卖倾向（仅参考，不构成投资建议） */
export function buildAdvice(m: Metrics): Advice {
  const reasons: string[] = []
  let score = 50

  if (m.macdGolden === true) {
    score += 15
    reasons.push('MACD 金叉，动能转强')
  }
  if (m.macdDeath === true) {
    score -= 15
    reasons.push('MACD 死叉，动能转弱')
  }

  const vsMa20 = num(m.priceVsMa20)
  if (vsMa20 != null) {
    if (vsMa20 > 0) {
      score += 8
      reasons.push(`现价站上 MA20（+${vsMa20.toFixed(1)}%）`)
    } else {
      score -= 8
      reasons.push(`现价跌破 MA20（${vsMa20.toFixed(1)}%）`)
    }
  }
  const ma5v10 = num(m.ma5VsMa10)
  if (ma5v10 != null) {
    if (ma5v10 > 0) {
      score += 5
      reasons.push('MA5 上穿 MA10，短线偏多')
    } else {
      score -= 5
      reasons.push('MA5 下穿 MA10，短线偏空')
    }
  }

  const r = num(m.rsi14)
  if (r != null) {
    if (r > 70) {
      score -= 10
      reasons.push(`RSI(14)=${r.toFixed(0)}，超买区`)
    } else if (r < 30) {
      score += 10
      reasons.push(`RSI(14)=${r.toFixed(0)}，超卖区`)
    }
  }

  if (m.kdjGolden === true) {
    score += 8
    reasons.push('KDJ 金叉，短线转强')
  }
  if (m.kdjDeath === true) {
    score -= 8
    reasons.push('KDJ 死叉，短线转弱')
  }

  const mainNet = num(m.mainNet)
  if (mainNet != null) {
    if (mainNet > 0) {
      score += 10
      reasons.push(`主力净流入 ${mainNet.toFixed(2)} 亿`)
    } else if (mainNet < 0) {
      score -= 10
      reasons.push(`主力净流出 ${Math.abs(mainNet).toFixed(2)} 亿`)
    }
  }
  const days = num(m.mainNetDays)
  if (days != null && days > 0) {
    score += Math.min(8, days * 2)
    reasons.push(`主力连续 ${days} 日净流入`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  let signal: Advice['signal'] = 'hold'
  let label = '中性 · 观望为主'
  if (score >= 65) {
    signal = 'buy'
    label = '偏多 · 可关注买入'
  } else if (score <= 35) {
    signal = 'sell'
    label = '偏空 · 注意风险'
  }

  if (!reasons.length) reasons.push('数据不足，暂无法给出有效信号')
  return { signal, score, label, reasons }
}
