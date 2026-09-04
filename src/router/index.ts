import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layout/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '总览' },
      },
      {
        path: 'instruments',
        name: 'instruments',
        component: () => import('@/views/instruments/index.vue'),
        meta: { title: '标的库' },
      },
      {
        path: 'reminders',
        name: 'reminders',
        component: () => import('@/views/reminders/index.vue'),
        meta: { title: '买卖提醒' },
      },
      {
        path: 'instruments/:code',
        name: 'instrument-detail',
        component: () => import('@/views/instruments/detail.vue'),
        meta: { title: '标的信息' },
      },
      {
        path: 'rules',
        name: 'rules',
        component: () => import('@/views/rules/index.vue'),
        meta: { title: '规则' },
      },
      {
        path: 'tools',
        name: 'tools',
        component: () => import('@/views/tools/index.vue'),
        meta: { title: '回测' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '设置' },
      },
    ],
  },
  { path: '/funds', redirect: '/instruments' },
  { path: '/funds/:code', redirect: (to) => `/instruments/${to.params.code}` },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 投资监控` : '投资监控'
})

export default router
