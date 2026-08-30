import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getJSON } from '@/api/http'

interface AuthStatus {
  enabled: boolean
  authed: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const enabled = ref(false)
  const authed = ref(true)
  const checking = ref(true)
  const error = ref('')

  /** 启动时探测：是否需要口令 + 当前是否已登录 */
  async function init() {
    checking.value = true
    try {
      const s = await getJSON<AuthStatus>('/auth/status')
      enabled.value = !!s.enabled
      authed.value = !s.enabled || !!s.authed
    } catch {
      enabled.value = false
      authed.value = true
    } finally {
      checking.value = false
    }
  }

  /** 提交口令：成功则服务端种 Cookie 并返回 true */
  async function login(token: string): Promise<boolean> {
    error.value = ''
    try {
      const res = await fetch(`/api/auth?token=${encodeURIComponent(token)}`)
      const finalUrl = res.url || ''
      if (finalUrl.includes('?e=1')) {
        error.value = '口令不正确，请重试'
        return false
      }
      await init()
      return authed.value
    } catch {
      error.value = '网络错误，请重试'
      return false
    }
  }

  return { enabled, authed, checking, error, init, login }
})
