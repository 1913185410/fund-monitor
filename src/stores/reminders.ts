import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { instrumentApi } from '@/api/instrument'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { useAnnounceStore } from '@/stores/announce'
import { useSettingsStore } from '@/stores/settings'
import { computeMetrics, evaluateRule, type Metrics } from '@/engine/evaluate'
import { showNotification } from '@/utils/notify'
import type { Instrument, InstrumentKind, KLineBundle } from '@/types/instrument'
import type { Rule } from '@/types/rule'

const INSTANCES_KEY = 'fm:reminders'
const SIGNALS_KEY = 'fm:reminder-signals'
/** 信号去重窗口：同标的同模板 24 小时内只打扰一次 */
const COOLDOWN_MS = 24 * 3600 * 1000

/**
 * 提醒模板：把"某形态"封装为可复用评估函数。
 * 模板只依赖 K 线 + 指标（不依赖后端常驻进程），可在前端免费评估。
 */
interface ReminderTemplate {
  id: string
  name: string
  side: 'buy' | 'sell'
  period: 'day' | 'week'
  desc: string
  sideLabel: string
  evaluate(k: KLineBundle, it: Instrument): { hit: boolean; confidence: number; reason: string[] }
}

/** 取数组末尾 n 个非 null 值（保持原顺序） */
function lastValid<T>(arr: Array<T | null> | undefined, n: number): T[] {
  if (!arr) return []
  const out: T[] = []
  for (let i = arr.length - 1; i >= 0 && out.length < n; i--) {
    const v = arr[i]
    if (v !== null && v !== undefined) out.push(v as T)
  }
  return out.reverse()
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** M1 预置模板库（新增模板只需在此追加一条定义） */
export const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    id: 'week-macd-oversold-accel',
    name: '周线MACD超跌加速',
    side: 'buy',
    period: 'week',
    desc: '周线 DIF 零轴下方、绿柱连续放大、本周收阴 —— 左侧买点观察区',
    sideLabel: '买点观察',
    evaluate(k) {
      const m = k.indicators.macd
      if (!m) return { hit: false, confidence: 0, reason: [] }
      const hist = lastValid(m.hist, 4)
      const dif = lastValid(m.dif, 1)
      const pts = k.points
      if (hist.length < 3 || dif.length < 1 || pts.length < 2) return { hit: false, confidence: 0, reason: [] }
      const lastDif = dif[0]
      const h1 = Math.abs(hist[hist.length - 1])
      const h2 = Math.abs(hist[hist.length - 2])
      const h3 = Math.abs(hist[hist.length - 3])
      const lastHist = m.hist[m.hist.length - 1]
      const belowZero = lastDif < 0
      const greenBar = lastHist !== null && (lastHist as number) < 0
      const accelerate = h1 > h2 * 1.05 && h2 > h3 * 1.05
      const lastClose = pts[pts.length - 1].close
      const prevClose = pts[pts.length - 2].close
      const down = lastClose < prevClose
      if (belowZero && greenBar && accelerate && down) {
        const depth = Math.min(25, -lastDif * 20)
        const accel = Math.min(15, (h1 - h3) * 30)
        const confidence = clamp(60 + depth + accel, 55, 90)
        return {
          hit: true,
          confidence: Math.round(confidence),
          reason: [
            `周线 DIF=${lastDif.toFixed(3)} 处于零轴下方（空头区）`,
            `绿柱连续放大｜近3周 |柱|=${h3.toFixed(2)}→${h2.toFixed(2)}→${h1.toFixed(2)}`,
            `本周收阴（${lastClose.toFixed(3)} < ${prevClose.toFixed(3)}），下跌加速`,
          ],
        }
      }
      return { hit: false, confidence: 0, reason: [] }
    },
  },
  {
    id: 'day-macd-death-cross',
    name: '日线MACD高位死叉',
    side: 'sell',
    period: 'day',
    desc: '日线 DIF 下穿 DEA 形成死叉，且死叉前 DIF 处于正值区 —— 回落风险提示',
    sideLabel: '卖出警示',
    evaluate(k) {
      const m = k.indicators.macd
      if (!m) return { hit: false, confidence: 0, reason: [] }
      const n = m.dif.length
      if (n < 4) return { hit: false, confidence: 0, reason: [] }
      const d1 = m.dif[n - 1]
      const d2 = m.dif[n - 2]
      const d3 = m.dif[n - 3]
      const e1 = m.dea[n - 1]
      const e2 = m.dea[n - 2]
      if (d1 == null || d2 == null || d3 == null || e1 == null || e2 == null) {
        return { hit: false, confidence: 0, reason: [] }
      }
      const deathCross = d1 < e1 && d2 >= e2
      const prePositive = d2 > 0 || d3 > 0
      if (deathCross && prePositive) {
        return {
          hit: true,
          confidence: 72,
          reason: [
            `日线 MACD 死叉：DIF ${d2.toFixed(3)}→${d1.toFixed(3)} 下穿 DEA ${e2.toFixed(3)}→${e1.toFixed(3)}`,
            '死叉前 DIF 处于正值区，注意回落风险',
          ],
        }
      }
      return { hit: false, confidence: 0, reason: [] }
    },
  },
]

export interface ReminderInstance {
  id: string
  code: string
  templateId: string
  enabled: boolean
}

/** 信号来源：内置形态模板 或 用户自定义条件规则 */
export type ReminderSource = 'template' | 'rule'
/** 信号方向：模板只有 buy/sell；规则可含 hold（观望） */
export type ReminderSide = 'buy' | 'sell' | 'hold'

export interface ReminderSignal {
  id: string
  source: ReminderSource
  /** template: 模板 id；rule: 规则 id */
  sourceId: string
  code: string
  name: string
  kind: InstrumentKind
  /** 显示名：模板名 或 规则名 */
  typeName: string
  side: ReminderSide
  sideLabel: string
  confidence: number
  reason: string[]
  /** 首次命中时间（持续命中保持原值，用于未读判断） */
  time: number
}

/** 规则命中的方向标签（与 FIELD 无关，仅展示用） */
const RULE_SIDE_LABEL: Record<'buy' | 'sell' | 'hold', string> = {
  buy: '买入信号',
  sell: '卖出信号',
  hold: '观望',
}

let seed = 0
const nid = (p: string) => `${p}${Date.now().toString(36)}${(seed++).toString(36)}`

function load<T>(key: string, fb: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v as T
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return fb
}

/** 模块级 K 线缓存（周/日，10 分钟），避免多模板重复拉取 */
const klineCache = new Map<string, { ts: number; data: KLineBundle }>()
const KLINE_TTL = 10 * 60 * 1000

async function getKline(code: string, klt: 'day' | 'week', kind: InstrumentKind): Promise<KLineBundle | null> {
  const key = `${code}:${klt}`
  const c = klineCache.get(key)
  if (c && Date.now() - c.ts < KLINE_TTL) return c.data
  const portfolio = usePortfolioStore()
  const it = portfolio.funds.find((f) => f.code === code)
  if (!it) return null
  const k = await instrumentApi.kline({ kind: it.kind as InstrumentKind, code: it.code, klt, count: klt === 'week' ? 60 : 120 })
  if (!k || !k.points.length) return null
  klineCache.set(key, { ts: Date.now(), data: k })
  return k
}

export const useReminderStore = defineStore('reminders', () => {
  const instances = ref<ReminderInstance[]>(load<ReminderInstance[]>(INSTANCES_KEY, []))
  const signals = ref<ReminderSignal[]>(load<ReminderSignal[]>(SIGNALS_KEY, []))
  const evaluating = ref(false)
  const lastEvalAt = ref<number | null>(null)
  const lastReadAt = ref<number>(0)
  const sheetVisible = ref(false)
  const error = ref<string | null>(null)
  let firstEval = true

  function persistInstances() {
    try {
      localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances.value))
    } catch {
      /* ignore */
    }
  }
  function persistSignals() {
    try {
      localStorage.setItem(SIGNALS_KEY, JSON.stringify(signals.value.slice(0, 100)))
    } catch {
      /* ignore */
    }
  }

  const unreadCount = computed(() => signals.value.filter((s) => s.time > lastReadAt.value).length)
  const buySignals = computed(() => signals.value.filter((s) => s.side === 'buy'))
  const sellSignals = computed(() => signals.value.filter((s) => s.side === 'sell'))
  /** dashboard「最新信号」等场景：按时间倒序取前 5 条 */
  const latestSignals = computed(() =>
    [...signals.value].sort((a, b) => b.time - a.time).slice(0, 5),
  )

  function templateById(id: string) {
    return REMINDER_TEMPLATES.find((t) => t.id === id)
  }

  /** 为某持仓启用模板（默认开启） */
  function enableTemplate(code: string, templateId: string) {
    if (instances.value.some((i) => i.code === code && i.templateId === templateId)) return
    instances.value.push({ id: nid('ri'), code, templateId, enabled: true })
    persistInstances()
  }
  /** 切换某持仓某模板：启用↔停用；返回切换后是否启用 */
  function toggleTemplate(code: string, templateId: string): boolean {
    const idx = instances.value.findIndex((i) => i.code === code && i.templateId === templateId)
    if (idx > -1) {
      instances.value.splice(idx, 1)
      persistInstances()
      return false
    }
    instances.value.push({ id: nid('ri'), code, templateId, enabled: true })
    persistInstances()
    return true
  }
  /** 该标的是否已启用某模板 */
  function templateOn(code: string, templateId: string) {
    return instances.value.some((i) => i.code === code && i.templateId === templateId && i.enabled)
  }
  /** 为全部持仓启用指定模板（一键覆盖） */
  function enableForAll(templateId: string) {
    const portfolio = usePortfolioStore()
    for (const f of portfolio.funds) enableTemplate(f.code, templateId)
  }
  function disableInstance(id: string) {
    const idx = instances.value.findIndex((i) => i.id === id)
    if (idx > -1) {
      instances.value.splice(idx, 1)
      persistInstances()
    }
  }
  function setEnabled(id: string, enabled: boolean) {
    const i = instances.value.find((x) => x.id === id)
    if (i) {
      i.enabled = enabled
      persistInstances()
    }
  }
  function instancesOf(code: string) {
    return instances.value.filter((i) => i.code === code)
  }
  function hasAny() {
    return instances.value.length > 0
  }

  function markAllRead() {
    lastReadAt.value = Date.now()
    sheetVisible.value = false
    persistSignals()
  }
  function markRead(id: string) {
    const s = signals.value.find((x) => x.id === id)
    if (s) {
      lastReadAt.value = Math.max(lastReadAt.value, s.time)
      persistSignals()
    }
  }
  function showSheet() {
    if (unreadCount.value > 0) sheetVisible.value = true
  }
  function hideSheet() {
    sheetVisible.value = false
  }

  /** 评估所有启用监控（内置模板 + 自定义规则），统一信号/去重/通知；返回新增信号数 */
  async function evaluateAll(): Promise<number> {
    const portfolio = usePortfolioStore()
    if (!portfolio.funds.length || evaluating.value) return 0
    const rulesStore = useRulesStore()
    const templateEnabled = instances.value.filter((i) => i.enabled)
    const rulesEnabled = rulesStore.rules.filter((r) => r.enabled)
    if (!templateEnabled.length && !rulesEnabled.length) return 0
    evaluating.value = true
    error.value = null
    let added = 0
    const now = Date.now()
    try {
      const prevMap = new Map(signals.value.map((s) => [s.id, s]))
      const next: ReminderSignal[] = []

      /* ---------- 1. 内置模板实例评估 ---------- */
      const tplCodes = [...new Set(templateEnabled.map((i) => i.code))]
      const tplKlines = new Map<string, KLineBundle | null>()
      for (const code of tplCodes) {
        const klts = [
          ...new Set(
            templateEnabled
              .filter((i) => i.code === code)
              .map((i) => templateById(i.templateId)?.period),
          ),
        ]
        for (const klt of klts) {
          if (klt) tplKlines.set(`${code}:${klt}`, await getKline(code, klt, portfolio.funds.find((f) => f.code === code)!.kind as InstrumentKind))
        }
      }
      for (const ins of templateEnabled) {
        const tpl = templateById(ins.templateId)
        const it = portfolio.funds.find((f) => f.code === ins.code)
        if (!tpl || !it) continue
        const k = tplKlines.get(`${ins.code}:${tpl.period}`)
        if (!k) continue
        const r = tpl.evaluate(k, it)
        const sigId = `tpl:${ins.code}:${ins.templateId}`
        if (r.hit) {
          const prev = prevMap.get(sigId)
          next.push({
            id: sigId,
            source: 'template',
            sourceId: ins.templateId,
            code: ins.code,
            name: it.name,
            kind: it.kind as InstrumentKind,
            typeName: tpl.name,
            side: tpl.side,
            sideLabel: tpl.sideLabel,
            confidence: r.confidence,
            reason: r.reason,
            time: prev ? prev.time : now,
          })
          if (!prev) added++
        }
      }

      /* ---------- 2. 自定义规则评估（读 rulesStore 启用的规则） ---------- */
      const ruleHits: Array<{
        rule: Rule
        it: Instrument
        metrics: Metrics
        detail: string[]
        confidence: number
      }> = []
      if (rulesEnabled.length) {
        const byCode = new Map<string, Rule[]>()
        for (const r of rulesEnabled) {
          const arr = byCode.get(r.code)
          if (arr) arr.push(r)
          else byCode.set(r.code, [r])
        }
        for (const [code, rs] of byCode) {
          const it = portfolio.funds.find((f) => f.code === code)
          if (!it) continue
          try {
            const k = await getKline(code, 'day', it.kind as InstrumentKind)
            const flow =
              it.kind === 'fund' || it.kind === 'index'
                ? null
                : await instrumentApi
                    .flow({ symbol: it.symbol, kind: it.kind as InstrumentKind, days: 10 })
                    .catch(() => null)
            if (!k) continue
            const metrics = computeMetrics(k, flow)
            for (const r of rs) {
              const m = evaluateRule(r, metrics)
              if (m.matched) {
                ruleHits.push({ rule: r, it, metrics, detail: m.detail, confidence: m.confidence })
              }
            }
          } catch {
            /* 单个标的数据失败不影响其它标的 */
          }
        }
        for (const h of ruleHits) {
          const sigId = `rule:${h.rule.id}`
          const prev = prevMap.get(sigId)
          const side: ReminderSide =
            h.rule.signal === 'buy' || h.rule.signal === 'sell' || h.rule.signal === 'hold'
              ? h.rule.signal
              : 'hold'
          next.push({
            id: sigId,
            source: 'rule',
            sourceId: h.rule.id,
            code: h.rule.code,
            name: h.it.name,
            kind: h.it.kind as InstrumentKind,
            typeName: h.rule.name,
            side,
            sideLabel: RULE_SIDE_LABEL[side],
            confidence: h.confidence,
            reason: h.detail,
            time: prev ? prev.time : now,
          })
          if (!prev) added++
        }
        // 同步规则历史到 rules store（「规则」页历史列表沿用，含 6h 去重）
        rulesStore.appendSignals(
          ruleHits.map((h) => ({
            ruleId: h.rule.id,
            ruleName: h.rule.name,
            code: h.rule.code,
            name: h.it.name,
            kind: h.it.kind as InstrumentKind,
            signal: h.rule.signal,
            confidence: h.confidence,
            time: now,
            detail: h.detail.join(' · '),
            metrics: h.metrics,
          })),
        )
      }

      signals.value = next
      persistSignals()
      lastEvalAt.value = now

      if (added > 0) {
        const announce = useAnnounceStore()
        const st = useSettingsStore()
        for (const s of next.filter((x) => x.time > lastReadAt.value && !prevMap.has(x.id))) {
          announce.push({ kind: 'signal', title: `${s.name} · ${s.sideLabel}`, body: s.reason[0] ?? s.typeName })
          if (st.notify) showNotification(`${s.name} · ${s.sideLabel}`, { body: s.reason[0] ?? s.typeName })
        }
        sheetVisible.value = true
      } else if (firstEval && unreadCount.value > 0) {
        sheetVisible.value = true
      }
      firstEval = false
    } catch (e) {
      error.value = e instanceof Error ? e.message : '提醒评估失败'
    } finally {
      evaluating.value = false
    }
    return added
  }

  return {
    instances,
    signals,
    evaluating,
    lastEvalAt,
    lastReadAt,
    sheetVisible,
    error,
    unreadCount,
    buySignals,
    sellSignals,
    latestSignals,
    templateById,
    enableTemplate,
    toggleTemplate,
    templateOn,
    enableForAll,
    disableInstance,
    setEnabled,
    instancesOf,
    hasAny,
    markAllRead,
    markRead,
    showSheet,
    hideSheet,
    evaluateAll,
  }
})
