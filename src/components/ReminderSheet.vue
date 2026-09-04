<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useReminderStore } from '@/stores/reminders'
import { kindColor, kindLabel } from '@/types/instrument'

const router = useRouter()
const reminders = useReminderStore()

const visible = computed(() => reminders.sheetVisible)
const items = computed(() => reminders.signals.filter((s) => s.time > reminders.lastReadAt))

function close() {
  reminders.hideSheet()
}
function markRead() {
  reminders.markAllRead()
}
function viewAll() {
  reminders.markAllRead()
  router.push({ name: 'reminders' })
}
function goDetail(code: string) {
  reminders.markAllRead()
  router.push({ name: 'instrument-detail', params: { code } })
}
</script>

<template>
  <transition name="sheet">
    <div v-if="visible" class="sheet-mask" @click.self="close">
      <div class="sheet">
        <div class="sheet-bar">
          <span class="sheet-title">今日买卖提醒（{{ items.length }}）</span>
          <button class="sheet-close" aria-label="关闭" @click="close">×</button>
        </div>
        <div class="sheet-body">
          <div
            v-for="s in items"
            :key="s.id"
            class="sheet-card"
            :class="s.side"
            @click="goDetail(s.code)"
          >
            <div class="sc-head">
              <span class="sc-badge" :class="s.side">{{ s.sideLabel }}</span>
              <span class="sc-name" :style="{ color: kindColor(s.kind) }">{{ s.name }}</span>
              <span class="sc-kind">{{ kindLabel(s.kind) }}</span>
            </div>
            <div class="sc-reason">{{ s.reason[0] }}</div>
          </div>
        </div>
        <div class="sheet-foot">
          <button class="sf-btn ghost" @click="markRead">全部已读</button>
          <button class="sf-btn primary" @click="viewAll">查看全部</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-1);
  border-radius: 16px 16px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
}
.sheet-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
  border-bottom: 1px solid var(--color-border-2);
}
.sheet-title {
  font-size: 15px;
  font-weight: 600;
}
.sheet-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  color: var(--color-text-3);
  cursor: pointer;
}
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sheet-card {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--color-bg-2);
  border-left: 4px solid var(--color-text-4);
  cursor: pointer;
}
.sheet-card.buy {
  border-left-color: #00b42a;
}
.sheet-card.sell {
  border-left-color: #f53f3f;
}
.sheet-card.hold {
  border-left-color: var(--color-text-4);
}
.sc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.sc-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
}
.sc-badge.buy {
  background: rgba(0, 180, 42, 0.12);
  color: #00b42a;
}
.sc-badge.sell {
  background: rgba(245, 63, 63, 0.12);
  color: #f53f3f;
}
.sc-badge.hold {
  background: var(--color-fill-2);
  color: var(--color-text-2);
}
.sc-name {
  font-weight: 600;
}
.sc-kind {
  font-size: 12px;
  color: var(--color-text-3);
}
.sc-reason {
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.5;
}
.sheet-foot {
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border-2);
}
.sf-btn {
  flex: 1;
  height: 40px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--color-border-2);
}
.sf-btn.ghost {
  background: transparent;
  color: var(--color-text-2);
}
.sf-btn.primary {
  background: rgb(var(--primary-6));
  color: #fff;
  border-color: rgb(var(--primary-6));
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.25s ease;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}
</style>
