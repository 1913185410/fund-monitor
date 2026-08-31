/** 浏览器通知助手（页面打开期间可用） */

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported'

export function notificationPermission(): NotifyPermission {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission as NotifyPermission
}

/** 请求通知权限，返回是否已授权 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const p = await Notification.requestPermission()
    return p === 'granted'
  } catch {
    return false
  }
}

/** 弹出通知（仅在已授权且支持时生效，失败静默） */
export function showNotification(title: string, options?: NotificationOptions): void {
  try {
    if (isNotificationSupported() && Notification.permission === 'granted') {
      new Notification(title, { icon: '/favicon.svg', ...options })
    }
  } catch {
    /* 忽略通知失败 */
  }
}
