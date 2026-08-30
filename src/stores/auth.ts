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

  /** 提交口令：成功则保存令牌（跨域 Bearer 鉴权）并刷新登录态 */
  async function login(token: string): Promise<boolean> {
    error.value = ''
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? ''
      const res = await fetch(`${base}/api/auth?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        error.value = '口令不正确，请重试'
        return false
      }
      const data = await res.json()
      if (data?.ok) {
        if (data.token) localStorage.setItem('fm_token', data.token)
        await init()
        return authed.value
      }
      error.value = '口令不正确，请重试'
      return false
    } catch {
      error.value = '网络错误，请重试'
      return false
    }
  }

  return { enabled, authed, checking, error, init, login }
})
