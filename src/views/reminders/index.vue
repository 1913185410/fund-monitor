<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useReminderStore } from '@/stores/reminders'
import { useRulesStore } from '@/stores/rules'
import { usePortfolioStore } from '@/stores/portfolio'
import ReminderComposer from '@/components/ReminderComposer.vue'
import { kindLabel, kindColor } from '@/types/instrument'
import type { Rule } from '@/types/rule'

const router = useRouter()
const reminders = useReminderStore()
const rulesStore = useRulesStore()
const portfolio = usePortfolioStore()

type FilterKey = 'all' | 'buy' | 'sell' | 'unread'
type SourceKey = 'all' | 'template' | 'rule'
const activeFilter = ref<FilterKey>('all')
const activeSource = ref<SourceKey>('all')

const list = computed(() => {
  let all = reminders.signals
  if (activeSource.value === 'template') all = all.filter((s) => s.source === 'template')
  else if (activeSource.value === 'rule') all = all.filter((s) => s.source === 'rule')
  if (activeFilter.value === 'buy') return all.filter((s) => s.side === 'buy')
  if (activeFilter.value === 'sell') return all.filter((s) => s.side === 'sell')
  if (activeFilter.value === 'unread') return all.filter((s) => s.time > reminders.lastReadAt)
  return all
})

const unread = computed(() => reminders.unreadCount)
const todayProfit = computed(() => portfolio.todayProfit)
const totalAmount = computed(() => portfolio.totalHoldingAmount)
const totalProfit = computed(() => portfolio.totalProfit)
const totalProfitRate = computed(() => portfolio.totalProfitRate)
/** 监控总数 = 形态模板实例 + 自定义规则 */
const monitorCount = computed(() => reminders.instances.length + rulesStore.rules.length)
const hasAnyMonitor = computed(() => reminders.instances.length > 0 || rulesStore.rules.length > 0)

function fmtMoney(v: number) {
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtTime(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function goDetail(code: string) {
  router.push({ name: 'instrument-detail', params: { code } })
  reminders.markAllRead()
}
function enableDefaults() {
  reminders.enableForAll('week-macd-oversold-accel')
  reminders.enableForAll('day-macd-death-cross')
  reminders.evaluateAll()
}
function toggleInstance(id: string, enabled: boolean) {
  reminders.setEnabled(id, enabled)
  reminders.evaluateAll()
}
function toggleRule(r: Rule, enabled: boolean) {
  rulesStore.updateRule({ ...r, enabled })
  reminders.evaluateAll()
}
function removeRule(r: Rule) {
  rulesStore.removeRule(r.id)
  reminders.evaluateAll()
}

/* ---------- 新建/编辑 composer ---------- */
const composerOpen = ref(false)
const editRule = ref<Rule | null>(null)
function openCreate() {
  editRule.value = null
  composerOpen.value = true
}
function openEditRule(r: Rule) {
  editRule.value = r
  composerOpen.value = true
}
</script>

<template>
  <div class="reminders-page">
    <!-- 账户今日概览 -->
    <div class="account-card">
      <div class="ac-item">
        <div class="ac-label">今日盈亏</div>
        <div class="ac-value" :class="todayProfit >= 0 ? 'grow' : 'shrink'">
          {{ todayProfit >= 0 ? '+' : '' }}{{ fmtMoney(todayProfit) }}
        </div>
      </div>
      <div class="ac-item">
        <div class="ac-label">持仓市值</div>
        <div class="ac-value">{{ fmtMoney(totalAmount) }}</div>
      </div>
      <div class="ac-item">
        <div class="ac-label">累计收益</div>
        <div class="ac-value" :class="totalProfit >= 0 ? 'grow' : 'shrink'">
          {{ totalProfit >= 0 ? '+' : '' }}{{ fmtMoney(totalProfit) }}
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="seg">
      <button :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">全部</button>
      <button :class="{ active: activeFilter === 'buy' }" @click="activeFilter = 'buy'">买点</button>
      <button :class="{ active: activeFilter === 'sell' }" @click="activeFilter = 'sell'">卖出</button>
      <button :class="{ active: activeFilter === 'unread' }" @click="activeFilter = 'unread'">
        未读{{ unread ? `(${unread})` : '' }}
      </button>
      <span class="seg-divider" />
      <button :class="{ active: activeSource === 'template' }" @click="activeSource = 'template'">模板</button>
      <button :class="{ active: activeSource === 'rule' }" @click="activeSource = 'rule'">自定义</button>
      <button class="mark-read" @click="reminders.markAllRead()">全部已读</button>
    </div>

    <!-- 空态：无任何监控 -->
    <div v-if="!hasAnyMonitor" class="empty-state">
      <div class="es-title">还没有设置任何买卖提醒</div>
      <p class="es-desc">
        支持两类提醒：内置形态模板开箱即用，或用 23 项指标自定义条件。
        行情满足条件时自动出卡片、弹窗提醒。
      </p>
      <div class="empty-actions">
        <a-button type="primary" @click="enableDefaults">为全部持仓启用默认模板</a-button>
        <a-button @click="openCreate">新建自定义提醒</a-button>
      </div>
    </div>

    <!-- 信号卡片流 -->
    <div v-else-if="list.length" class="signal-list">
      <div
        v-for="s in list"
        :key="s.id"
        class="signal-card"
        :class="s.side"
        @click="goDetail(s.code)"
      >
        <div class="sc-head">
          <span class="sc-badge" :class="s.side">{{ s.sideLabel }}</span>
          <span class="sc-name" :style="{ color: kindColor(s.kind) }">{{ s.name }}</span>
          <span class="sc-kind">{{ kindLabel(s.kind) }} · {{ s.code }}</span>
          <span class="sc-source" :class="s.source">{{ s.source === 'template' ? '模板' : '自定义' }}</span>
          <span class="sc-confidence">置信 {{ s.confidence }}%</span>
        </div>
        <ul class="sc-reason">
          <li v-for="(r, i) in s.reason" :key="i">{{ r }}</li>
        </ul>
        <div class="sc-foot">
          <span class="sc-tpl">{{ s.source === 'template' ? '形态' : '条件' }} · {{ s.typeName }}</span>
          <span class="sc-time">{{ fmtTime(s.time) }}</span>
        </div>
      </div>
    </div>

    <!-- 空：已配置但当前无信号 -->
    <div v-else class="empty-state">
      <div class="es-title">当前没有触发信号的标的</div>
      <p class="es-desc">已开启 {{ monitorCount }} 项监控，行情满足条件时这里会出现卡片。</p>
    </div>

    <!-- 监控中的提醒（形态模板 + 自定义条件规则） -->
    <div v-if="hasAnyMonitor" class="my-rules">
      <div class="mr-title">监控中的提醒（{{ monitorCount }}）</div>

      <div v-for="ins in reminders.instances" :key="'t' + ins.id" class="mr-item">
        <span class="mr-src tpl">模板</span>
        <div class="mr-info">
          <span class="mr-name">{{ reminders.templateById(ins.templateId)?.name }}</span>
          <span class="mr-desc">{{ ins.code }}</span>
        </div>
        <a-switch :model-value="ins.enabled" @change="(v: any) => toggleInstance(ins.id, v)" />
      </div>

      <div v-for="r in rulesStore.rules" :key="'r' + r.id" class="mr-item clickable" @click="openEditRule(r)">
        <span class="mr-src rule">自定义</span>
        <div class="mr-info">
          <span class="mr-name">{{ r.name }}</span>
          <span class="mr-desc">{{ r.code }} · {{ r.conditions.length }} 条件 · {{ r.signal }}</span>
        </div>
        <a-switch :model-value="r.enabled" @click.stop @change="(v: any) => toggleRule(r, v)" />
        <button class="mr-del" aria-label="删除" @click.stop="removeRule(r)">×</button>
      </div>
    </div>
  </div>

  <!-- FAB 新建提醒 -->
  <button class="fab" aria-label="新建提醒" @click="openCreate">＋</button>

  <ReminderComposer v-model="composerOpen" :edit-rule="editRule" />
</template>

<style scoped>
.reminders-page {
  max-width: 760px;
  margin: 0 auto;
}
.account-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  border-radius: 12px;
  margin-bottom: 14px;
}
.ac-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ac-label {
  font-size: 12px;
  color: var(--color-text-3);
}
.ac-value {
  font-size: 20px;
  font-weight: 700;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}
.seg button {
  padding: 6px 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 999px;
  background: var(--color-bg-2);
  color: var(--color-text-2);
  font-size: 13px;
  cursor: pointer;
}
.seg button.active {
  border-color: rgb(var(--primary-6));
  color: rgb(var(--primary-6));
}
.seg .mark-read {
  margin-left: auto;
  border-color: transparent;
  color: var(--color-text-3);
}
.empty-state {
  text-align: center;
  padding: 40px 16px;
}
.es-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 10px;
}
.es-desc {
  color: var(--color-text-3);
  font-size: 13px;
  line-height: 1.7;
  margin-bottom: 18px;
  max-width: 520px;
  margin-left: auto;
  margin-right: auto;
}
.signal-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.signal-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  border-left: 4px solid var(--color-text-4);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.signal-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.signal-card.buy {
  border-left-color: #00b42a;
}
.signal-card.sell {
  border-left-color: #f53f3f;
}
.signal-card.hold {
  border-left-color: var(--color-text-4);
}
.sc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.sc-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
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
.sc-source {
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 5px;
  border: 1px solid var(--color-border-2);
  color: var(--color-text-3);
}
.sc-source.template {
  color: rgb(var(--primary-6));
  border-color: rgba(22, 93, 255, 0.35);
  background: rgba(22, 93, 255, 0.06);
}
.sc-source.rule {
  color: #722ed1;
  border-color: rgba(114, 46, 209, 0.4);
  background: rgba(114, 46, 209, 0.06);
}
.sc-name {
  font-weight: 600;
}
.sc-kind {
  font-size: 12px;
  color: var(--color-text-3);
}
.sc-confidence {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-3);
}
.sc-reason {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-2);
}
.sc-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-4);
}
.my-rules {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-2);
}
.mr-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-3);
  margin-bottom: 10px;
}
.mr-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}
.mr-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mr-name {
  font-weight: 600;
}
.mr-desc {
  font-size: 12px;
  color: var(--color-text-3);
}
.mr-item {
  position: relative;
}
.mr-item.clickable {
  cursor: pointer;
}
.mr-src {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 5px;
  border: 1px solid var(--color-border-2);
}
.mr-src.tpl {
  color: rgb(var(--primary-6));
  border-color: rgba(22, 93, 255, 0.35);
  background: rgba(22, 93, 255, 0.06);
}
.mr-src.rule {
  color: #722ed1;
  border-color: rgba(114, 46, 209, 0.4);
  background: rgba(114, 46, 209, 0.06);
}
.mr-del {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: var(--color-fill-2);
  color: var(--color-text-3);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}
.seg-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border-2);
  margin: 0 2px;
}
.empty-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.fab {
  position: fixed;
  right: 20px;
  bottom: calc(24px + env(safe-area-inset-bottom));
  z-index: 60;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: rgb(var(--primary-6));
  color: #fff;
  font-size: 26px;
  line-height: 1;
  box-shadow: 0 4px 16px rgba(22, 93, 255, 0.35);
  cursor: pointer;
}
.reminders-page {
  padding-bottom: 80px;
}
.grow {
  color: #f53f3f;
}
.shrink {
  color: #00b42a;
}
</style>
