/** 规则评估引擎（纯函数）：从 K线/资金流 计算指标字段，再按规则判断 */
import {
  FIELD_META,
  OP_LABEL,
  type Rule,
  type RuleCondition,
} from '@/types/rule'
import type { KLineBundle, FlowBundle } from '@/types/instrument'

export type Metrics = Record<string, number | boolean | undefined>

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return undefined
}
const last = <T,>(a: T[] | undefined): T | undefined => (a && a.length ? a[a.length - 1] : undefined)
const pct = (a: number, b: number): number | undefined => (b ? ((a / b - 1) * 100) : undefined)

/** 由 K线 + 资金流 计算全部可判断字段（最新一帧） */
export function computeMetrics(k: KLineBundle, flow?: FlowBundle | null): Metrics {
  const m: Metrics = {}
  const closes = k.points.map((p) => p.close)
  const n = closes.length
  if (!n) return m
  const cur = closes[n - 1]
  m.price = cur
  if (n > 1) m.dailyGrowth = pct(cur, closes[n - 2])
  if (n > 6) m.change5d = pct(cur, closes[n - 6])
  if (n > 11) m.change10d = pct(cur, closes[n - 11])
  if (n > 21) m.change20d = pct(cur, closes[n - 21])

  const ma = k.indicators.ma
  const maOf = (key: number): number | undefined => {
    const arr = ma[String(key)]
    return num(last(arr))
  }
  const ma5 = maOf(5)
  const ma10 = maOf(10)
  const ma20 = maOf(20)
  if (ma5 != null) m.ma5 = ma5
  if (ma10 != null) m.ma10 = ma10
  m.priceVsMa5 = ma5 != null ? pct(cur, ma5) : undefined
  m.priceVsMa10 = ma10 != null ? pct(cur, ma10) : undefined
  m.priceVsMa20 = ma20 != null ? pct(cur, ma20) : undefined
  m.ma5VsMa10 = ma5 != null && ma10 != null ? pct(ma5, ma10) : undefined

  const { dif, dea, hist } = k.indicators.macd
  m.dif = num(last(dif))
  m.dea = num(last(dea))
  m.hist = num(last(hist))
  const d0 = num(dif?.[dif.length - 2])
  const d1 = num(dif?.[dif.length - 1])
  const e0 = num(dea?.[dea.length - 2])
  const e1 = num(dea?.[dea.length - 1])
  if (d0 != null && d1 != null && e0 != null && e1 != null) {
    m.macdGolden = d0 <= e0 && d1 > e1
    m.macdDeath = d0 >= e0 && d1 < e1
  }

  const r14 = k.indicators.rsi?.[14]
  m.rsi14 = num(last(r14))

  const kdj = k.indicators.kdj
  const kv = num(last(kdj.k))
  const dv = num(last(kdj.d))
  m.k = kv
  m.d = dv
  const k0 = num(kdj.k?.[kdj.k.length - 2])
  const d0k = num(kdj.d?.[kdj.d.length - 2])
  if (k0 != null && d0k != null && kv != null && dv != null) {
    m.kdjGolden = k0 <= d0k && kv > dv
    m.kdjDeath = k0 >= d0k && kv < dv
  }

  if (flow && flow.points.length) {
    const fp = flow.points[flow.points.length - 1]
    if (fp.mainNet != null) m.mainNet = fp.mainNet / 1e8
    if (fp.mainRatio != null) m.netRatio = Number((fp.mainRatio * 100).toFixed(2))
    let days = 0
    for (let i = flow.points.length - 1; i >= 0; i--) {
      if ((flow.points[i].mainNet ?? 0) > 0) days++
      else break
    }
    m.mainNetDays = days
    m.mainNetPositive = days > 0
  }
  return m
}

function testCondition(c: RuleCondition, val: number | boolean | undefined): boolean {
  if (val === undefined) return false
  switch (c.op) {
    case 'gt':
      return Number(val) > c.value
    case 'gte':
      return Number(val) >= c.value
    case 'lt':
      return Number(val) < c.value
    case 'lte':
      return Number(val) <= c.value
    case 'crossUp':
    case 'crossDown':
    case 'isTrue':
      return Boolean(val)
  }
}

export function condText(c: RuleCondition): string {
  const meta = FIELD_META[c.field]
  if (!meta) return ''
  if (meta.op === 'cross' || meta.op === 'bool') return OP_LABEL[c.op]
  return `${OP_LABEL[c.op]} ${c.value}${meta.unit ?? ''}`
}

export interface RuleResult {
  matched: boolean
  confidence: number
  /** 人类可读的命中详情 */
  detail: string[]
}

/** 评估一条规则 */
export function evaluateRule(rule: Rule, metrics: Metrics): RuleResult {
  const total = rule.conditions.length
  if (!total) return { matched: false, confidence: 0, detail: [] }
  const detail: string[] = []
  let matchedCount = 0
  let applicable = 0
  for (const c of rule.conditions) {
    const meta = FIELD_META[c.field]
    const val = metrics[c.field]
    const label = meta?.label ?? c.field
    if (val === undefined) {
      detail.push(`${label}（数据不可用）`)
      continue
    }
    applicable++
    if (testCondition(c, val)) {
      matchedCount++
      detail.push(`${label} ${condText(c)} ✓`)
    } else {
      detail.push(`${label} ${condText(c)}`)
    }
  }
  const matched =
    applicable > 0 && (rule.combine === 'and' ? matchedCount === applicable : matchedCount > 0)
  const confidence = applicable ? Math.round(50 + 50 * (matchedCount / applicable)) : 0
  return { matched, confidence, detail }
}
