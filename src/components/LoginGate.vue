<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const token = ref('')

async function submit() {
  if (!token.value.trim()) return
  await auth.login(token.value.trim())
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="logo">
        <svg viewBox="0 0 32 32" width="40" height="40">
          <rect x="2" y="14" width="9" height="16" rx="2" fill="#165dff" />
          <rect x="11.5" y="8" width="9" height="22" rx="2" fill="#4080ff" />
          <rect x="21" y="2" width="9" height="28" rx="2" fill="#73a6ff" />
        </svg>
      </div>
      <h1>投资监控</h1>
      <p class="sub">请输入访问口令继续</p>
      <a-input
        v-model="token"
        type="password"
        size="large"
        placeholder="访问口令"
        autofocus
        @press-enter="submit"
      />
      <a-button type="primary" size="large" long @click="submit">进入</a-button>
      <div class="err">{{ auth.error }}</div>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-1);
  padding: 16px;
  box-sizing: border-box;
}
.login-card {
  background: var(--color-bg-2);
  border-radius: 14px;
  padding: 36px 32px;
  width: min(90vw, 360px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  text-align: center;
}
.logo {
  margin-bottom: 12px;
}
h1 {
  font-size: 18px;
  margin: 0 0 6px;
  color: #1d2129;
}
.sub {
  font-size: 13px;
  color: #86909c;
  margin: 0 0 22px;
}
.err {
  color: #f53f3f;
  font-size: 12px;
  margin-top: 10px;
  min-height: 16px;
}
</style>
