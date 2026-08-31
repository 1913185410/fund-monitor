/** 持有记录（买入日期/金额/份额）：用于持有期与赎回费提醒，本地存储 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface HoldingRecord {
  id: string
  code: string
  /** 买入日期 YYYY-MM-DD */
  date: string
  /** 买入金额（元） */
  amount: number
  /** 买入份额 */
  share: number
}

const KEY = 'fm:holdings'

function load(): HoldingRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v.filter((r) => r?.code)
    }
  } catch {
    /* ignore */
  }
  return []
}

function persist(list: HoldingRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

/** 常见场外基金赎回费率档位（按持有天数，仅供参考，实际以基金合同为准） */
export function redeemFeeRate(days: number): number {
  if (days < 7) return 1.5
  if (days < 30) return 0.75
  if (days < 365) return 0.5
  if (days < 730) return 0.25
  return 0
}

export function redeemFeeLabel(days: number): string {
  const r = redeemFeeRate(days)
  if (r === 0) return '免赎回费'
  if (days < 7) return `不满 7 天 · ${r}%`
  return `${r}%`
}

function daysBetween(from: string, to: Date): number {
  const f = new Date(from)
  if (Number.isNaN(f.getTime())) return 0
  return Math.max(0, Math.floor((to.getTime() - f.getTime()) / 86400000))
}

let seed = 0
const nextId = () => `${Date.now().toString(36)}${(seed++).toString(36)}`

export const useHoldingsStore = defineStore('holdings', () => {
  const records = ref<HoldingRecord[]>(load())

  function addRecord(code: string, date: string, amount: number, share: number) {
    records.value.unshift({ id: nextId(), code, date, amount, share })
    persist(records.value)
  }

  function removeRecord(id: string) {
    records.value = records.value.filter((r) => r.id !== id)
    persist(records.value)
  }

  function recordsOf(code: string): HoldingRecord[] {
    return records.value.filter((r) => r.code === code)
  }

  /** 持有天数：按最早一笔买入至今 */
  function holdingDays(code: string): number {
    const list = recordsOf(code)
    if (!list.length) return 0
    const earliest = list.map((r) => r.date).sort()[0]
    return daysBetween(earliest, new Date())
  }

  return { records, addRecord, removeRecord, recordsOf, holdingDays }
})
