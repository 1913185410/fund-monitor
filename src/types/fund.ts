/** 基金基础信息 */
export interface FundInfo {
  /** 基金代码 */
  code: string
  /** 基金名称 */
  name: string
  /** 基金类型 */
  type: '股票' | '混合' | '债券' | '指数' | 'QDII' | '货币' | '其他'
  /** 最新净值 */
  nav: number
  /** 净值日期 */
  navDate: string
  /** 日涨跌幅（%） */
  dailyGrowth: number
  /** 估算净值 */
  estimateNav?: number
  /** 估算涨跌幅（%） */
  estimateGrowth?: number
  /** 估值时间（基金盘中估值，如 2026-09-04 14:00） */
  estimateTime?: string
  /** 持有金额 */
  holdingAmount?: number
  /** 持有份额 */
  holdingShare?: number
  /** 累计收益 */
  totalProfit?: number
  /** 累计收益率（%） */
  totalProfitRate?: number
}

/** 净值走势点位 */
export interface NavPoint {
  date: string
  nav: number
  /** 累计净值 */
  accNav?: number
}

/** 监控规则 */
export interface MonitorRule {
  id: string
  /** 关联基金代码 */
  fundCode: string
  /** 监控类型 */
  type: '涨跌幅' | '净值' | '收益'
  /** 阈值 */
  threshold: number
  /** 触发条件：大于 / 小于 / 相等 */
  condition: 'gt' | 'lt' | 'eq'
  /** 是否启用 */
  enabled: boolean
  /** 备注 */
  remark?: string
}