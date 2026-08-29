import { readonly, ref } from 'vue'

/** 判断是否为移动端（宽度 < 768px），并根据视口变化自动更新 */
const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile() {
  const isMobile = ref(false)

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => {
      isMobile.value = mql.matches
    }
    update()
    mql.addEventListener('change', update)
  }

  return readonly(isMobile)
}