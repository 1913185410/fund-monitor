<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import '@arco-design/web-vue/es/message/style/css.js'
import { usePortfolioStore } from '@/stores/portfolio'
import { instrumentApi } from '@/api/instrument'
import { backtestDCA, type DcaResult } from '@/utils/analytics'
import type { InstrumentKind } from '@/types/instrument'

const store = usePortfolioStore()

const code = ref<string>('')
const amount = ref(1000)
const freq = ref<'week' | 'month'>('week')
const years = ref(2)
const running = ref(false)
const result = ref<DcaResult | null>(null)

const options = computed(() =>
  store.funds.map((f) => ({ value: f.code, label: `${f.name}（${f.code}）` })),
)

function fmtMoney(v?: number) {
  return (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

async function run() {
  const it = store.funds.find((f) => f.code === code.value)
  if (!it) {
    Message.warning('请先选择一只标的')
    return
  }
  running.value = true
  result.value = null
  try {
    const k = await instrumentApi.kline({
      symbol: it.symbol,
      kind: it.kind as InstrumentKind,
      code: it.code,
      klt: 'day',
      count: 500,
    })
    const r = backtestDCA(k?.points ?? [], amount.value, freq.value, years.value)
    if (!r) {
      Message.warning('数据不足，无法回测')
      return
    }
    result.value = r
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '回测失败')
  } finally {
    running.value = false
  }
}
</script>

<template>
  <a-card title="定投回测" :bordered="false">
    <a-form layout="vertical" :model="{ code, amount, freq, years }">
      <a-form-item label="选择标的">
        <a-select v-model="code" placeholder="从自选里选择" :options="options" allow-search />
      </a-form-item>
      <a-form-item label="每期投入金额（元）">
        <a-input-number v-model="amount" :min="10" :precision="2" :style="{ width: '100%' }" />
      </a-form-item>
      <a-form-item label="定投周期">
        <a-radio-group v-model="freq" type="button">
          <a-radio value="week">每周</a-radio>
          <a-radio value="month">每月</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="回测时长">
        <a-radio-group v-model="years" type="button">
          <a-radio :value="1">1 年</a-radio>
          <a-radio :value="2">2 年</a-radio>
          <a-radio :value="3">3 年</a-radio>
          <a-radio :value="5">5 年</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-button type="primary" :loading="running" long @click="run">开始回测</a-button>
    </a-form>

    <div v-if="result" class="result-box">
      <div class="result-grid">
        <div class="result-item">
          <div class="result-label">累计投入</div>
          <div class="result-val">{{ fmtMoney(result.totalInvest) }} 元</div>
        </div>
        <div class="result-item">
          <div class="result-label">当前市值</div>
          <div class="result-val">{{ fmtMoney(result.marketValue) }} 元</div>
        </div>
        <div class="result-item">
          <div class="result-label">累计收益</div>
          <div class="result-val" :class="result.profit >= 0 ? 'grow' : 'shrink'">
            {{ result.profit >= 0 ? '+' : '' }}{{ fmtMoney(result.profit) }} 元
          </div>
        </div>
        <div class="result-item">
          <div class="result-label">收益率</div>
          <div class="result-val" :class="result.profitRate >= 0 ? 'grow' : 'shrink'">
            {{ result.profitRate >= 0 ? '+' : '' }}{{ result.profitRate.toFixed(2) }}%
          </div>
        </div>
        <div class="result-item">
          <div class="result-label">年化收益</div>
          <div class="result-val" :class="result.annualized >= 0 ? 'grow' : 'shrink'">
            {{ result.annualized >= 0 ? '+' : '' }}{{ result.annualized.toFixed(2) }}%
          </div>
        </div>
        <div class="result-item">
          <div class="result-label">定投次数</div>
          <div class="result-val">{{ result.investCount }} 次</div>
        </div>
      </div>
      <div class="result-note">回测基于历史净值模拟，仅供策略参考，不构成投资建议。</div>
    </div>
  </a-card>
</template>

<style scoped>
.result-box {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border-2);
}
.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.result-item {
  padding: 14px;
  background: var(--color-fill-1);
  border-radius: 8px;
}
.result-label {
  color: var(--color-text-2);
  font-size: 13px;
  margin-bottom: 6px;
}
.result-val {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.result-note {
  margin-top: 14px;
  color: var(--color-text-3);
  font-size: 12px;
  text-align: center;
}
.grow {
  color: rgb(var(--red-6));
}
.shrink {
  color: rgb(var(--green-6));
}
</style>
