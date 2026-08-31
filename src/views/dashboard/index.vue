<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import * as echarts from '@/utils/echarts'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { kindLabel } from '@/types/instrument'
import { SIGNAL_LABEL } from '@/types/rule'
import { instrumentApi, type SectorItem } from '@/api/instrument'
import { pearson } from '@/utils/analytics'

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

/* ---------------- 板块涨跌榜 ---------------- */
const sectorTab = ref<'up' | 'down'>('up')
const sectorUp = ref<SectorItem[]>([])
const sectorDown = ref<SectorItem[]>([])
const sectorLoading = ref(false)

async function loadSectors() {
  sectorLoading.value = true
  try {
    const [up, down] = await Promise.all([
      instrumentApi.sectorsTop('up', 10),
      instrumentApi.sectorsTop('down', 10),
    ])
    sectorUp.value = up
    sectorDown.value = down
  } catch {
    /* 板块榜失败不影响页面 */
  } finally {
    sectorLoading.value = false
  }
}
const sectorList = computed(() => (sectorTab.value === 'up' ? sectorUp.value : sectorDown.value))

/* ---------------- 持仓相关性 ---------------- */
const corrEl = ref<HTMLDivElement | null>(null)
let corrChart: echarts.ECharts | null = null
const corrReady = ref(false)
const corrEmpty = ref(false)

async function loadCorrelation() {
  const funds = fundStore.funds
  if (funds.length < 2) {
    corrEmpty.value = true
    corrReady.value = false
    return
  }
  const names: string[] = []
  const series: number[][] = []
  await Promise.all(
    funds.map(async (f) => {
      try {
        const k = await instrumentApi.kline({ symbol: f.symbol, kind: f.kind, code: f.code, klt: 'day', count: 60 })
        const closes = (k?.points ?? []).map((p) => p.close)
        const rets: number[] = []
        for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1)
        if (rets.length >= 3) {
          names.push(f.name)
          series.push(rets)
        }
      } catch {
        /* 单标的失败跳过 */
      }
    }),
  )
  if (names.length < 2) {
    corrEmpty.value = true
    corrReady.value = false
    return
  }
  corrEmpty.value = false
  const n = names.length
  const data: number[][] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = i === j ? 1 : (pearson(series[i], series[j]) ?? 0)
      data.push([j, i, Number(v.toFixed(2))])
    }
  }
  await nextTick()
  renderCorr(names, data)
  corrReady.value = true
}

function renderCorr(names: string[], data: number[][]) {
  if (!corrEl.value) return
  if (!corrChart) corrChart = echarts.init(corrEl.value)
  const labels = names.map((n) => (n.length > 6 ? n.slice(0, 6) + '…' : n))
  corrChart.setOption({
    tooltip: {
      position: 'top',
      formatter: (p: { value: number[] }) =>
        `${names[p.value[1]]} × ${names[p.value[0]]}<br/>相关系数 ${(p.value[2] * 100).toFixed(0)}%`,
    },
    grid: { left: 90, right: 20, top: 20, bottom: 70 },
    xAxis: {
      type: 'category',
      data: labels,
      splitArea: { show: true },
      axisLabel: { fontSize: 11, rotate: 40 },
    },
    yAxis: {
      type: 'category',
      data: labels,
      splitArea: { show: true },
      axisLabel: { fontSize: 11 },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#165dff', '#f7f8fa', '#f53f3f'] },
      text: ['正相关', '负相关'],
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          fontSize: 10,
          formatter: (p: { value: number[] }) => ((p.value[2] * 100).toFixed(0) + '%'),
        },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.3)' } },
      },
    ],
  })
}

function onResize() {
  corrChart?.resize()
}

onMounted(() => {
  loadSectors()
  void loadCorrelation()
  window.addEventListener('resize', onResize)
})
</script>

<template>
  <div>
    <div class="stat-grid">
      <a-card v-for="card in cards" :key="card.label" :bordered="false" class="stat-card">
        <div class="stat-label">{{ card.label }}</div>
        <div class="stat-value" :class="{ grow: card.value >= 0, shrink: card.value < 0 }">
          <span class="stat-number">{{ formatValue(card.format, card.value) }}</span>
          <span class="stat-unit">{{ card.unit }}</span>
        </div>
      </a-card>
    </div>

    <!-- 今日板块涨跌榜 -->
    <a-card :bordered="false" class="mt-card">
      <template #title>
        <div class="card-title-row">
          <span>今日板块</span>
          <a-radio-group v-model="sectorTab" type="button" size="small" @change="loadSectors">
            <a-radio value="up">涨幅前十</a-radio>
            <a-radio value="down">跌幅前十</a-radio>
          </a-radio-group>
        </div>
      </template>
      <a-spin :loading="sectorLoading">
        <a-list :data="sectorList" :bordered="false" size="small">
          <template #item="{ item, index }">
            <a-list-item class="sector-item">
              <span class="sector-rank">{{ index + 1 }}</span>
              <span class="sector-name">{{ item.name }}</span>
              <span class="sector-leader" v-if="item.leaderName">{{ item.leaderName }}</span>
              <span class="sector-pct" :class="item.changePct >= 0 ? 'grow' : 'shrink'">
                {{ item.changePct >= 0 ? '+' : '' }}{{ item.changePct.toFixed(2) }}%
              </span>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-if="!sectorLoading && !sectorList.length" description="暂无板块数据" />
      </a-spin>
    </a-card>

    <!-- 持仓相关性 -->
    <a-card title="持仓相关性" :bordered="false" class="mt-card">
      <template #extra>
        <a-tag color="arcoblue">颜色越深 = 同涨同跌越明显</a-tag>
      </template>
      <div v-if="corrReady" ref="corrEl" class="corr-chart" />
      <a-empty v-else-if="corrEmpty" description="至少需要 2 个标的才能计算相关性" />
      <a-spin v-else class="corr-loading" />
    </a-card>

    <a-card title="自选标的概览" :bordered="false" class="mt-card">
      <a-table :data="fundStore.funds" :pagination="false" row-key="code">
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
.mt-card {
  margin-top: 16px;
}
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.sector-item {
  display: grid;
  grid-template-columns: 28px 1fr auto 90px;
  gap: 8px;
  align-items: center;
}
.sector-rank {
  color: var(--color-text-3);
  font-size: 12px;
  text-align: center;
}
.sector-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sector-leader {
  color: var(--color-text-3);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
.sector-pct {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.corr-chart {
  width: 100%;
  height: 360px;
}
.corr-loading {
  display: block;
  height: 120px;
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
.grow {
  color: rgb(var(--red-6));
}
.shrink {
  color: rgb(var(--green-6));
}
@media (max-width: 767px) {
  .signal-item {
    grid-template-columns: 56px 1fr 90px;
  }
  .sig-rule,
  .sig-conf {
    display: none;
  }
}
</style>
