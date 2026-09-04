import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { instrumentApi } from '@/api/instrument'
import { usePortfolioStore } from '@/stores/portfolio'
import { computeMetrics, evaluateRule } from '@/engine/evaluate'
import { FIELD_META, type Rule, type Signal, type FieldKey } from '@/types/rule'
import type { Instrument, InstrumentKind } from '@/types/instrument'

const RULES_KEY = 'fm:rules'
const SIGNALS_KEY = 'fm:signals'
/** 同规则同标的同方向去重窗口（6 小时） */
const DEDUP_MS = 6 * 3600 * 1000

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v as T
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return fallback
}

let seed = 0
export const nextId = (p: string) => `${p}${Date.now().toString(36)}${(seed++).toString(36)}`

/** 规则命中历史输入（由提醒中心统一评估后回填） */
export interface RuleSignalHit {
  ruleId: string
  ruleName: string
  code: string
  name: string
  kind: InstrumentKind
  signal: 'buy' | 'sell' | 'hold'
  confidence: number
  time: number
  detail: string
  metrics: Signal['metrics']
}

export const useRulesStore = defineStore('rules', () => {
  const rules = ref<Rule[]>(load<Rule[]>(RULES_KEY, []))
  const signals = ref<Signal[]>(load<Signal[]>(SIGNALS_KEY, []))
  const evaluating = ref(false)
  const lastEvalAt = ref<number | null>(null)
  const error = ref<string | null>(null)

  function persistRules() {
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules.value))
    } catch {
      /* ignore */
    }
  }
  function persistSignals() {
    try {
      localStorage.setItem(SIGNALS_KEY, JSON.stringify(signals.value.slice(0, 200)))
    } catch {
      /* ignore */
    }
  }

  function addRule(r: Omit<Rule, 'id' | 'createdAt'>) {
    rules.value.push({ ...r, id: nextId('r'), createdAt: Date.now() })
    persistRules()
  }
  function updateRule(rule: Rule) {
    const idx = rules.value.findIndex((r) => r.id === rule.id)
    if (idx > -1) {
      rules.value[idx] = rule
      persistRules()
    }
  }
  function removeRule(id: string) {
    const idx = rules.value.findIndex((r) => r.id === id)
    if (idx > -1) {
      rules.value.splice(idx, 1)
      persistRules()
    }
  }
  function clearSignals() {
    signals.value = []
    persistSignals()
  }

  /** 用云端规则整体替换（跨设备拉取同步用，不触发回写） */
  function replaceAll(list: Rule[]) {
    rules.value = Array.isArray(list) ? list : []
    persistRules()
  }

  const enabledCount = computed(() => rules.value.filter((r) => r.enabled).length)
  const latestSignals = computed(() => signals.value.slice(0, 5))

  /** 由提醒中心评估后回填信号历史（沿用 6h 去重 + 200 条上限） */
  function appendSignals(hits: RuleSignalHit[]) {
    if (!hits.length) return
    const now = hits[0]?.time ?? Date.now()
    for (const h of hits) {
      const dup = signals.value.some(
        (s) => s.ruleId === h.ruleId && s.code === h.code && s.signal === h.signal && now - s.time < DEDUP_MS,
      )
      if (dup) continue
      signals.value.unshift({ id: nextId('s'), ...h })
      if (signals.value.length > 200) signals.value.pop()
    }
    persistSignals()
    lastEvalAt.value = now
  }

  /** 立即测试单条规则（不写入信号） */
  async function testRule(rule: Rule) {
    try {
      const portfolio = usePortfolioStore()
      const it = portfolio.funds.find((f) => f.code === rule.code)
      if (!it) return { matched: false, confidence: 0, detail: ['标的不在库中'] }
      const [k, f] = await Promise.all([
        instrumentApi.kline({ symbol: it.symbol, kind: it.kind as InstrumentKind, code: it.code, klt: 'day', count: 120 }),
        it.kind === 'fund' || it.kind === 'index'
          ? Promise.resolve(null)
          : instrumentApi.flow({ symbol: it.symbol, kind: it.kind as InstrumentKind, days: 10 }),
      ])
      if (!k || !k.points.length) return { matched: false, confidence: 0, detail: ['K线数据不可用'] }
      return evaluateRule(rule, computeMetrics(k, f))
    } catch (e) {
      return { matched: false, confidence: 0, detail: [e instanceof Error ? e.message : '数据拉取失败'] }
    }
  }

  /** 供表单使用：按标的类型返回可用的字段列表 */
  function fieldsFor(kind: InstrumentKind): FieldKey[] {
    return (Object.keys(FIELD_META) as FieldKey[]).filter((k) => FIELD_META[k].kinds.includes(kind))
  }

  return {
    rules,
    signals,
    evaluating,
    lastEvalAt,
    error,
    enabledCount,
    latestSignals,
    addRule,
    updateRule,
    removeRule,
    clearSignals,
    replaceAll,
    appendSignals,
    testRule,
    fieldsFor,
  }
})
