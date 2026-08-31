<script setup lang="ts">
import { ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import '@arco-design/web-vue/es/message/style/css.js'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'
import { useAuthStore } from '@/stores/auth'
import { stateApi } from '@/api/state'

const settings = useSettingsStore()
const sync = useSyncStore()
const auth = useAuthStore()

const oldPwd = ref('')
const newPwd = ref('')
const confirmPwd = ref('')
const changing = ref(false)

function fmtTime(t: number | null) {
  if (!t) return '—'
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function onNotifyChange(v: boolean) {
  const ok = await settings.setNotify(v)
  if (v && !ok) {
    Message.warning('通知权限未开启，请在浏览器设置中允许本网站通知')
  } else {
    Message.success(ok ? '通知已开启' : '通知已关闭')
  }
}

async function onChangePwd() {
  if (!oldPwd.value || !newPwd.value || !confirmPwd.value) {
    Message.warning('请填写完整')
    return
  }
  if (newPwd.value !== confirmPwd.value) {
    Message.warning('两次输入的新口令不一致')
    return
  }
  if (newPwd.value.length < 4) {
    Message.warning('新口令至少 4 位')
    return
  }
  changing.value = true
  try {
    await stateApi.changePassword(oldPwd.value, newPwd.value)
    localStorage.removeItem('fm_token')
    auth.authed = false
    Message.success('口令已修改，请用新口令重新登录')
    oldPwd.value = newPwd.value = confirmPwd.value = ''
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '修改失败')
  } finally {
    changing.value = false
  }
}
</script>

<template>
  <div class="settings">
    <a-card title="通知提醒" :bordered="false" class="scard">
      <div class="row">
        <div class="row-text">
          <div class="row-title">规则命中提醒</div>
          <div class="row-desc">
            开启后，当规则评估出新的买卖信号时，浏览器会弹通知。
            <template v-if="settings.notifyPermission === 'denied'">（当前浏览器已拒绝通知权限，需在浏览器设置中允许）</template>
            <template v-else>（仅页面打开期间生效，关闭页面后无法后台提醒）</template>
          </div>
        </div>
        <a-switch :model-value="settings.notify" @change="onNotifyChange" />
      </div>
    </a-card>

    <a-card title="数据同步" :bordered="false" class="scard">
      <div class="row">
        <div class="row-text">
          <div class="row-title">跨设备同步</div>
          <div class="row-desc">
            自选股与规则保存在云端，换设备登录后自动恢复。
            <template v-if="sync.lastSyncedAt">最近同步：{{ fmtTime(sync.lastSyncedAt) }}</template>
            <template v-else>尚未同步</template>
            <span v-if="sync.error" class="err">（{{ sync.error }}）</span>
          </div>
        </div>
        <a-button size="small" :loading="sync.loading" @click="sync.pull">立即同步</a-button>
      </div>
    </a-card>

    <a-card title="修改访问口令" :bordered="false" class="scard">
      <a-form layout="vertical" :style="{ maxWidth: '420px' }">
        <a-form-item label="当前口令">
          <a-input v-model="oldPwd" type="password" placeholder="输入当前口令" />
        </a-form-item>
        <a-form-item label="新口令（至少 4 位）">
          <a-input v-model="newPwd" type="password" placeholder="输入新口令" />
        </a-form-item>
        <a-form-item label="确认新口令">
          <a-input v-model="confirmPwd" type="password" placeholder="再次输入新口令" @press-enter="onChangePwd" />
        </a-form-item>
        <a-button type="primary" :loading="changing" @click="onChangePwd">保存新口令</a-button>
      </a-form>
      <div class="tip">修改后所有设备需用新口令重新登录。</div>
    </a-card>

    <a-card title="关于" :bordered="false" class="scard">
      <div class="about">
        <div>多资产投资监控终端</div>
        <div class="dim">页面托管于 Cloudflare Pages · 数据接口与同步存储位于腾讯云</div>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.scard {
  border-radius: 8px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.row-text {
  min-width: 0;
}
.row-title {
  font-weight: 500;
}
.row-desc {
  color: var(--color-text-3);
  font-size: 13px;
  margin-top: 4px;
  line-height: 1.6;
}
.err {
  color: rgb(var(--red-6));
}
.tip {
  color: var(--color-text-3);
  font-size: 12px;
  margin-top: 10px;
}
.about {
  color: var(--color-text-1);
}
.dim {
  color: var(--color-text-3);
  font-size: 13px;
  margin-top: 4px;
}
</style>
