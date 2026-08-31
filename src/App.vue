<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import LoginGate from '@/components/LoginGate.vue'
import AnnouncementCenter from '@/components/AnnouncementCenter.vue'

const auth = useAuthStore()
const settings = useSettingsStore()
// 首屏同步应用主题，避免暗色闪烁
settings.initTheme()
watch(() => settings.theme, () => settings.applyTheme())
onMounted(() => auth.init())
</script>

<template>
  <div v-if="auth.checking" class="boot">加载中…</div>
  <LoginGate v-else-if="auth.enabled && !auth.authed" />
  <template v-else>
    <RouterView />
    <AnnouncementCenter />
  </template>
</template>

<style>
.boot {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86909c;
}
</style>
