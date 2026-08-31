/** 应用状态（跨设备同步）API */
import { getJSON, send } from './http'
import type { Instrument } from '@/types/instrument'
import type { Rule } from '@/types/rule'

export interface AppSettings {
  notify: boolean
}

export interface AppState {
  portfolio: Instrument[]
  rules: Rule[]
  settings: AppSettings
}

export const stateApi = {
  getState: () => getJSON<AppState>('/state'),
  saveState: (s: AppState) => send<{ ok: boolean }>('/state', 'PUT', s),
  changePassword: (old: string, next: string) =>
    send<{ ok: boolean }>('/settings/password', 'POST', { old, next }),
}
