<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from '@/utils/echarts'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { kindLabel } from '@/types/instrument'
import { SIGNAL_LABEL } from '@/types/rule'
import { instrumentApi, type SectorItem } from '@/api/instrument'
import { pearson } from '@/utils/analytics'

const fundStore = usePortfolioStore()
const rulesStore = useRulesStore()
const settings = useSettingsStore()
const auth = useAuthStore()

// 红涨绿跌（A股习惯）
const UP = '#f53f3f'
const DOWN = '#00b42a'

/** 暗色模式下图表文字/轴线取浅色，亮色取深色，保证黑白主题都清晰可读 */
function chartText() {
  return settings.theme === 'dark' ? '#c9cdd4' : '#4e5969'
}
function chartSub() {
  return '#86909c'
}
function chartSplit() {
  return settings.theme === 'dark' ? '#33373d' : '#f2f3f5'
}
/** treemap 视觉映射中间色：涨跌幅≈0 时的底色，暗色用深灰、亮色用浅灰 */
function treemapMid() {
  return settings.theme === 'dark' ? '#2b2f36' : '#f5f6f7'
}

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
/** 元 → 万/亿 紧凑展示（对 undefined/NaN 兜底，避免 toFixed 抛错） */
function fmtMoney(v: number): string {
  const n = Number.isFinite(v) ? v : 0
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(2) + '亿'
  if (a >= 1e4) return (n / 1e4).toFixed(1) + '万'
  return n.toFixed(0)
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
      return `${value >= 0 ? '+' : ''}${value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    case 'signedPercent':
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
    default:
      return String(value)
  }
}

/* ---------------- 板块涨跌热力图（东方财富范式） ---------------- */
const sectorTab = ref<'up' | 'down'>('up')
const sectorUp = ref<SectorItem[]>([])
const sectorDown = ref<SectorItem[]>([])
const sectorLoading = ref(false)

const sectorEmpty = ref(false)
async function loadSectors() {
  try {
    const [up, down] = await Promise.all([
      instrumentApi.sectorsTop('up', 20),
      instrumentApi.sectorsTop('down', 20),
    ])
    sectorUp.value = up
    sectorDown.value = down
    sectorEmpty.value = false
  } catch {
    // 板块榜失败（如未登录/接口异常）：给出空态提示，不留下空白卡片
    sectorEmpty.value = true
  } finally {
    sectorLoading.value = false
  }
}
const sectorList = computed(() => (sectorTab.value === 'up' ? sectorUp.value : sectorDown.value))

// 板块热力图改用纯 CSS 网格绘制（不依赖 ECharts canvas，规避容器 0 尺寸导致的永久空白）。
// 颜色按涨跌幅映射：绿→灰→红，幅度越大颜色越深；文字始终白色保证对比度。
const SECTOR_NEUTRAL: [number, number, number] = [150, 156, 166]
function sectorColor(pct: number): string {
  const v = Number(pct) || 0
  const a = Math.min(Math.abs(v) / 3, 1) // 3% 即饱和
  const base: [number, number, number] = v >= 0 ? [232, 50, 50] : [0, 160, 70]
  const c = SECTOR_NEUTRAL.map((n, i) => Math.round(n + (base[i] - n) * a))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

/* ---------------- 持仓涨跌分布（热力图，面积=持有金额） ---------------- */
const holdingTreeEl = ref<HTMLDivElement | null>(null)
let holdingChart: echarts.ECharts | null = null
const holdingTreeData = computed(() =>
  fundStore.funds
    .filter((f) => f.name && (f.holdingAmount ?? 0) > 0)
    .slice(0, 20)
    .map((f) => ({ name: f.name, value: [f.holdingAmount ?? 1, f.dailyGrowth ?? 0] })),
)
function renderHoldingTree() {
  const data = holdingTreeData.value
  if (!holdingTreeEl.value) return
  if (!data.length) return
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value[1])), 0.1)
  if (!holdingChart) holdingChart = echarts.init(holdingTreeEl.value)
  holdingChart.setOption(
    {
      tooltip: {
        formatter: (p: { name: string; value: number[] }) => {
          const pct = p.value?.[1] ?? 0
          const amt = p.value?.[0] ?? 0
          return `${p.name}<br/>日涨跌：<b style="color:${pct >= 0 ? UP : DOWN}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</b><br/>持有金额：${fmtMoney(amt)}元`
        },
      },
      visualMap: {
        show: false,
        type: 'continuous',
        min: -maxAbs,
        max: maxAbs,
        dimension: 1,
        inRange: { color: ['#00b42a', '#9ff0c1', treemapMid(), '#ffb8a8', '#f53f3f'] },
      },
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          label: {
            show: true,
            formatter: (p: { name: string; value: number[] }) => {
              const pct = p.value?.[1] ?? 0
              return `${p.name}\n${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
            },
            fontSize: 12,
            color: '#fff',
            textBorderColor: 'rgba(0,0,0,0.35)',
            textBorderWidth: 2,
            lineHeight: 16,
          },
          itemStyle: { borderColor: '#fff', borderWidth: 1, gapWidth: 2 },
          data,
        },
      ],
    },
    true,
  )
}

/* ---------------- 持仓占比环形图（支付宝资产分布范式） ---------------- */
const pieEl = ref<HTMLDivElement | null>(null)
let pieChart: echarts.ECharts | null = null
const pieData = computed(() => {
  const m = new Map<string, { name: string; value: number }>()
  for (const f of fundStore.funds) {
    const amt = f.holdingAmount ?? 0
    if (amt <= 0) continue
    if (m.has(f.code)) m.get(f.code)!.value += amt
    else m.set(f.code, { name: f.name || f.code, value: amt })
  }
  return [...m.values()].sort((a, b) => b.value - a.value)
})
const pieTotal = computed(() => pieData.value.reduce((s, d) => s + d.value, 0))
function renderPie() {
  if (!pieEl.value || !pieData.value.length) return
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  pieChart.setOption(
    {
      tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br/>${fmtMoney(p.value)}元 (${p.percent}%)` },
      legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11, color: chartText() }, itemWidth: 10, itemHeight: 10 },
      title: {
        text: `${fmtMoney(pieTotal.value)}\n总持仓`,
        left: 'center',
        top: '36%',
        textAlign: 'center',
        textStyle: { fontSize: 13, color: chartSub(), lineHeight: 18, fontWeight: 'normal' },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold', formatter: '{b}\n{d}%' } },
          data: pieData.value.map((d) => ({ name: d.name, value: d.value })),
        },
      ],
    },
    true,
  )
}

/* ---------------- 今日收益贡献 Top（谁赚/拖累最多） ---------------- */
const contributionEl = ref<HTMLDivElement | null>(null)
let contributionChart: echarts.ECharts | null = null
const contributionData = computed(() =>
  fundStore.funds
    .map((f) => ({ name: f.name || f.code, val: (f.holdingAmount ?? 0) * (f.dailyGrowth ?? 0) / 100 }))
    .filter((d) => d.val !== 0)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
    .slice(0, 10),
)
function renderContribution() {
  const list = contributionData.value
  if (!contributionEl.value || !list.length) return
  if (!contributionChart) contributionChart = echarts.init(contributionEl.value)
  contributionChart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: { name: string; value: number }[]) => {
          const p = ps[0]
          return `${p.name}<br/>今日贡献：<b style="color:${p.value >= 0 ? UP : DOWN}">${p.value >= 0 ? '+' : ''}${p.value.toFixed(0)}</b>元`
        },
      },
      grid: { left: 8, right: 20, top: 10, bottom: 6, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => fmtMoney(v), color: chartSub() },
        axisLine: { lineStyle: { color: chartSplit() } },
        splitLine: { lineStyle: { color: chartSplit() } },
      },
      yAxis: {
        type: 'category',
        data: list.map((d) => d.name).reverse(),
        axisLabel: { fontSize: 11, color: chartSub() },
        axisLine: { lineStyle: { color: chartSplit() } },
        splitLine: { lineStyle: { color: chartSplit() } },
      },
      series: [
        {
          type: 'bar',
          barWidth: '58%',
          data: list
            .map((d) => ({ value: Number(d.val.toFixed(0)), itemStyle: { color: d.val >= 0 ? UP : DOWN } }))
            .reverse(),
          label: { show: true, position: 'right', fontSize: 11, formatter: (p: { value: number }) => fmtMoney(p.value) },
        },
      ],
    },
    true,
  )
}

/* ---------------- 持仓相关性 ---------------- */
const corrEl = ref<HTMLDivElement | null>(null)
let corrChart: echarts.ECharts | null = null
const corrReady = ref(false)
const corrEmpty = ref(false)
// 把相关性矩阵缓存为 ref，主题切换时无需重新拉接口即可按新配色重绘
const corrNames = ref<string[]>([])
const corrData = ref<number[][]>([])

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
  corrNames.value = names
  corrData.value = data
  await nextTick()
  renderCorr()
  corrReady.value = true
}

function renderCorr() {
  const names = corrNames.value
  const data = corrData.value
  if (!corrEl.value || !names.length) return
  if (!corrChart) corrChart = echarts.init(corrEl.value)
  const labels = names.map((n) => (n.length > 6 ? n.slice(0, 6) + '…' : n))
  corrChart.setOption(
    {
      tooltip: {
        position: 'top',
        formatter: (p: { value: number[] }) =>
          `${names[p.value[1]]} × ${names[p.value[0]]}<br/>相关系数 ${(p.value[2] * 100).toFixed(0)}%`,
      },
      grid: { left: 90, right: 20, top: 20, bottom: 70 },
      xAxis: { type: 'category', data: labels, splitArea: { show: true }, axisLabel: { fontSize: 11, rotate: 40, color: chartSub() } },
      yAxis: { type: 'category', data: labels, splitArea: { show: true }, axisLabel: { fontSize: 11, color: chartSub() } },
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
          label: { show: true, fontSize: 10, formatter: (p: { value: number[] }) => {
            const v = p.value?.[2] ?? 0
            return (v * 100).toFixed(0) + '%'
          } },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.3)' } },
        },
      ],
    },
    true,
  )
}

function onResize() {
  holdingChart?.resize()
  pieChart?.resize()
  contributionChart?.resize()
  corrChart?.resize()
}

/* 容器在 init 时若处于 0 尺寸（卡片折叠/主题切换/滚动未稳定），echarts 会永久空白。
   挂 ResizeObserver：容器一旦拿到真实尺寸就 resize()，彻底消除「热力图不绘制」类问题。 */
let ro: ResizeObserver | null = null
function setupResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(() => onResize())
  for (const el of [holdingTreeEl, pieEl, contributionEl, corrEl]) {
    if (el.value) ro.observe(el.value)
  }
}

function disposeAll() {
  holdingChart?.dispose()
  pieChart?.dispose()
  contributionChart?.dispose()
  corrChart?.dispose()
  holdingChart = pieChart = contributionChart = corrChart = null
}

onMounted(() => {
  void loadSectors()
  void loadCorrelation()
  nextTick(() => {
    renderHoldingTree()
    renderPie()
    renderContribution()
    setupResizeObserver()
  })
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  ro?.disconnect()
  ro = null
  disposeAll()
})

// 行情每 60s 刷新：用最新数据重绘，并【重新拉取】板块榜与相关性——
// 这俩接口需登录态，mount 时若未登录会 401 失败并停在空态，必须在登录/同步后重跑才能恢复
watch(
  () => fundStore.syncedAt,
  () => {
    renderHoldingTree()
    renderPie()
    renderContribution()
    if (corrReady.value) renderCorr()
    void loadSectors()
    void loadCorrelation()
  },
)
// 主题切换：用新配色重绘图表（含相关性热力图，无需重新拉接口；板块热力图是纯 CSS，自动适配）
watch(
  () => settings.theme,
  () => {
    renderHoldingTree()
    renderPie()
    renderContribution()
    if (corrReady.value) renderCorr()
  },
)
// 登录成功瞬间：接口拿到令牌，立即重拉板块榜与相关性（不等下一轮 60s 刷新）
watch(
  () => auth.authed,
  (v) => {
    if (v) {
      void loadSectors()
      void loadCorrelation()
    }
  },
)
</script>

<template>
  <div>
    <!-- 顶部汇总指标 -->
    <div class="stat-grid">
      <a-card v-for="card in cards" :key="card.label" :bordered="false" class="stat-card">
        <div class="stat-label">{{ card.label }}</div>
        <div class="stat-value" :class="{ grow: card.value >= 0, shrink: card.value < 0 }">
          <span class="stat-number">{{ formatValue(card.format, card.value) }}</span>
          <span class="stat-unit">{{ card.unit }}</span>
        </div>
      </a-card>
    </div>

    <!-- 两列紧凑网格 -->
    <div class="dash-grid">
      <!-- 板块涨跌热力图 -->
      <a-card :bordered="false" class="dash-card">
        <template #title>
          <div class="card-title-row">
            <span>板块涨跌热力图</span>
            <a-radio-group v-model="sectorTab" type="button" size="small">
              <a-radio value="up">涨幅前二十</a-radio>
              <a-radio value="down">跌幅前二十</a-radio>
            </a-radio-group>
          </div>
        </template>
        <a-spin :loading="sectorLoading">
          <div v-if="sectorEmpty" class="chart-empty">暂无板块数据（登录后查看）</div>
          <div v-show="!sectorEmpty" class="sector-heatmap">
            <div
              v-for="s in sectorList"
              :key="s.name"
              class="sector-tile"
              :style="{ background: sectorColor(s.changePct) }"
              :title="
                s.name +
                '　涨跌幅：' + (s.changePct >= 0 ? '+' : '') + (s.changePct ?? 0).toFixed(2) + '%' +
                '　主力净流入：' + fmtMoney(s.mainNet) +
                '　领涨：' + (s.leaderName || '—') + ' ' + (s.leaderChangePct >= 0 ? '+' : '') + (s.leaderChangePct ?? 0).toFixed(2) + '%'
              "
            >
              <span class="st-name">{{ s.name }}</span>
              <span class="st-pct">{{ s.changePct >= 0 ? '+' : '' }}{{ (s.changePct ?? 0).toFixed(2) }}%</span>
            </div>
          </div>
        </a-spin>
      </a-card>

      <!-- 持仓涨跌分布 -->
      <a-card title="我的持仓涨跌分布" :bordered="false" class="dash-card">
        <template #extra><a-tag color="arcoblue">面积=持有金额 · 颜色=涨跌</a-tag></template>
        <div v-if="!holdingTreeData.length" class="chart-empty">添加持仓后可见</div>
        <div v-show="holdingTreeData.length" ref="holdingTreeEl" class="tree-chart" />
      </a-card>

      <!-- 持仓占比环形图 -->
      <a-card title="持仓占比" :bordered="false" class="dash-card">
        <div v-if="!pieData.length" class="chart-empty">暂无持仓数据</div>
        <div v-show="pieData.length" ref="pieEl" class="pie-chart" />
      </a-card>

      <!-- 今日收益贡献 -->
      <a-card title="今日收益贡献 Top" :bordered="false" class="dash-card">
        <template #extra><a-tag color="gray">红赚绿亏</a-tag></template>
        <div v-if="!contributionData.length" class="chart-empty">今日无盈亏变动</div>
        <div v-show="contributionData.length" ref="contributionEl" class="bar-chart" />
      </a-card>

      <!-- 自选标的概览（跨两列） -->
      <a-card title="自选标的概览" :bordered="false" class="dash-card span-2">
        <a-table :data="fundStore.funds" :pagination="false" row-key="code" :scroll="{ x: 770 }">
          <template #columns>
            <a-table-column title="标的" data-index="name" :width="110" ellipsis tooltip />
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

      <!-- 持仓相关性 -->
      <a-card title="持仓相关性" :bordered="false" class="dash-card">
        <template #extra><a-tag color="arcoblue">颜色越深 = 同涨同跌越明显</a-tag></template>
        <div v-if="corrReady" ref="corrEl" class="corr-chart" />
        <a-empty v-else-if="corrEmpty" description="至少需要 2 个标的才能计算相关性" />
        <a-spin v-else class="corr-loading" />
      </a-card>

      <!-- 最新信号 -->
      <a-card title="最新信号" :bordered="false" class="dash-card">
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
  </div>
</template>

<style scoped>
/* 顶部汇总：固定 2×2 网格，移动端亦然，避免单列过宽不好看 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stat-card {
  border-radius: 8px;
}
.stat-label {
  color: var(--color-text-2);
  font-size: 13px;
  margin-bottom: 6px;
}
.stat-number {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat-unit {
  margin-left: 4px;
  color: var(--color-text-3);
  font-size: 12px;
}
/* 两列紧凑网格 */
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}
.dash-card {
  border-radius: 8px;
  min-width: 0;
}
/* Arco a-spin 默认 inline-block，会把内部网格宽度压成内容宽度导致单列；改为占满宽度 */
.dash-card :deep(.arco-spin) {
  display: block;
  width: 100%;
}
.span-2 {
  grid-column: 1 / -1;
}
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.tree-chart {
  width: 100%;
  height: 340px;
  min-width: 0;
}
/* 板块热力图：纯 CSS 网格，颜色按涨跌幅映射，稳定可见、不依赖 canvas */
.sector-heatmap {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 6px;
  width: 100%;
}
.sector-tile {
  border-radius: 6px;
  padding: 8px 6px;
  min-height: 56px;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: default;
  user-select: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: transform 0.12s ease, filter 0.12s ease;
}
.sector-tile:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}
.sector-tile .st-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sector-tile .st-pct {
  margin-top: 3px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.96;
}
.pie-chart {
  width: 100%;
  height: 300px;
  min-width: 0;
}
.bar-chart {
  width: 100%;
  height: 300px;
  min-width: 0;
}
.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--color-text-3);
  font-size: 13px;
}
.corr-chart {
  width: 100%;
  height: 360px;
  min-width: 0;
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
  .dash-grid {
    grid-template-columns: 1fr !important;
  }
  .dash-card {
    min-width: 0;
  }
  .tree-chart,
  .pie-chart,
  .bar-chart,
  .corr-chart,
  .sector-heatmap {
    min-width: 0;
    max-width: 100%;
  }
  .span-2 {
    grid-column: auto;
  }
  .signal-item {
    grid-template-columns: 56px 1fr 90px;
  }
  .sig-rule,
  .sig-conf {
    display: none;
  }
}
</style>
