/** 应用设置（通知开关、明暗主题等），主题跟随 localStorage 本地持久化 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { notificationPermission, requestNotificationPermission } from '@/utils/notify'

const THEME_KEY = 'fm:theme'

export type ThemeMode = 'light' | 'dark'

function loadTheme(): ThemeMode {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'dark' || t === 'light') return t
  } catch {
    /* ignore */
  }
  return 'light'
}

export const useSettingsStore = defineStore('settings', () => {
  const notify = ref(false)
  const notifyPermission = ref(notificationPermission())
  const theme = ref<ThemeMode>(loadTheme())

  /** 把当前主题应用到 <body>，供 Arco 暗色变量（[arco-theme=dark]）生效 */
  function applyTheme() {
    if (typeof document === 'undefined') return
    if (theme.value === 'dark') document.body.setAttribute('arco-theme', 'dark')
    else document.body.removeAttribute('arco-theme')
  }
  /** 初始化时立即应用（在 setup 阶段同步调用，避免首屏闪烁） */
  function initTheme() {
    applyTheme()
  }
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, theme.value)
    } catch {
      /* ignore */
    }
    applyTheme()
  }

  /** 开启通知：先请求浏览器授权；授权失败则保持关闭 */
  async function setNotify(v: boolean): Promise<boolean> {
    if (v) {
      const ok = await requestNotificationPermission()
      notifyPermission.value = notificationPermission()
      if (!ok) return false
      notify.value = true
      return true
    }
    notify.value = false
    return true
  }

  return { notify, notifyPermission, theme, initTheme, toggleTheme, setNotify, applyTheme }
})
