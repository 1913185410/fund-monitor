/** 跨设备同步：启动时从云端拉取，本地数据变更后防抖推送到云端（COS） */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { stateApi } from '@/api/state'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { useSettingsStore } from '@/stores/settings'

const PUSH_DELAY = 1500

export const useSyncStore = defineStore('sync', () => {
  const lastSyncedAt = ref<number | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  let pushTimer: number | null = null
  let applying = false
  let watching = false

  /** 应用云端状态到本地（拉取时调用，不触发回写）；云端为空而本地有数据时保留本地，避免误清空 */
  function applyState(s: { portfolio?: unknown; rules?: unknown; settings?: { notify?: boolean } }) {
    const p = usePortfolioStore()
    const r = useRulesStore()
    const st = useSettingsStore()
    applying = true
    let localNewer = false
    try {
      if (Array.isArray(s.portfolio)) {
        if (s.portfolio.length === 0 && p.funds.length > 0) localNewer = true
        else p.replaceAll(s.portfolio as never)
      }
      if (Array.isArray(s.rules)) {
        if (s.rules.length === 0 && r.rules.length > 0) localNewer = true
        else r.replaceAll(s.rules as never)
      }
      if (s.settings && typeof s.settings.notify === 'boolean') st.notify = s.settings.notify
    } finally {
      applying = false
    }
    return { localNewer }
  }

  /** 从云端拉取状态并覆盖本地 */
  async function pull() {
    loading.value = true
    try {
      const s = await stateApi.getState()
      const { localNewer } = applyState(s)
      // 本地有数据而云端为空时，回推一次，让云端恢复
      if (localNewer) void push()
      lastSyncedAt.value = Date.now()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : '同步失败'
    } finally {
      loading.value = false
    }
  }

  /** 把本地状态推送到云端 */
  async function push() {
    if (pushTimer) {
      window.clearTimeout(pushTimer)
      pushTimer = null
    }
    try {
      const p = usePortfolioStore()
      const r = useRulesStore()
      const st = useSettingsStore()
      await stateApi.saveState({ portfolio: p.funds, rules: r.rules, settings: { notify: st.notify } })
      lastSyncedAt.value = Date.now()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : '同步失败'
    }
  }

  /** 数据变更标记：防抖推送 */
  function markDirty() {
    if (applying) return
    if (pushTimer) window.clearTimeout(pushTimer)
    pushTimer = window.setTimeout(() => {
      void push()
    }, PUSH_DELAY)
  }

  /** 挂载监听（只挂一次）：自选股结构、规则、通知开关变更时自动同步 */
  function init() {
    if (watching) return
    watching = true
    const p = usePortfolioStore()
    const r = useRulesStore()
    const st = useSettingsStore()
    watch(
      () => p.funds.map((f) => `${f.code}|${f.holdingAmount ?? 0}|${f.name}`).join(','),
      markDirty,
    )
    watch(() => JSON.stringify(r.rules), markDirty)
    watch(() => st.notify, markDirty)
  }

  return { lastSyncedAt, error, loading, pull, push, markDirty, init }
})
