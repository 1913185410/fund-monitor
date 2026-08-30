/** 规则与信号模型 */
import type { InstrumentKind } from './instrument'

/** 可判断的指标字段 */
export type FieldKey =
  | 'price'
  | 'dailyGrowth'
  | 'change5d'
  | 'change10d'
  | 'change20d'
  | 'priceVsMa5'
  | 'priceVsMa10'
  | 'priceVsMa20'
  | 'ma5VsMa10'
  | 'dif'
  | 'dea'
  | 'hist'
  | 'macdGolden'
  | 'macdDeath'
  | 'rsi14'
  | 'k'
  | 'd'
  | 'kdjGolden'
  | 'kdjDeath'
  | 'mainNet'
  | 'netRatio'
  | 'mainNetDays'
  | 'mainNetPositive'

/** 条件比较符 */
export type RuleOp = 'gt' | 'gte' | 'lt' | 'lte' | 'crossUp' | 'crossDown' | 'isTrue'

/** 字段元信息：UI 用 */
export interface FieldMeta {
  key: FieldKey
  label: string
  /** 数值型条件可选操作符；cross/bool 由字段决定 */
  op: 'num' | 'cross' | 'bool'
  unit?: string
  /** 适用标的类型 */
  kinds: InstrumentKind[]
  /** 提示 */
  tip?: string
}

export const ALL_KINDS: InstrumentKind[] = ['stock', 'etf', 'fund', 'index', 'bond']
const FLOW_KINDS: InstrumentKind[] = ['stock', 'etf', 'bond']

export const FIELD_META: Record<FieldKey, FieldMeta> = {
  price: { key: 'price', label: '最新价/净值', op: 'num', unit: '', kinds: ALL_KINDS },
  dailyGrowth: { key: 'dailyGrowth', label: '日涨跌幅', op: 'num', unit: '%', kinds: ALL_KINDS },
  change5d: { key: 'change5d', label: '近5日涨跌幅', op: 'num', unit: '%', kinds: ALL_KINDS },
  change10d: { key: 'change10d', label: '近10日涨跌幅', op: 'num', unit: '%', kinds: ALL_KINDS },
  change20d: { key: 'change20d', label: '近20日涨跌幅', op: 'num', unit: '%', kinds: ALL_KINDS },
  priceVsMa5: { key: 'priceVsMa5', label: '现价相对MA5', op: 'num', unit: '%', kinds: ALL_KINDS },
  priceVsMa10: { key: 'priceVsMa10', label: '现价相对MA10', op: 'num', unit: '%', kinds: ALL_KINDS },
  priceVsMa20: { key: 'priceVsMa20', label: '现价相对MA20', op: 'num', unit: '%', kinds: ALL_KINDS },
  ma5VsMa10: { key: 'ma5VsMa10', label: 'MA5相对MA10', op: 'num', unit: '%', kinds: ALL_KINDS },
  dif: { key: 'dif', label: 'MACD DIF', op: 'num', kinds: ALL_KINDS },
  dea: { key: 'dea', label: 'MACD DEA', op: 'num', kinds: ALL_KINDS },
  hist: { key: 'hist', label: 'MACD柱', op: 'num', kinds: ALL_KINDS },
  macdGolden: { key: 'macdGolden', label: 'MACD金叉(DIF上穿DEA)', op: 'cross', kinds: ALL_KINDS },
  macdDeath: { key: 'macdDeath', label: 'MACD死叉(DIF下穿DEA)', op: 'cross', kinds: ALL_KINDS },
  rsi14: { key: 'rsi14', label: 'RSI(14)', op: 'num', kinds: ALL_KINDS },
  k: { key: 'k', label: 'KDJ-K', op: 'num', kinds: ALL_KINDS },
  d: { key: 'd', label: 'KDJ-D', op: 'num', kinds: ALL_KINDS },
  kdjGolden: { key: 'kdjGolden', label: 'KDJ金叉(K上穿D)', op: 'cross', kinds: ALL_KINDS },
  kdjDeath: { key: 'kdjDeath', label: 'KDJ死叉(K下穿D)', op: 'cross', kinds: ALL_KINDS },
  mainNet: { key: 'mainNet', label: '主力净流入', op: 'num', unit: '亿', kinds: FLOW_KINDS },
  netRatio: { key: 'netRatio', label: '主力净流入占比', op: 'num', unit: '%', kinds: FLOW_KINDS },
  mainNetDays: { key: 'mainNetDays', label: '主力连续净流入天数', op: 'num', unit: '天', kinds: FLOW_KINDS },
  mainNetPositive: { key: 'mainNetPositive', label: '主力资金净流入为正', op: 'bool', kinds: FLOW_KINDS },
}

export const OP_LABEL: Record<RuleOp, string> = {
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  crossUp: '上穿',
  crossDown: '下穿',
  isTrue: '为真',
}

export interface RuleCondition {
  id: string
  field: FieldKey
  op: RuleOp
  value: number
}

export interface Rule {
  id: string
  name: string
  /** 目标标的代码 */
  code: string
  kind: InstrumentKind
  /** 命中后的信号方向 */
  signal: 'buy' | 'sell' | 'hold'
  /** 条件组合：and 全部满足 / or 任一满足 */
  combine: 'and' | 'or'
  conditions: RuleCondition[]
  enabled: boolean
  remark?: string
  createdAt: number
}

export interface Signal {
  id: string
  ruleId: string
  ruleName: string
  code: string
  name: string
  kind: InstrumentKind
  signal: 'buy' | 'sell' | 'hold'
  confidence: number
  time: number
  detail: string
  metrics: Record<string, number | boolean | undefined>
}

export const SIGNAL_LABEL: Record<'buy' | 'sell' | 'hold', string> = {
  buy: '买入',
  sell: '卖出',
  hold: '观望',
}
