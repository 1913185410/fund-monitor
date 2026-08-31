<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  IconDashboard,
  IconStorage,
  IconNotification,
  IconSettings,
  IconTool,
  IconSun,
  IconMoon,
} from '@arco-design/web-vue/es/icon'
import { useIsMobile } from '@/composables/useIsMobile'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { useSyncStore } from '@/stores/sync'
import { useSettingsStore } from '@/stores/settings'
import NotificationBell from '@/components/NotificationBell.vue'

const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()
const store = usePortfolioStore()
const rulesStore = useRulesStore()
const sync = useSyncStore()
const settings = useSettingsStore()

const themeIcon = computed(() => (settings.theme === 'dark' ? IconSun : IconMoon))
const themeLabel = computed(() => (settings.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'))

onMounted(() => {
  // 启动：先拉取云端状态（自选股/规则/设置），再进入行情 + 规则循环
  void sync.init()
  void sync.pull()
  const cycle = async () => {
    await Promise.allSettled([store.refresh(), rulesStore.evaluateAll()])
  }
  cycle()
  const timer = window.setInterval(cycle, 60_000)
  onUnmounted(() => window.clearInterval(timer))
})

/** 顶层导航，同时用于侧边栏菜单与底部 Tab */
const navItems = [
  { key: 'dashboard', label: '总览', icon: IconDashboard },
  { key: 'instruments', label: '标的库', icon: IconStorage },
  { key: 'rules', label: '规则', icon: IconNotification },
  { key: 'tools', label: '回测', icon: IconTool },
  { key: 'settings', label: '设置', icon: IconSettings },
]

const activeKey = computed(() => {
  const name = route.name as string
  if (name === 'instrument-detail') return 'instruments'
  return name ?? 'dashboard'
})

function go(key: string) {
  router.push({ name: key })
}
</script>

<template>
  <!-- 桌面端：左侧边栏布局 -->
  <a-layout v-if="!isMobile" class="app-layout">
    <a-layout-sider :width="200" class="app-sider">
      <div class="app-logo">
        <svg viewBox="0 0 32 32" width="26" height="26">
          <rect x="2" y="14" width="9" height="16" rx="2" fill="#165dff" />
          <rect x="11.5" y="8" width="9" height="22" rx="2" fill="#4080ff" />
          <rect x="21" y="2" width="9" height="28" rx="2" fill="#73a6ff" />
        </svg>
        <span class="app-logo-text">投资监控</span>
        <div class="logo-actions">
          <button class="action-btn" :aria-label="themeLabel" @click="settings.toggleTheme()">
            <component :is="themeIcon" :size="18" />
          </button>
          <NotificationBell />
        </div>
      </div>
      <a-menu :selected-keys="[activeKey]" @menu-item-click="go">
        <a-menu-item v-for="item in navItems" :key="item.key">
          <template #icon><component :is="item.icon" /></template>
          {{ item.label }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-content class="app-content">
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>

  <!-- 移动端：顶部标题 + 底部 Tab 导航 -->
  <div v-else class="mobile-wrap">
    <header class="mobile-header">
      <div class="mobile-logo">
        <svg viewBox="0 0 32 32" width="22" height="22">
          <rect x="2" y="14" width="9" height="16" rx="2" fill="#165dff" />
          <rect x="11.5" y="8" width="9" height="22" rx="2" fill="#4080ff" />
          <rect x="21" y="2" width="9" height="28" rx="2" fill="#73a6ff" />
        </svg>
        <span class="mobile-title">投资监控</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" :aria-label="themeLabel" @click="settings.toggleTheme()">
          <component :is="themeIcon" :size="20" />
        </button>
        <NotificationBell />
      </div>
    </header>

    <main class="mobile-body">
      <RouterView />
    </main>

    <nav class="mobile-tab-bar">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="mobile-tab"
        :class="{ active: activeKey === item.key }"
        @click="go(item.key)"
      >
        <component :is="item.icon" :size="22" class="mobile-tab-icon" />
        <span class="mobile-tab-label">{{ item.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
}
.app-sider {
  border-right: 1px solid var(--color-border-2);
}
.app-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 60px;
  padding: 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
}
.logo-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.app-content {
  padding: 20px;
}

/* 顶部操作按钮（主题切换 / 通知） */
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-1);
  cursor: pointer;
  transition: background 0.15s ease;
}
.action-btn:hover {
  background: var(--color-fill-2);
}

/* ---- 移动端样式 ---- */
.mobile-wrap {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.mobile-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 14px;
  background: #fff;
  border-bottom: 1px solid var(--color-border-2);
}
.mobile-logo {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mobile-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
}
.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.mobile-body {
  flex: 1;
  padding: 10px 10px 64px; /* 底部留出 Tab 栏空间 */
}
.mobile-tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  background: #fff;
  border-top: 1px solid var(--color-border-2);
  padding-bottom: env(safe-area-inset-bottom);
}
.mobile-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0 6px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
}
.mobile-tab.active {
  color: rgb(var(--primary-6));
}
.mobile-tab-icon {
  display: block;
}
.mobile-tab-label {
  font-size: 11px;
}
</style>
