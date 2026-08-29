import { getJSON } from './http'
import type { SearchResult, Quote, KLineBundle, FlowBundle, InstrumentKind } from '@/types/instrument'

const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

export const instrumentApi = {
  /** 统一搜索（股票/ETF/基金/指数） */
  search(keyword: string, limit = 10) {
    return getJSON<SearchResult[]>(`/search-all?${qs({ keyword, limit })}`)
  },
  /** 批量实时行情（股票/ETF/指数） */
  quote(symbols: string[]) {
    return getJSON<Quote[]>(`/quote?symbols=${encodeURIComponent(symbols.join(','))}`)
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
}
