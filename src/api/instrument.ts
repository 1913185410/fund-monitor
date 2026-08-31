import { getJSON, getRaw } from './http'
import { parseQuote, parseSearch } from './parse'
import type { SearchResult, Quote, KLineBundle, FlowBundle, InstrumentKind } from '@/types/instrument'

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

/** 行业板块条目（涨跌榜） */
export interface SectorItem {
  code: string
  name: string
  changePct: number
  index: number
  mainNet: number
  leaderName: string
  leaderCode: string
  leaderChangePct: number
}

export const instrumentApi = {
  /** 统一搜索（股票/ETF/基金/指数）：云端回传原始字节，浏览器侧 GBK 解码后解析 */
  async search(keyword: string, limit = 10): Promise<SearchResult[]> {
    const env = await getRaw(`/search-all?${qs({ keyword, limit })}`)
    return parseSearch(env, limit)
  },
  /** 批量实时行情（股票/ETF/指数）：同上 */
  async quote(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return []
    const env = await getRaw(`/quote?symbols=${encodeURIComponent(symbols.join(','))}`)
    return parseQuote(env)
  },
  /** K线 + 指标（日/周/月） */
  kline(params: { symbol?: string; kind: InstrumentKind; code?: string; klt: 'day' | 'week' | 'month'; count?: number }) {
    return getJSON<KLineBundle>(
      `/kline?${qs({
        symbol: params.symbol,
        kind: params.kind,
        code: params.code,
        klt: params.klt,
        count: params.count ?? 90,
      })}`,
    )
  },
  /** 资金流（股票/ETF 日级；基金季度规模） */
  flow(params: { symbol?: string; kind: InstrumentKind; code?: string; days?: number }) {
    return getJSON<FlowBundle>(
      `/flow?${qs({ symbol: params.symbol, kind: params.kind, code: params.code, days: params.days ?? 10 })}`,
    )
  },
  /** 行业板块涨跌榜（公共信息） */
  async sectorsTop(direction: 'up' | 'down', limit = 10): Promise<SectorItem[]> {
    const data = await getJSON<{ direction: string; list: SectorItem[] }>(
      `/sectors/top?${qs({ direction, limit })}`,
    )
    return data?.list ?? []
  },
}
