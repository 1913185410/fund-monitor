<script setup lang="ts">
import { computed } from 'vue'
import { usePortfolioStore } from '@/stores/portfolio'
import { kindLabel } from '@/types/instrument'

const fundStore = usePortfolioStore()

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
          <a-table-column title="基金" data-index="name" />
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
</style>