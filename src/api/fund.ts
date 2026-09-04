import { getJSON } from './http'
import type { FundInfo, NavPoint } from '@/types/fund'

/**
 * 基金行情数据接口层。
 * 后端代理（/server）统一对外暴露以下友好接口，数据来自天天基金/东方财富。
 */
export type Quote = Pick<FundInfo, 'code' | 'name' | 'type' | 'nav' | 'navDate' | 'dailyGrowth' | 'estimateNav' | 'estimateGrowth' | 'estimateTime'>

export interface SearchResult {
  code: string
  name: string
  type: FundInfo['type']
}

export const fundApi = {
  /** 按自选代码批量拉取实时行情（含名称/类型/净值/日涨幅） */
  list(codes: string[]) {
    return getJSON<Quote[]>(`/funds?codes=${encodeURIComponent(codes.join(','))}`)
  },
  /** 按代码实时解析基金信息（自动补全用） */
  info(code: string) {
    return getJSON<Quote>(`/fund-info?code=${encodeURIComponent(code)}`)
  },
  /** 联想搜索：代码/名称/拼音 */
  search(keyword: string) {
    return getJSON<SearchResult[]>(`/search?keyword=${encodeURIComponent(keyword)}`)
  },
  /** 单只基金详情 */
  detail(code: string) {
    return getJSON<FundInfo>(`/funds/${code}`)
  },
  /** 单只基金净值走势 */
  nav(code: string) {
    return getJSON<NavPoint[]>(`/funds/${code}/nav`)
  },
}

/** 后端不可用时的本地回退数据（保证接入前页面可正常演示） */
export const fallbackFunds: FundInfo[] = [
  {
    code: '110022',
    name: '易方达消费行业股票',
    type: '股票',
    nav: 3.842,
    navDate: '2026-08-27',
    dailyGrowth: 1.26,
    estimateNav: 3.851,
    estimateGrowth: 0.23,
    holdingAmount: 120000,
    holdingShare: 31233.73,
    totalProfit: 5823.66,
    totalProfitRate: 5.1,
  },
  {
    code: '005827',
    name: '易方达蓝筹精选混合',
    type: '混合',
    nav: 2.156,
    navDate: '2026-08-27',
    dailyGrowth: -0.84,
    estimateNav: 2.149,
    estimateGrowth: -0.32,
    holdingAmount: 80000,
    holdingShare: 37105.75,
    totalProfit: -3120.4,
    totalProfitRate: -3.75,
  },
  {
    code: '270042',
    name: '广发全球精选股票（QDII）',
    type: 'QDII',
    nav: 4.62,
    navDate: '2026-08-26',
    dailyGrowth: 0.52,
    holdingAmount: 50000,
    holdingShare: 10822.51,
    totalProfit: 6480.15,
    totalProfitRate: 14.9,
  },
]