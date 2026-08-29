<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { usePortfolioStore } from '@/stores/portfolio'
import { instrumentApi } from '@/api/instrument'
import { KIND_LABEL, KIND_COLOR, type KLineBundle, type FlowBundle, type Instrument } from '@/types/instrument'

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()

const code = computed(() => String(route.params.code ?? ''))
const fund = computed<Instrument | undefined>(() => store.getFundByCode(code.value))

const klt = ref<'day' | 'week' | 'month'>('day')
const loading = ref(false)
const kline = ref<KLineBundle | null>(null)
const flow = ref<FlowBundle | null>(null)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

async function loadData() {
  const it = fund.value
  if (!it) return
  loading.value = true
  try {
    const [k, f] = await Promise.all([
      instrumentApi.kline({ symbol: it.symbol, kind: it.kind, code: it.code, klt: klt.value, count: 90 }),
      instrumentApi.flow({ symbol: it.symbol, kind: it.kind, code: it.code, days: 20 }),
    ])
    kline.value = k
    flow.value = f
    await nextTick()
    render()
  } catch {
    kline.value = null
    flow.value = null
  } finally {
    loading.value = false
  }
}

function render() {
  if (!chartEl.value) return
  if (!chart) chart = echarts.init(chartEl.value)
  const k = kline.value
  if (!k || !k.points.length) {
    chart.clear()
    return
  }
  const dates = k.points.map((p) => p.date)
  const kdata = k.points.map((p) => [p.open, p.close, p.low, p.high])
  const vols = k.points.map((p) => ({
    value: p.volume,
    itemStyle: { color: p.close >= p.open ? '#f53f3f' : '#00b42a' },
  }))
  const { ma, macd } = k.indicators
  const dif = macd.dif.map((v) => (v == null ? '-' : Number(v.toFixed(4))))
  const dea = macd.dea.map((v) => (v == null ? '-' : Number(v.toFixed(4))))
  const hist = macd.hist.map((v) => ({
    value: v == null ? 0 : Number(v.toFixed(4)),
    itemStyle: { color: (v ?? 0) >= 0 ? '#f53f3f' : '#00b42a' },
  }))

  // 资金流：日级用与K线对齐的日期；基金季度用独立轴
  const flowPoints = flow.value?.points ?? []
  const flowDates = flowPoints.map((p) => p.date)
  const isQuarterly = flow.value?.mode === 'quarterly'
  const flowValues = flowPoints.map((p) => {
    const v = isQuarterly ? p.scale ?? 0 : p.mainNet ?? 0
    return {
      value: isQuarterly ? v : Number((v / 1e8).toFixed(2)), // 日级转亿
      itemStyle: { color: v >= 0 ? '#f53f3f' : '#00b42a' },
    }
  })

  chart.setOption(
    {
      animation: false,
      legend: {
        data: ['MA5', 'MA10', 'MA20', 'MA60', 'MACD'],
        top: 0,
        textStyle: { fontSize: 11 },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 56, right: 16, top: 26, height: '46%' },
        { left: 56, right: 16, top: '60%', height: '12%' },
        { left: 56, right: 16, top: '74%', height: '12%' },
        { left: 56, right: 16, top: '88%', height: '9%' },
      ],
      xAxis: [
        { type: 'category', data: dates, gridIndex: 0, boundaryGap: true, axisLabel: { show: false } },
        { type: 'category', data: dates, gridIndex: 1, boundaryGap: true, axisLabel: { show: false } },
        { type: 'category', data: dates, gridIndex: 2, boundaryGap: true, axisLabel: { show: false } },
        {
          type: 'category',
          data: isQuarterly ? flowDates : dates,
          gridIndex: 3,
          axisLabel: { fontSize: 10, interval: Math.max(0, Math.floor(flowDates.length / 6)) },
        },
      ],
      yAxis: [
        { scale: true, gridIndex: 0, splitLine: { lineStyle: { opacity: 0.3 } } },
        { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
        { gridIndex: 2, axisLabel: { show: false }, splitLine: { show: false } },
        { gridIndex: 3, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1, 2, 3], start: isQuarterly ? 0 : 55, end: 100 },
        { type: 'slider', xAxisIndex: [0, 1, 2, 3], bottom: 2, height: 14, start: isQuarterly ? 0 : 55, end: 100 },
      ],
      series: [
        {
          name: 'K线', type: 'candlestick', data: kdata, xAxisIndex: 0, yAxisIndex: 0,
          itemStyle: { color: '#f53f3f', color0: '#00b42a', borderColor: '#f53f3f', borderColor0: '#00b42a' },
        },
        ...['5', '10', '20', '60'].map((n) => ({
          name: `MA${n}`,
          type: 'line',
          data: (ma[n] ?? []).map((v) => (v == null ? '-' : Number(v.toFixed(3)))),
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbol: 'none',
          lineStyle: { width: 1 },
        })),
        { name: '成交量', type: 'bar', data: vols, xAxisIndex: 1, yAxisIndex: 1 },
        { name: 'MACD', type: 'bar', data: hist, xAxisIndex: 2, yAxisIndex: 2 },
        { name: 'DIF', type: 'line', data: dif, xAxisIndex: 2, yAxisIndex: 2, symbol: 'none', lineStyle: { width: 1, color: '#f53f3f' } },
        { name: 'DEA', type: 'line', data: dea, xAxisIndex: 2, yAxisIndex: 2, symbol: 'none', lineStyle: { width: 1, color: '#00b42a' } },
        {
          name: isQuarterly ? '规模(亿)' : '主力净流入(亿)',
          type: 'bar',
          data: flowValues,
          xAxisIndex: 3,
          yAxisIndex: 3,
        },
      ],
    },
    true,
  )
}

function onResize() {
  chart?.resize()
}

const trend = computed(() => {
  const pts = kline.value?.points ?? []
  if (pts.length < 2) return 0
  return ((pts[pts.length - 1].close - pts[0].close) / pts[0].close) * 100
})

const latest = computed(() => {
  const pts = kline.value?.points ?? []
  return pts[pts.length - 1]
})

function fmtMoney(v?: number) {
  return (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

watch([fund, klt], () => loadData())
onMounted(() => {
  window.addEventListener('resize', onResize)
  if (fund.value) loadData()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <a-card :bordered="false" v-if="fund" class="detail-card">
    <template #title>
      <div class="detail-title">
        <span class="kind-tag" :style="{ color: KIND_COLOR[fund.kind], borderColor: KIND_COLOR[fund.kind] }">
          {{ KIND_LABEL[fund.kind] }}
        </span>
        <span>{{ fund.name }}</span>
        <a-tag>{{ fund.code }}</a-tag>
        <a-tag v-if="fund.type" color="arcoblue">{{ fund.type }}</a-tag>
      </div>
    </template>

    <div class="net-value">
      <span class="nv-label">{{ fund.kind === 'fund' ? '最新净值' : '最新价' }}</span>
      <span class="nv-number">{{ fund.nav.toFixed(fund.kind === 'fund' ? 4 : 3) }}</span>
      <span class="nv-date">（{{ fund.navDate || latest?.date || '—' }}）</span>
      <span :class="fund.dailyGrowth >= 0 ? 'grow' : 'shrink'">
        {{ fund.dailyGrowth >= 0 ? '+' : '' }}{{ fund.dailyGrowth.toFixed(2) }}%
      </span>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">持有金额</div>
        <div class="stat-val">{{ fmtMoney(fund.holdingAmount) }} 元</div>
      </div>
      <div class="stat">
        <div class="stat-label">持有份额</div>
        <div class="stat-val">{{ fmtMoney(fund.holdingShare) }} 份</div>
      </div>
      <div class="stat">
        <div class="stat-label">累计收益</div>
        <div class="stat-val" :class="(fund.totalProfit ?? 0) >= 0 ? 'grow' : 'shrink'">
          {{ (fund.totalProfit ?? 0) >= 0 ? '+' : '' }}{{ fmtMoney(fund.totalProfit) }} 元
        </div>
      </div>
      <div class="stat">
        <div class="stat-label">累计收益率</div>
        <div class="stat-val" :class="(fund.totalProfitRate ?? 0) >= 0 ? 'grow' : 'shrink'">
          {{ (fund.totalProfitRate ?? 0) >= 0 ? '+' : '' }}{{ (fund.totalProfitRate ?? 0).toFixed(2) }}%
        </div>
      </div>
    </div>

    <div class="chart-toolbar">
      <a-radio-group v-model="klt" type="button" size="small">
        <a-radio value="day">日K</a-radio>
        <a-radio value="week">周K</a-radio>
        <a-radio value="month">月K</a-radio>
      </a-radio-group>
      <a-tag :color="trend >= 0 ? 'red' : 'green'">
        区间{{ trend >= 0 ? '+' : '' }}{{ trend.toFixed(2) }}%
      </a-tag>
    </div>

    <div ref="chartEl" class="chart" :style="{ height: flow?.points?.length ? '560px' : '420px' }" />

    <a-alert v-if="fund.kind === 'fund'" type="warning" class="flow-note">
      <template #title>说明：场外基金没有日内资金流向，下方显示的是季度规模变动（亿元）与环比，供参考。</template>
    </a-alert>
  </a-card>

  <a-result v-else status="404" title="未找到该标的">
    <template #extra>
      <a-button @click="router.push('/instruments')">返回标的库</a-button>
    </template>
  </a-result>
</template>

<style scoped>
.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.kind-tag {
  font-size: 12px;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 4px;
}
.net-value {
  font-size: 15px;
  margin-bottom: 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.nv-label {
  color: var(--color-text-2);
}
.nv-number {
  font-size: 30px;
  font-weight: 600;
}
.nv-date {
  color: var(--color-text-3);
  font-size: 13px;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.stat {
  padding: 14px 16px;
  background: var(--color-fill-2);
  border-radius: 8px;
}
.stat-label {
  color: var(--color-text-2);
  font-size: 13px;
  margin-bottom: 6px;
}
.stat-val {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.chart-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.chart {
  width: 100%;
}
.flow-note {
  margin-top: 12px;
}
.grow {
  color: rgb(var(--red-6));
}
.shrink {
  color: rgb(var(--green-6));
}
</style>
