/** 应用设置（通知开关等），跟随状态一起跨设备同步 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { notificationPermission, requestNotificationPermission } from '@/utils/notify'

export const useSettingsStore = defineStore('settings', () => {
  const notify = ref(false)
  const notifyPermission = ref(notificationPermission())

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

  return { notify, notifyPermission, setNotify }
})
