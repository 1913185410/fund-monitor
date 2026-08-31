<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginGate from '@/components/LoginGate.vue'
import AnnouncementCenter from '@/components/AnnouncementCenter.vue'

const auth = useAuthStore()
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
