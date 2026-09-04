<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from '@/utils/echarts'
import { Message } from '@arco-design/web-vue'
import '@arco-design/web-vue/es/message/style/css.js'
import { usePortfolioStore } from '@/stores/portfolio'
import { instrumentApi } from '@/api/instrument'
import { KIND_LABEL, KIND_COLOR, type KLineBundle, type FlowBundle, type Instrument } from '@/types/instrument'
import { computeMetrics } from '@/engine/evaluate'
import { computeRisk, buildAdvice, type RiskMetrics, type Advice } from '@/utils/analytics'
import { useHoldingsStore, redeemFeeLabel } from '@/stores/holdings'

const route = useRoute()
const router = useRouter()
const store = usePortfolioStore()
const holdings = useHoldingsStore()

const code = computed(() => String(route.params.code ?? ''))
const fund = computed<Instrument | undefined>(() => store.getFundByCode(code.value))

const klt = ref<'day' | 'week' | 'month'>('day')
const loading = ref(false)
const kline = ref<KLineBundle | null>(null)
const flow = ref<FlowBundle | null>(null)
const dayKline = ref<KLineBundle | null>(null)

/* 主图指标切换 + 时间范围（选择记忆到 localStorage，刷新/重进保持） */
type MainKey = 'accNav' | 'nav' | 'rs' | 'dev'
const MAIN_OPTIONS = [
  { value: 'accNav', label: '累计净值' },
  { value: 'nav', label: '单位净值' },
  { value: 'rs', label: '相对沪深300' },
  { value: 'dev', label: '偏离均线' },
] as const
const RANGE_OPTIONS = [
  { value: '3m', label: '3月', count: 90 },
  { value: '6m', label: '6月', count: 180 },
  { value: '1y', label: '1年', count: 250 },
  { value: 'all', label: '全部', count: 600 },
] as const
const selectedMain = ref<MainKey>((localStorage.getItem('fm:main') as MainKey) || 'accNav')
const selectedRange = ref<string>(localStorage.getItem('fm:range') || '3m')
const rangeCount = computed(() => RANGE_OPTIONS.find((o) => o.value === selectedRange.value)?.count ?? 90)
// 主图切换只重绘（数据已加载）；时间范围变化需重新拉取
watch(selectedMain, (v) => {
  localStorage.setItem('fm:main', v)
  if (chart) render()
})
watch(selectedRange, (v) => {
  localStorage.setItem('fm:range', v)
  loadData()
})

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

async function loadData() {
  const it = fund.value
  if (!it) return
  loading.value = true
  try {
    const [k, f, dk] = await Promise.all([
      instrumentApi.kline({ symbol: it.symbol, kind: it.kind, code: it.code, klt: klt.value, count: rangeCount.value }),
      instrumentApi.flow({ symbol: it.symbol, kind: it.kind, code: it.code, days: 20 }),
      instrumentApi.kline({ symbol: it.symbol, kind: it.kind, code: it.code, klt: 'day', count: 250 }),
    ])
    kline.value = k
    flow.value = f
    dayKline.value = dk
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
  const { ma, macd } = k.indicators
  const dif = macd.dif.map((v) => (v == null ? '-' : Number(v.toFixed(4))))
  const dea = macd.dea.map((v) => (v == null ? '-' : Number(v.toFixed(4))))
  const hist = macd.hist.map((v) => ({
    value: v == null ? 0 : Number(v.toFixed(4)),
    itemStyle: { color: (v ?? 0) >= 0 ? '#f53f3f' : '#00b42a' },
  }))

  const flowPoints = flow.value?.points ?? []
  const flowDates = flowPoints.map((p) => p.date)
  const isQuarterly = flow.value?.mode === 'quarterly'
  const flowValues = flowPoints.map((p) => {
    const v = isQuarterly ? p.scale ?? 0 : p.mainNet ?? 0
    return {
      value: isQuarterly ? v : Number((v / 1e8).toFixed(2)),
      itemStyle: { color: v >= 0 ? '#f53f3f' : '#00b42a' },
    }
  })

  /* 场外基金没有开高低价与成交量，因此：
     ① 主图画「累计净值」曲线（含分红再投，才是真实收益口径），
     ② 把无意义的「成交量」格换成「相对沪深300强弱」，
     ③ 新增「净值偏离均线」格用于判断超涨超跌。 */
  const rs = k.indicators.rs
  const dev = k.indicators.dev
  const showRS = isFund.value && !!rs
  const showDev = isFund.value && Array.isArray(dev) && dev.length > 0
  // 主图切换为 RS/偏离 时，不再重复渲染对应副图格（避免重叠）
  const rsRendered = showRS && selectedMain.value !== 'rs'
  const devRendered = showDev && selectedMain.value !== 'dev'
  const num3 = (v: number | null) => (v == null ? '-' : Number(v.toFixed(3)))

  const grids: any[] = []
  const xAxes: any[] = []
  const yAxes: any[] = []
  const series: any[] = []
  const legend = ['MA5', 'MA10', 'MA20', 'MA60', 'MACD']

  const addGrid = (top: string | number, height: string, withLabel = false, catData?: string[]) => {
    const i = grids.length
    const data = catData ?? dates
    grids.push({ left: 56, right: 16, top, height })
    xAxes.push({
      type: 'category',
      data,
      gridIndex: i,
      boundaryGap: true,
      axisLabel: withLabel
        ? { fontSize: 10, interval: Math.max(0, Math.floor(data.length / 6)) }
        : { show: false },
    })
    yAxes.push({
      gridIndex: i,
      scale: true,
      axisLabel: withLabel ? { fontSize: 10 } : { show: false },
      splitLine: { show: i === 0, lineStyle: { opacity: 0.3 } },
    })
    return i
  }

  /* 主图：按 selectedMain 切换（累计净值/单位净值/相对沪深300/偏离均线）；股票/ETF＝K 线 */
  const gMain = addGrid(26, isFund.value ? '34%' : '46%')
  if (!isFund.value) {
    series.push({
      name: 'K线',
      type: 'candlestick',
      data: k.points.map((p) => [p.open, p.close, p.low, p.high]),
      xAxisIndex: gMain,
      yAxisIndex: gMain,
      itemStyle: { color: '#f53f3f', color0: '#00b42a', borderColor: '#f53f3f', borderColor0: '#00b42a' },
    })
  } else {
    let mainName = '累计净值'
    let mainData: (number | string)[] = k.points.map((p) => (p.accum && p.accum > 0 ? p.accum : p.close))
    if (selectedMain.value === 'nav') {
      mainName = '单位净值'
      mainData = k.points.map((p) => p.close)
    } else if (selectedMain.value === 'rs' && rs) {
      mainName = '相对沪深300'
      mainData = (rs.rs ?? []).map(num3)
    } else if (selectedMain.value === 'dev' && dev) {
      mainName = '偏离均线%'
      mainData = (dev ?? []).map((v) => (v == null ? '-' : Number((v as number).toFixed(3))))
    }
    series.push({
      name: mainName,
      type: 'line',
      data: mainData,
      xAxisIndex: gMain,
      yAxisIndex: gMain,
      symbol: 'none',
      lineStyle: { width: 2, color: '#165dff' },
    })
    // 仅净值类主图叠加均线；RS/偏离为比率指标，不叠 MA
    if (selectedMain.value === 'accNav' || selectedMain.value === 'nav') {
      for (const n of ['5', '10', '20', '60']) {
        series.push({
          name: `MA${n}`,
          type: 'line',
          data: (ma[n] ?? []).map((v) => (v == null ? '-' : Number(v.toFixed(3)))),
          xAxisIndex: gMain,
          yAxisIndex: gMain,
          symbol: 'none',
          lineStyle: { width: 1 },
        })
      }
    }
  }

  /* 第二格：股票＝成交量；场外基金＝相对沪深300强弱 */
  if (rsRendered && rs) {
    const gRS = addGrid('46%', '13%')
    legend.push('RS强弱', 'RS均线')
    series.push({
      name: 'RS强弱',
      type: 'line',
      data: (rs.rs ?? []).map(num3),
      xAxisIndex: gRS,
      yAxisIndex: gRS,
      symbol: 'none',
      lineStyle: { width: 1.8, color: '#3b82f6' },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          {
            yAxis: 100,
            lineStyle: { color: '#c9d2de', type: 'dashed', width: 1 },
            label: { formatter: '基准100', fontSize: 10, color: '#a3adbd' },
          },
        ],
      },
    })
    series.push({
      name: 'RS均线',
      type: 'line',
      data: (rs.rsMa ?? []).map(num3),
      xAxisIndex: gRS,
      yAxisIndex: gRS,
      symbol: 'none',
      lineStyle: { width: 1.6, color: '#f59e0b' },
    })
  } else {
    const gVol = addGrid('60%', '12%')
    series.push({
      name: '成交量',
      type: 'bar',
      data: k.points.map((p) => ({
        value: p.volume,
        itemStyle: { color: p.close >= p.open ? '#f53f3f' : '#00b42a' },
      })),
      xAxisIndex: gVol,
      yAxisIndex: gVol,
    })
  }

  /* MACD */
  const gMacd = addGrid(rsRendered ? '60%' : '74%', '12%')
  series.push({ name: 'MACD', type: 'bar', data: hist, xAxisIndex: gMacd, yAxisIndex: gMacd })
  series.push({
    name: 'DIF',
    type: 'line',
    data: dif,
    xAxisIndex: gMacd,
    yAxisIndex: gMacd,
    symbol: 'none',
    lineStyle: { width: 1, color: '#f53f3f' },
  })
  series.push({
    name: 'DEA',
    type: 'line',
    data: dea,
    xAxisIndex: gMacd,
    yAxisIndex: gMacd,
    symbol: 'none',
    lineStyle: { width: 1, color: '#00b42a' },
  })

  /* 第四格：场外基金＝净值偏离均线幅度（超涨/超跌） */
  if (devRendered && dev) {
    const gDev = addGrid(rsRendered ? '74%' : '86%', '10%')
    legend.push('偏离均线%')
    series.push({
      name: '偏离均线%',
      type: 'bar',
      data: dev.map((v) => ({
        value: v == null ? 0 : Number(v.toFixed(3)),
        itemStyle: { color: (v ?? 0) >= 0 ? '#f53f3f' : '#00b42a' },
      })),
      xAxisIndex: gDev,
      yAxisIndex: gDev,
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          {
            yAxis: 0,
            lineStyle: { color: '#c9d2de', type: 'dashed', width: 1 },
            label: { formatter: '0', fontSize: 10, color: '#a3adbd' },
          },
        ],
      },
    })
  }

  /* 底格：资金流 / 季度规模，带日期轴 */
  const gFlow = addGrid(devRendered ? '86%' : '88%', '9%', true, isQuarterly ? flowDates : dates)
  series.push({
    name: isQuarterly ? '规模(亿)' : '主力净流入(亿)',
    type: 'bar',
    data: flowValues,
    xAxisIndex: gFlow,
    yAxisIndex: gFlow,
  })

  const zoomIdx = grids.map((_, i) => i)
  chart.setOption(
    {
      animation: false,
      legend: { data: legend, top: 0, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom: [
        { type: 'inside', xAxisIndex: zoomIdx, start: isQuarterly ? 0 : 55, end: 100 },
        { type: 'slider', xAxisIndex: zoomIdx, bottom: 2, height: 14, start: isQuarterly ? 0 : 55, end: 100 },
      ],
      series,
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
  // 场外基金用累计净值：单位净值在分红除权日会跳空下跌，算出来的涨跌幅会被严重低估
  const pick = (p: (typeof pts)[number]) => (isFund.value && p.accum && p.accum > 0 ? p.accum : p.close)
  const a = pick(pts[0])
  const b = pick(pts[pts.length - 1])
  if (!(a > 0)) return 0
  return ((b - a) / a) * 100
})

const latest = computed(() => {
  const pts = kline.value?.points ?? []
  return pts[pts.length - 1]
})

function fmtMoney(v?: number) {
  return (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

/* ---------------- 风险指标 ---------------- */
const risk = computed<RiskMetrics | null>(() => (dayKline.value ? computeRisk(dayKline.value.points) : null))

/* ---------------- 买卖建议 ---------------- */
const adviceVisible = ref(false)
const advice = computed<Advice | null>(() => {
  if (!dayKline.value || !dayKline.value.points.length) return null
  return buildAdvice(computeMetrics(dayKline.value, flow.value))
})
const adviceTag = computed(() => {
  const a = advice.value
  if (!a) return 'blue'
  return a.signal === 'buy' ? 'red' : a.signal === 'sell' ? 'green' : 'arcoblue'
})

/* ---------------- 持有记录 / 赎回费（场外基金） ---------------- */
const isFund = computed(() => fund.value?.kind === 'fund')
const holdRecords = computed(() => (fund.value ? holdings.recordsOf(fund.value.code) : []))
const holdDays = computed(() => (fund.value ? holdings.holdingDays(fund.value.code) : 0))
const feeLabel = computed(() => redeemFeeLabel(holdDays.value))

const addHoldingVisible = ref(false)
const holdForm = ref({ date: new Date().toISOString().slice(0, 10), amount: 0, share: 0 })
function openAddHolding() {
  holdForm.value = { date: new Date().toISOString().slice(0, 10), amount: 0, share: 0 }
  addHoldingVisible.value = true
}
function confirmAddHolding() {
  if (!fund.value) return
  holdings.addRecord(fund.value.code, holdForm.value.date, holdForm.value.amount, holdForm.value.share)
  addHoldingVisible.value = false
  void store.syncLedgers()
  Message.success('已添加持有记录')
}

function onRemoveRecord(id: string) {
  holdings.removeRecord(id)
  void store.syncLedgers()
  Message.success('已删除持有记录')
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
      <template v-if="fund.kind === 'fund' && fund.estimateNav && fund.estimateNav > 0">
        <span class="nv-sep">·</span>
        <span class="nv-label">盘中估值</span>
        <span class="nv-number est">{{ fund.estimateNav.toFixed(4) }}</span>
        <span :class="fund.estimateGrowth >= 0 ? 'grow' : 'shrink'">
          {{ fund.estimateGrowth >= 0 ? '+' : '' }}{{ fund.estimateGrowth.toFixed(2) }}%
        </span>
        <span v-if="fund.estimateTime" class="nv-date">{{ fund.estimateTime }}</span>
      </template>
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

    <div v-if="fund.ledgerAt && fund.ledgerEstimated" class="ledger-hint">
      部分份额未填写，已按「买入金额 ÷ 当日净值」估算，持有金额与累计收益为估算口径。
    </div>

    <div class="chart-toolbar">
      <div class="toolbar-left">
        <a-radio-group v-model="klt" type="button" size="small">
          <a-radio value="day">日K</a-radio>
          <a-radio value="week">周K</a-radio>
          <a-radio value="month">月K</a-radio>
        </a-radio-group>
        <a-radio-group v-model="selectedMain" type="button" size="small" title="主图指标">
          <a-radio v-for="o in MAIN_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</a-radio>
        </a-radio-group>
        <a-radio-group v-model="selectedRange" type="button" size="small" title="时间范围">
          <a-radio v-for="o in RANGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</a-radio>
        </a-radio-group>
      </div>
      <div class="toolbar-right">
        <a-tag :color="trend >= 0 ? 'red' : 'green'">
          区间{{ trend >= 0 ? '+' : '' }}{{ trend.toFixed(2) }}%
        </a-tag>
        <a-button type="primary" size="small" @click="adviceVisible = true">今日建议</a-button>
      </div>
    </div>

    <div
      ref="chartEl"
      class="chart"
      :style="{ height: isFund ? '660px' : flow?.points?.length ? '560px' : '420px' }"
    />

    <a-alert v-if="fund.kind === 'fund'" type="warning" class="flow-note">
      <template #title>说明：场外基金没有日内资金流向，下方显示的是季度规模变动（亿元）与环比，供参考。</template>
    </a-alert>

    <!-- 风险指标 -->
    <a-card v-if="risk" title="风险指标" :bordered="false" class="sub-card">
      <div class="risk-grid">
        <div class="risk-item">
          <div class="risk-label">最大回撤</div>
          <div class="risk-val shrink">{{ risk.maxDrawdown.toFixed(2) }}%</div>
        </div>
        <div class="risk-item">
          <div class="risk-label">年化波动率</div>
          <div class="risk-val">{{ risk.annualVol.toFixed(2) }}%</div>
        </div>
        <div class="risk-item">
          <div class="risk-label">夏普比率</div>
          <div class="risk-val">{{ risk.sharpe.toFixed(2) }}</div>
        </div>
        <div class="risk-item">
          <div class="risk-label">区间收益（{{ risk.rangeDays }}日）</div>
          <div class="risk-val" :class="risk.rangeReturn >= 0 ? 'grow' : 'shrink'">
            {{ risk.rangeReturn >= 0 ? '+' : '' }}{{ risk.rangeReturn.toFixed(2) }}%
          </div>
        </div>
      </div>
    </a-card>

    <!-- 赎回费 / 持有期提醒（场外基金） -->
    <a-card v-if="isFund" title="持有与赎回费" :bordered="false" class="sub-card">
      <div class="fee-row">
        <span class="fee-label">已持有</span>
        <b class="fee-days">{{ holdDays }}</b>
        <span class="fee-label">天</span>
        <a-tag :color="holdDays < 7 ? 'red' : holdDays < 30 ? 'orange' : 'green'">{{ feeLabel }}</a-tag>
      </div>
      <div v-if="holdDays < 7 && holdDays > 0" class="fee-hint">
        距离满 7 天还差 {{ 7 - holdDays }} 天，赎回费 1.5% 较高，建议谨慎赎回。
      </div>
      <a-list v-if="holdRecords.length" :data="holdRecords" :bordered="false" size="small">
        <template #item="{ item }">
          <a-list-item class="hold-item">
            <span class="hold-date">{{ item.date }}</span>
            <span class="hold-amt">{{ fmtMoney(item.amount) }} 元</span>
            <span class="hold-share">{{ fmtMoney(item.share) }} 份</span>
            <a-button type="text" size="mini" status="danger" @click="onRemoveRecord(item.id)">删除</a-button>
          </a-list-item>
        </template>
      </a-list>
      <a-button type="outline" size="small" @click="openAddHolding">添加买入记录</a-button>
    </a-card>
  </a-card>

  <a-result v-else status="404" title="未找到该标的">
    <template #extra>
      <a-button @click="router.push('/instruments')">返回标的库</a-button>
    </template>
  </a-result>

  <!-- 今日建议弹窗 -->
  <a-modal v-model:visible="adviceVisible" title="今日操作建议" :footer="false" unmount-on-close>
    <div v-if="advice" class="advice-box">
      <div class="advice-head">
        <div class="advice-score">{{ advice.score }}</div>
        <div class="advice-score-label">综合得分</div>
        <a-tag :color="adviceTag" size="large">{{ advice.label }}</a-tag>
      </div>
      <div class="advice-reasons">
        <div v-for="(r, i) in advice.reasons" :key="i" class="advice-reason">{{ r }}</div>
      </div>
      <div class="advice-disclaimer">仅供技术面参考，不构成投资建议。</div>
    </div>
    <a-empty v-else description="数据不足，暂无法生成建议" />
  </a-modal>

  <!-- 添加持有记录弹窗 -->
  <a-modal v-model:visible="addHoldingVisible" title="添加买入记录" :footer="false" unmount-on-close>
    <div class="add-holding-box">
      <a-form layout="vertical" :model="holdForm">
        <a-form-item label="买入日期">
          <a-input v-model="holdForm.date" placeholder="YYYY-MM-DD" />
        </a-form-item>
        <a-form-item label="买入金额（元）">
          <a-input-number v-model="holdForm.amount" :min="0" :precision="2" :style="{ width: '100%' }" />
        </a-form-item>
        <a-form-item label="买入份额（选填）">
          <a-input-number v-model="holdForm.share" :min="0" :precision="2" :style="{ width: '100%' }" />
        </a-form-item>
      </a-form>
      <a-space>
        <a-button type="primary" @click="confirmAddHolding">保存</a-button>
        <a-button @click="addHoldingVisible = false">取消</a-button>
      </a-space>
    </div>
  </a-modal>
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
.nv-sep {
  color: var(--color-text-3);
  margin: 0 2px;
}
.nv-number.est {
  font-size: 20px;
  color: var(--color-text-1);
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 8px;
}
.ledger-hint {
  margin: 0 0 20px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgb(var(--orange-1));
  border: 1px solid rgb(var(--orange-3));
  color: rgb(var(--orange-6));
  font-size: 12px;
  line-height: 1.6;
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
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chart {
  width: 100%;
}
.flow-note {
  margin-top: 12px;
}
.sub-card {
  margin-top: 16px;
}
.risk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}
.risk-item {
  padding: 12px;
  background: var(--color-fill-1);
  border-radius: 8px;
}
.risk-label {
  color: var(--color-text-2);
  font-size: 13px;
  margin-bottom: 6px;
}
.risk-val {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fee-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.fee-label {
  color: var(--color-text-2);
  font-size: 14px;
}
.fee-days {
  font-size: 22px;
  font-weight: 600;
}
.fee-hint {
  margin-bottom: 10px;
  padding: 8px 10px;
  background: rgb(var(--red-1));
  color: rgb(var(--red-6));
  border-radius: 6px;
  font-size: 13px;
}
.hold-item {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.hold-date {
  color: var(--color-text-2);
  font-size: 13px;
}
.hold-amt,
.hold-share {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.advice-box {
  padding: 4px 0;
}
.advice-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.advice-score {
  font-size: 40px;
  font-weight: 700;
  color: #165dff;
  line-height: 1;
}
.advice-score-label {
  color: var(--color-text-3);
  font-size: 13px;
}
.advice-reasons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.advice-reason {
  padding: 8px 10px;
  background: var(--color-fill-1);
  border-radius: 6px;
  font-size: 13px;
}
.advice-disclaimer {
  color: var(--color-text-3);
  font-size: 12px;
  text-align: center;
}
.add-holding-box {
  padding: 4px 0;
}
.grow {
  color: rgb(var(--red-6));
}
.shrink {
  color: rgb(var(--green-6));
}
</style>
