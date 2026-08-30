<script setup lang="ts">
import { computed } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { kindLabel } from '@/types/instrument'
import { SIGNAL_LABEL } from '@/types/rule'

const fundStore = usePortfolioStore()
const rulesStore = useRulesStore()

function fmtTime(t: number) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function signalColor(s: string) {
  return s === 'buy' ? 'red' : s === 'sell' ? 'green' : 'arcoblue'
}
function signalLabel(s: string) {
  return SIGNAL_LABEL[(s as 'buy' | 'sell' | 'hold')] ?? s
}

const cards = computed(() => [
  { label: '总持仓', value: fundStore.totalHoldingAmount, unit: '元', format: 'currency' },
  { label: '今日收益', value: fundStore.todayProfit, unit: '元', format: 'signedCurrency' },
  { label: '累计收益', value: fundStore.totalProfit, unit: '元', format: 'signedCurrency' },
  { label: '累计收益率', value: fundStore.totalProfitRate, unit: '%', format: 'signedPercent' },
])

function formatValue(format: string, value: number): string {
  switch (format) {
    case 'currency':
      return value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
    case 'signedCurrency':
      return `${value >= 0 ? '+' : ''}${value.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
      })}`
    case 'signedPercent':
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
    default:
      return String(value)
  }
}
</script>

<template>
  <div>
    <div class="stat-grid">
      <a-card v-for="card in cards" :key="card.label" :bordered="false" class="stat-card">
        <div class="stat-label">{{ card.label }}</div>
        <div
          class="stat-value"
          :class="{ grow: card.value >= 0, shrink: card.value < 0 }"
        >
          <span class="stat-number">{{ formatValue(card.format, card.value) }}</span>
          <span class="stat-unit">{{ card.unit }}</span>
        </div>
      </a-card>
    </div>

    <a-card title="自选标的概览" :bordered="false" class="mt-card">
      <a-table
        :data="fundStore.funds"
        :pagination="false"
        row-key="code"
      >
        <template #columns>
          <a-table-column title="标的" data-index="name" />
          <a-table-column title="代码" data-index="code" :width="110" />
          <a-table-column title="类型" :width="80">
            <template #cell="{ record }">{{ kindLabel(record.kind) || record.type || '—' }}</template>
          </a-table-column>
          <a-table-column title="最新净值" data-index="nav" :width="100" />
          <a-table-column title="日涨跌幅" :width="110">
            <template #cell="{ record }">
              <span :class="record.dailyGrowth >= 0 ? 'grow' : 'shrink'">
                {{ record.dailyGrowth >= 0 ? '+' : '' }}{{ record.dailyGrowth.toFixed(2) }}%
              </span>
            </template>
          </a-table-column>
          <a-table-column title="持有金额(元)" :width="130">
            <template #cell="{ record }">
              {{ (record.holdingAmount ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
            </template>
          </a-table-column>
          <a-table-column title="累计收益(元)" :width="140">
            <template #cell="{ record }">
              <span :class="(record.totalProfit ?? 0) >= 0 ? 'grow' : 'shrink'">
                {{ (record.totalProfit ?? 0) >= 0 ? '+' : '' }}{{ (record.totalProfit ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
              </span>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </a-card>

    <a-card title="最新信号" :bordered="false" class="mt-card">
      <a-empty v-if="!rulesStore.signals.length" description="暂无信号。去「规则」页创建并启用规则，系统会每 60 秒自动评估。" />
      <a-list v-else :data="rulesStore.latestSignals" :bordered="false">
        <template #item="{ item }">
          <a-list-item class="signal-item">
            <a-tag :color="signalColor(item.signal)">{{ signalLabel(item.signal) }}</a-tag>
            <span class="sig-name">{{ item.name }}</span>
            <span class="sig-rule">{{ item.ruleName }}</span>
            <span class="sig-conf">置信度 {{ item.confidence }}%</span>
            <span class="sig-time">{{ fmtTime(item.time) }}</span>
          </a-list-item>
        </template>
      </a-list>
    </a-card>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.stat-card {
  border-radius: 8px;
}
.stat-label {
  color: var(--color-text-2);
  font-size: 14px;
  margin-bottom: 8px;
}
.stat-number {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat-unit {
  margin-left: 4px;
  color: var(--color-text-3);
  font-size: 12px;
}
.grow {
  color: rgb(var(--red-6));
}
.shrink {
  color: rgb(var(--green-6));
}
.mt-card {
  margin-top: 16px;
}
.signal-item {
  display: grid;
  grid-template-columns: 64px 160px 140px 110px 70px;
  gap: 8px;
  align-items: center;
}
.sig-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sig-rule {
  color: var(--color-text-2);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sig-conf {
  color: var(--color-text-2);
  font-size: 13px;
}
.sig-time {
  color: var(--color-text-3);
  font-size: 12px;
}
</style>