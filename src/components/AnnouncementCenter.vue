<script setup lang="ts">
import { computed } from 'vue'
import { IconNotification, IconClose } from '@arco-design/web-vue/es/icon'
import { useAnnounceStore } from '@/stores/announce'
import { useIsMobile } from '@/composables/useIsMobile'

const store = useAnnounceStore()
const isMobile = useIsMobile()

const list = computed(() => store.items)
</script>

<template>
  <div v-if="list.length" class="announce-wrap" :class="{ mobile: isMobile }">
    <transition-group name="announce">
      <div v-for="a in list" :key="a.id" class="announce-card" :class="a.kind">
        <div class="announce-icon">
          <component :is="IconNotification" :size="18" />
        </div>
        <div class="announce-body">
          <div class="announce-title">{{ a.title }}</div>
          <div v-if="a.body" class="announce-text">{{ a.body }}</div>
        </div>
        <button class="announce-close" aria-label="关闭" @click="store.dismiss(a.id)">
          <component :is="IconClose" :size="16" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.announce-wrap {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 320px;
  max-width: calc(100vw - 24px);
  pointer-events: none;
}
.announce-wrap.mobile {
  top: 56px;
  right: 12px;
  left: 12px;
  width: auto;
}
.announce-card {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px;
  background: #fff;
  border: 1px solid var(--color-border-2);
  border-left: 3px solid #165dff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.announce-card.kind-info {
  border-left-color: #13c2c2;
}
.announce-icon {
  flex-shrink: 0;
  color: #165dff;
  margin-top: 1px;
}
.kind-info .announce-icon {
  color: #13c2c2;
}
.announce-body {
  flex: 1;
  min-width: 0;
}
.announce-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
}
.announce-text {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.5;
  word-break: break-all;
}
.announce-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  border-radius: 6px;
  cursor: pointer;
}
.announce-close:hover {
  background: var(--color-fill-2);
  color: var(--color-text-1);
}
.announce-enter-active,
.announce-leave-active {
  transition: all 0.25s ease;
}
.announce-enter-from,
.announce-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
