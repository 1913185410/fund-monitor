<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconNotification, IconClose } from '@arco-design/web-vue/es/icon'
import { useAnnounceStore } from '@/stores/announce'
import { useIsMobile } from '@/composables/useIsMobile'

const store = useAnnounceStore()
const isMobile = useIsMobile()
const open = ref(false)

const list = computed(() => store.items)

function fmtTime(t: number) {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<template>
  <button class="bell-btn" :aria-label="`通知 (${list.length})`" @click="open = true">
    <IconNotification :size="20" />
    <span v-if="list.length" class="bell-badge">{{ list.length > 99 ? '99+' : list.length }}</span>
  </button>

  <a-drawer
    v-model:visible="open"
    :width="isMobile ? '100%' : 360"
    title="通知中心"
    :footer="false"
    class="noti-drawer"
  >
    <a-empty v-if="!list.length" description="暂无通知" />
    <div v-for="a in list" :key="a.id" class="noti-item" :class="a.kind">
      <div class="noti-dot" />
      <div class="noti-main">
        <div class="noti-title">{{ a.title }}</div>
        <div v-if="a.body" class="noti-body">{{ a.body }}</div>
        <div class="noti-time">{{ fmtTime(a.time) }}</div>
      </div>
      <button class="noti-close" aria-label="关闭" @click="store.dismiss(a.id)">
        <IconClose :size="14" />
      </button>
    </div>

    <div v-if="list.length" class="noti-footer">
      <a-button long status="danger" @click="store.clearAll()">全部清除</a-button>
    </div>
  </a-drawer>
</template>

<style scoped>
.bell-btn {
  position: relative;
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
.bell-btn:hover {
  background: var(--color-fill-2);
}
.bell-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9px;
  background: #f53f3f;
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--color-bg-2);
}
.noti-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  margin-bottom: 10px;
}
.noti-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #165dff;
}
.noti-item.kind-info .noti-dot {
  background: #13c2c2;
}
.noti-main {
  flex: 1;
  min-width: 0;
}
.noti-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
}
.noti-body {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.5;
  word-break: break-all;
}
.noti-time {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-3);
}
.noti-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
}
.noti-close:hover {
  background: var(--color-fill-2);
  color: var(--color-text-1);
}
.noti-footer {
  margin-top: 8px;
}
</style>
