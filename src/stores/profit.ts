/**
 * 持仓账本：以「买入记录」为唯一成本来源，计算每只持仓的份额/市值/浮动收益。
 *
 * 口径约定：
 *  - 成本 cost = Σ 每笔买入金额
 *  - 份额 share = Σ 每笔份额；某笔未填份额时，用「买入金额 ÷ 买入日净值」反推
 *  - 市值 marketValue = share × 最新净值
 *  - 收益 profit = marketValue − cost；收益率按成本口径 profit / cost
 *
 * 买入日净值取自日K（单位净值）。kline 只能覆盖约 2 年历史（约 480 交易日），
 * 更早买入的份额会退化为按历史最早净值近似反推，此时 shareEstimated 仍为 true，
 * 精度有限但成本口径不受影响（成本恒等于实际买入金额）。
 */
import type { HoldingRecord } from '@/stores/holdings'
import type { KLinePoint } from '@/types/instrument'

export interface LedgerResult {
  code: string
  /** 总投入成本（元） */
  cost: number
  /** 总持有份额（含反推） */
  share: number
  /** 当前市值 = share × 最新净值（元） */
  marketValue: number
  /** 浮动收益（元） */
  profit: number
  /** 浮动收益率（%，按成本） */
  profitRate: number
  /** 是否有份额为净值反推所得 */
  shareEstimated: boolean
  /** 反推所用的最新净值 */
  navUsed: number
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * 在【按日期升序】的净值序列中，找 <= date 的最近一个收盘净值。
 * 买入日早于序列覆盖范围时返回序列最早净值（近似反推）；
 * 序列为空返回 null。
 */
export function navAt(points: KLinePoint[], date: string): number | null {
  if (!points.length) return null
  const d = String(date ?? '')
  let lo = 0
  let hi = points.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].date <= d) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const p = ans >= 0 ? points[ans] : points[0]
  return p && p.close > 0 ? p.close : null
}

/**
 * 用买入记录 + 日K 计算账本。records 为空返回 null。
 * 所有记录都没有份额且无法反推（无净值数据）时，该标的不具备估值条件，返回 null。
 */
export function buildLedger(
  code: string,
  records: HoldingRecord[],
  points: KLinePoint[] | null,
  navNow: number,
): LedgerResult | null {
  if (!records || !records.length) return null
  let cost = 0
  let share = 0
  let estimated = false

  for (const r of records) {
    const amt = Number(r.amount)
    if (!Number.isFinite(amt) || amt <= 0) continue
    cost += amt
    let sh = Number(r.share)
    if (Number.isFinite(sh) && sh > 0) {
      share += sh
      continue
    }
    // 份额缺失 → 用买入日净值反推
    estimated = true
    if (!points || !points.length) continue
    const nav = navAt(points, r.date)
    if (nav && nav > 0) {
      share += amt / nav
    }
  }

  // 成本缺失或完全无法估值 → 无账本
  if (!(cost > 0)) return null
  if (!(share > 0) || !(navNow > 0)) return null

  const marketValue = share * navNow
  const profit = marketValue - cost
  return {
    code,
    cost: round2(cost),
    share: round2(share),
    marketValue: round2(marketValue),
    profit: round2(profit),
    profitRate: Number(((profit / cost) * 100).toFixed(2)),
    shareEstimated: estimated,
    navUsed: navNow,
  }
}
