import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fundApi, fallbackFunds } from '@/api/fund'
import { instrumentApi } from '@/api/instrument'
import type { Instrument, InstrumentKind, SearchResult } from '@/types/instrument'

const STORE_KEY = 'fm:portfolio'
const LEGACY_KEY = 'fund-monitor:watchlist'

/** 旧数据（纯基金）迁移：补全 kind/symbol */
function migrate(item: Partial<Instrument>): Instrument {
  const kind: InstrumentKind = item.kind ?? 'fund'
  return {
    code: String(item.code ?? ''),
    name: item.name ?? '',
    kind,
    market: item.market,
    symbol: kind === 'fund' ? String(item.code ?? '') : item.symbol,
    type: item.type,
    nav: item.nav ?? 0,
    navDate: item.navDate ?? '',
    dailyGrowth: item.dailyGrowth ?? 0,
    estimateNav: item.estimateNav,
    estimateGrowth: item.estimateGrowth,
    holdingAmount: item.holdingAmount,
    holdingShare: item.holdingShare,
    totalProfit: item.totalProfit,
    totalProfitRate: item.totalProfitRate,
  }
}

function loadWatchlist(): Instrument[] {
  try {
    const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Instrument>[]
      if (Array.isArray(parsed)) return parsed.filter((i) => i?.code).map(migrate)
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return fallbackFunds.map((f) => migrate({ ...f, kind: 'fund' }))
}

/** 腾讯行情时间戳 → 日期 */
function timeToDate(t: string) {
  return t && t.length >= 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ''
}

export const usePortfolioStore = defineStore('portfolio', () => {
  /** 自选标的列表（元数据 = 名称/类型/持有，行情由 refresh 叠加实时数据） */
  const funds = ref<Instrument[]>(loadWatchlist())
  const loading = ref(false)
  const syncedAt = ref<number | null>(null)
  const error = ref<string | null>(null)

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(funds.value))
    } catch {
      /* localStorage 不可用时静默 */
    }
  }

  /** 用云端数据整体替换（跨设备拉取同步用，不触发回写） */
  function replaceAll(list: Instrument[]) {
    funds.value = Array.isArray(list) ? list.map(migrate) : []
    persist()
  }

  /** 拉取实时行情：股票/ETF 走腾讯批量，场外基金走东财，叠加到自选列表 */
  async function refresh() {
    const symbols = funds.value.filter((f) => f.kind !== 'fund' && f.symbol).map((f) => f.symbol!)
    const fundCodes = funds.value.filter((f) => f.kind === 'fund').map((f) => f.code)
    if (symbols.length === 0 && fundCodes.length === 0) return
    loading.value = true
    error.value = null
    try {
      const [quotes, fundInfos] = await Promise.all([
        symbols.length ? instrumentApi.quote(symbols) : Promise.resolve([]),
        fundCodes.length ? fundApi.list(fundCodes) : Promise.resolve([]),
      ])
      const map = new Map<string, Partial<Instrument>>()
      for (const q of quotes) {
        map.set(q.code, {
          name: q.name,
          nav: q.price,
          navDate: timeToDate(q.time),
          dailyGrowth: q.changePct,
          prevClose: q.prevClose,
        })
      }
      for (const f of fundInfos) {
        map.set(f.code, {
          name: f.name,
          type: f.type,
          nav: f.nav,
          navDate: f.navDate,
          dailyGrowth: f.dailyGrowth,
        })
      }
      for (const it of funds.value) {
        const q = map.get(it.code)
        if (!q) continue
        if (q.name) it.name = q.name
        if (q.type) it.type = q.type
        if (typeof q.nav === 'number') it.nav = q.nav
        if (q.navDate) it.navDate = q.navDate
        if (typeof q.dailyGrowth === 'number') it.dailyGrowth = q.dailyGrowth
        if (typeof q.prevClose === 'number') it.prevClose = q.prevClose
      }
      syncedAt.value = Date.now()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '拉取行情失败'
    } finally {
      loading.value = false
    }
  }

  /** 统一搜索 */
  async function search(keyword: string, limit = 10) {
    return instrumentApi.search(keyword, limit)
  }

  /** 按搜索结果添加 */
  function addFromResult(r: SearchResult, holdingAmount = 0) {
    if (funds.value.some((f) => f.code === r.code)) return false
    funds.value.push({
      code: r.code,
      name: r.name,
      kind: r.kind,
      market: r.market,
      symbol: r.symbol ?? r.code,
      type: r.type,
      nav: 0,
      navDate: '',
      dailyGrowth: 0,
      holdingAmount,
    })
    persist()
    refresh()
    return true
  }

  /** 直接按信息添加（保留旧入口） */
  function addFund(fund: Instrument) {
    if (funds.value.some((f) => f.code === fund.code)) return
    funds.value.push(migrate(fund))
    persist()
    refresh()
  }

  function removeFund(code: string) {
    const idx = funds.value.findIndex((f) => f.code === code)
    if (idx > -1) funds.value.splice(idx, 1)
    persist()
  }

  /* ---------------- 汇总指标（沿用） ---------------- */
  const totalHoldingAmount = computed(() =>
    funds.value.reduce((sum, f) => sum + (f.holdingAmount ?? 0), 0),
  )
  const todayProfit = computed(() =>
    funds.value.reduce((sum, f) => sum + (f.holdingAmount ?? 0) * (f.dailyGrowth / 100), 0),
  )
  const totalProfit = computed(() =>
    funds.value.reduce((sum, f) => sum + (f.totalProfit ?? 0), 0),
  )
  const totalProfitRate = computed(() =>
    totalHoldingAmount.value
      ? (totalProfit.value / (totalHoldingAmount.value - totalProfit.value)) * 100
      : 0,
  )

  const getFundByCode = (code: string) => funds.value.find((f) => f.code === code)

  return {
    funds,
    loading,
    syncedAt,
    error,
    refresh,
    search,
    addFromResult,
    addFund,
    removeFund,
    replaceAll,
    totalHoldingAmount,
    todayProfit,
    totalProfit,
    totalProfitRate,
    getFundByCode,
  }
})
