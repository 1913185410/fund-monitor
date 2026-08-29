/** 统一标的模型：股票 / ETF / 场外基金 / 指数 / 可转债 */

export type InstrumentKind = 'stock' | 'etf' | 'fund' | 'index' | 'bond'

export interface Instrument {
  /** 代码（6位） */
  code: string
  /** 名称 */
  name: string
  /** 标的类型 */
  kind: InstrumentKind
  /** 市场前缀（sh/sz/bj，基金为空） */
  market?: string
  /** 行情符号，如 sh600519；基金为 code */
  symbol?: string
  /** 细分类型（基金类型 / 交易所类型标签） */
  type?: string
  /** 最新价 / 净值 */
  nav: number
  /** 昨收 */
  prevClose?: number
  /** 行情日期 */
  navDate: string
  /** 日涨跌幅（%） */
  dailyGrowth: number
  /** 估算净值（基金） */
  estimateNav?: number
  /** 估算涨跌幅（基金） */
  estimateGrowth?: number
  /** 持有金额 */
  holdingAmount?: number
  /** 持有份额 */
  holdingShare?: number
  /** 累计收益 */
  totalProfit?: number
  /** 累计收益率（%） */
  totalProfitRate?: number
}

export interface SearchResult {
  code: string
  name: string
  kind: InstrumentKind
  market?: string
  symbol?: string
  type?: string
}

/** 实时行情（腾讯 qt 解析） */
export interface Quote {
  symbol: string
  code: string
  name: string
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  change: number
  changePct: number
  volume: number
  amount: number
  turnover: number
  time: string
}

/** K 线点位 */
export interface KLinePoint {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

/** 指标（与 K 线点位一一对齐；不足周期处为 null） */
export interface Indicators {
  ma: Record<string, Array<number | null>>
  macd: { dif: Array<number | null>; dea: Array<number | null>; hist: Array<number | null> }
  rsi: Record<string, Array<number | null>>
  kdj: { k: Array<number | null>; d: Array<number | null>; j: Array<number | null> }
}

export interface KLineBundle {
  points: KLinePoint[]
  indicators: Indicators
}

/** 资金流点位（股票/ETF 日级 或 基金季度规模） */
export interface FlowPoint {
  date: string
  /** 日级：收盘价 */
  close?: number
  /** 日级：涨跌幅小数 */
  changePct?: number
  /** 日级：净流入（元） */
  netAmount?: number
  /** 日级：净流入占比 */
  netRatio?: number
  /** 日级：主力净流入（元） */
  mainNet?: number
  /** 日级：主力净流入占比 */
  mainRatio?: number
  /** 季度：规模（亿） */
  scale?: number
  /** 季度：环比 */
  mom?: string
}

export interface FlowBundle {
  mode: 'daily' | 'quarterly'
  points: FlowPoint[]
}

export const KIND_LABEL: Record<InstrumentKind, string> = {
  stock: '股票',
  etf: 'ETF',
  fund: '基金',
  index: '指数',
  bond: '债券',
}

export const KIND_COLOR: Record<InstrumentKind, string> = {
  stock: '#165dff',
  etf: '#722ed1',
  fund: '#ff7d00',
  index: '#13c2c2',
  bond: '#86909c',
}

/** 任意 kind 值安全取标签（模板中 record 为 any 时用） */
export function kindLabel(kind?: string): string {
  return KIND_LABEL[(kind as InstrumentKind) ?? ''] ?? '其他'
}

/** 任意 kind 值安全取颜色 */
export function kindColor(kind?: string): string {
  return KIND_COLOR[(kind as InstrumentKind) ?? ''] ?? '#86909c'
}
