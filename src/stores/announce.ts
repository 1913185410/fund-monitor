/** 应用内弹窗公告状态：规则信号等触发，可关闭、已读去重（不依赖浏览器通知权限） */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface Announcement {
  id: string
  title: string
  body: string
  time: number
  kind: 'signal' | 'info'
}

const READ_KEY = 'fm:announce-read'
const DEDUP_MS = 6 * 3600 * 1000

function loadRead(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v
    }
  } catch {
    /* ignore */
  }
  return []
}

function saveRead(list: string[]) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(list.slice(0, 200)))
  } catch {
    /* ignore */
  }
}

export const useAnnounceStore = defineStore('announce', () => {
  const items = ref<Announcement[]>([])
  const readTitles = ref<Set<string>>(new Set(loadRead()))

  /** 入队一条公告；同标题在去重窗口内只保留一条，且已读过的不再弹出 */
  function push(a: Omit<Announcement, 'id' | 'time'>) {
    const now = Date.now()
    if (readTitles.value.has(a.title)) return
    const dup = items.value.some((it) => it.title === a.title && now - it.time < DEDUP_MS)
    if (dup) return
    items.value.unshift({ ...a, id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, time: now })
    if (items.value.length > 10) items.value.pop()
  }

  function dismiss(id: string) {
    const it = items.value.find((x) => x.id === id)
    items.value = items.value.filter((x) => x.id !== id)
    if (it) {
      readTitles.value.add(it.title)
      saveRead([...readTitles.value])
    }
  }

  function clearAll() {
    items.value.forEach((it) => readTitles.value.add(it.title))
    items.value = []
    saveRead([...readTitles.value])
  }

  const unread = computed(() => items.value)

  return { items, unread, push, dismiss, clearAll }
})
