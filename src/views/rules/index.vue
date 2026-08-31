<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import '@arco-design/web-vue/es/message/style/css.js'
import '@arco-design/web-vue/es/modal/style/css.js'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { FIELD_META, OP_LABEL, SIGNAL_LABEL, type Rule, type RuleCondition, type RuleOp } from '@/types/rule'
import { kindLabel, kindColor, type InstrumentKind } from '@/types/instrument'

const portfolio = usePortfolioStore()
const rulesStore = useRulesStore()

const editorVisible = ref(false)
const editing = ref<Rule | null>(null)
const form = ref<{
  name: string
  code: string
  kind: InstrumentKind
  signal: 'buy' | 'sell' | 'hold'
  combine: 'and' | 'or'
  conditions: RuleCondition[]
  enabled: boolean
  remark: string
}>({
  name: '',
  code: '',
  kind: 'stock',
  signal: 'buy',
  combine: 'and',
  conditions: [],
  enabled: true,
  remark: '',
})

const fieldOptions = computed(() => {
  const fields = rulesStore.fieldsFor(form.value.kind)
  return fields.map((k) => ({ label: FIELD_META[k].label, value: k }))
})

function openCreate() {
  editing.value = null
  form.value = {
    name: '',
    code: portfolio.funds[0]?.code ?? '',
    kind: (portfolio.funds[0]?.kind as InstrumentKind) ?? 'stock',
    signal: 'buy',
    combine: 'and',
    conditions: [{ id: `c${Date.now()}`, field: 'macdGolden', op: 'crossUp', value: 0 }],
    enabled: true,
    remark: '',
  }
  editorVisible.value = true
}

function openEdit(r: Rule) {
  editing.value = r
  form.value = {
    name: r.name,
    code: r.code,
    kind: r.kind,
    signal: r.signal,
    combine: r.combine,
    conditions: r.conditions.map((c) => ({ ...c })),
    enabled: r.enabled,
    remark: r.remark ?? '',
  }
  editorVisible.value = true
}

function onCodeChange() {
  const it = portfolio.funds.find((f) => f.code === form.value.code)
  if (it) form.value.kind = it.kind as InstrumentKind
  // 清理当前类型不适用的条件
  const valid = rulesStore.fieldsFor(form.value.kind)
  form.value.conditions = form.value.conditions.filter((c) => valid.includes(c.field))
}

function addCondition() {
  form.value.conditions.push({ id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, field: 'macdGolden', op: 'crossUp', value: 0 })
}

function removeCondition(id: string) {
  form.value.conditions = form.value.conditions.filter((c) => c.id !== id)
}

function onFieldChange(c: RuleCondition) {
  const meta = FIELD_META[c.field]
  if (meta.op === 'cross') c.op = c.field.includes('Death') ? 'crossDown' : 'crossUp'
  else if (meta.op === 'bool') c.op = 'isTrue'
  else c.op = 'gt'
  c.value = 0
}

function opOptions(c: RuleCondition) {
  const meta = FIELD_META[c.field]
  if (!meta) return []
  if (meta.op === 'cross') {
    const v = c.field.includes('Death') ? 'crossDown' : 'crossUp'
    return [{ label: OP_LABEL[v], value: v }]
  }
  if (meta.op === 'bool') return [{ label: '为真', value: 'isTrue' }]
  return (['gt', 'gte', 'lt', 'lte'] as RuleOp[]).map((o) => ({ label: OP_LABEL[o], value: o }))
}

function save() {
  if (!form.value.name.trim()) return Message.warning('请填写规则名称')
  if (!form.value.code) return Message.warning('请选择标的')
  if (!form.value.conditions.length) return Message.warning('请至少添加一个条件')
  const body = {
    name: form.value.name.trim(),
    code: form.value.code,
    kind: form.value.kind,
    signal: form.value.signal,
    combine: form.value.combine,
    conditions: form.value.conditions.map((c) => ({ ...c })),
    enabled: form.value.enabled,
    remark: form.value.remark.trim(),
  }
  if (editing.value) {
    rulesStore.updateRule({ ...editing.value, ...body })
    Message.success('规则已更新')
  } else {
    rulesStore.addRule(body)
    Message.success('规则已创建')
  }
  editorVisible.value = false
  rulesStore.evaluateAll()
}

async function testRule(r: Rule) {
  const res = await rulesStore.testRule(r)
  const lines = res.detail.length
    ? res.detail.map((d) => `<div>· ${d}</div>`).join('')
    : '<div>（无可用条件）</div>'
  Modal.info({
    title: `测试：${r.name}${res.matched ? ' — 命中' : ' — 未命中'}`,
    content: `<div style="line-height:1.9">${lines}<div style="margin-top:8px;color:#86909c">置信度 ${res.confidence}%</div></div>`,
  })
}

async function runAll() {
  const n = await rulesStore.evaluateAll()
  Message.success(n > 0 ? `评估完成，新增 ${n} 条信号` : '评估完成，无新增信号')
}

function fmtTime(t: number) {
  const d = new Date(t)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function signalColor(s: string) {
  return s === 'buy' ? 'red' : s === 'sell' ? 'green' : 'arcoblue'
}
function signalLabel(s: string) {
  return SIGNAL_LABEL[(s as 'buy' | 'sell' | 'hold')] ?? s
}

function ruleLastHit(r: Rule): number | null {
  const s = rulesStore.signals.find((x) => x.ruleId === r.id)
  return s ? s.time : null
}

const lastEvalText = computed(() =>
  rulesStore.lastEvalAt ? fmtTime(rulesStore.lastEvalAt) : '—',
)

onMounted(() => {
  if (portfolio.funds.length) portfolio.refresh()
  rulesStore.evaluateAll()
})
</script>

<template>
  <div>
    <a-card :bordered="false">
      <div class="toolbar">
        <a-button type="primary" @click="openCreate">新建规则</a-button>
        <a-button :loading="rulesStore.evaluating" @click="runAll">立即评估</a-button>
        <span class="toolbar-info">
          已启用 {{ rulesStore.enabledCount }} 条 · 最近评估 {{ lastEvalText }}
        </span>
      </div>

      <a-table :data="rulesStore.rules" row-key="id" :pagination="false">
        <template #columns>
          <a-table-column title="规则" data-index="name" :min-width="160">
            <template #cell="{ record }">
              <b>{{ record.name }}</b>
              <div v-if="record.remark" class="remark">{{ record.remark }}</div>
            </template>
          </a-table-column>
          <a-table-column title="标的" :width="220">
            <template #cell="{ record }">
              <span class="kind-tag" :style="{ color: kindColor(record.kind), borderColor: kindColor(record.kind) }">
                {{ kindLabel(record.kind) }}
              </span>
              <span class="it-name">{{ record.code }}</span>
            </template>
          </a-table-column>
          <a-table-column title="信号" :width="90">
            <template #cell="{ record }">
              <a-tag :color="signalColor(record.signal)">{{ signalLabel(record.signal) }}</a-tag>
            </template>
          </a-table-column>
          <a-table-column title="条件" :width="180">
            <template #cell="{ record }">
              <a-tag color="arcoblue">{{ record.conditions.length }} 个</a-tag>
              <span class="combine">{{ record.combine === 'and' ? '全部满足' : '任一满足' }}</span>
            </template>
          </a-table-column>
          <a-table-column title="最近命中" :width="140">
            <template #cell="{ record }">
              {{ ruleLastHit(record) ? fmtTime(ruleLastHit(record)!) : '—' }}
            </template>
          </a-table-column>
          <a-table-column title="启用" :width="80">
            <template #cell="{ record }">
              <a-switch :model-value="record.enabled" @change="(v: unknown) => rulesStore.updateRule({ ...record, enabled: Boolean(v) })" />
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="170">
            <template #cell="{ record }">
              <a-button type="text" size="small" @click="testRule(record)">测试</a-button>
              <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
              <a-popconfirm content="确定删除该规则？" @ok="rulesStore.removeRule(record.id)">
                <a-button type="text" size="small" status="danger">删除</a-button>
              </a-popconfirm>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </a-card>

    <a-card title="信号流" :bordered="false" class="mt-card">
      <template #extra>
        <a-button v-if="rulesStore.signals.length" type="text" size="small" @click="rulesStore.clearSignals()">清空</a-button>
      </template>
      <a-empty v-if="!rulesStore.signals.length" description="暂无信号。创建并启用规则后，系统会在每次行情刷新时自动评估。" />
      <a-list v-else :data="rulesStore.signals.slice(0, 50)" :bordered="false">
        <template #item="{ item }">
          <a-list-item class="signal-item">
            <a-tag :color="signalColor(item.signal)">{{ signalLabel(item.signal) }}</a-tag>
            <span class="sig-name">{{ item.name }}</span>
            <span class="sig-rule">{{ item.ruleName }}</span>
            <span class="sig-conf">置信度 {{ item.confidence }}%</span>
            <span class="sig-time">{{ fmtTime(item.time) }}</span>
            <div class="sig-detail">{{ item.detail }}</div>
          </a-list-item>
        </template>
      </a-list>
    </a-card>

    <a-modal
      v-model:visible="editorVisible"
      :title="editing ? '编辑规则' : '新建规则'"
      :width="680"
      @ok="save"
      @cancel="editorVisible = false"
      unmount-on-close
    >
      <a-form :model="form" layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="规则名称" field="name" required>
              <a-input v-model="form.name" placeholder="如：茅台MACD金叉加仓" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="目标标的" field="code" required>
              <a-select v-model="form.code" @change="onCodeChange">
                <a-option v-for="f in portfolio.funds" :key="f.code" :value="f.code">
                  {{ f.name }}（{{ f.code }}）
                </a-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="命中后信号" field="signal">
              <a-radio-group v-model="form.signal" type="button">
                <a-radio value="buy">买入</a-radio>
                <a-radio value="sell">卖出</a-radio>
                <a-radio value="hold">观望</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="条件组合" field="combine">
              <a-radio-group v-model="form.combine" type="button">
                <a-radio value="and">全部满足</a-radio>
                <a-radio value="or">任一满足</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="备注" field="remark">
              <a-input v-model="form.remark" placeholder="选填" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="触发条件">
          <div class="cond-list">
            <div v-for="c in form.conditions" :key="c.id" class="cond-row">
              <a-select v-model="c.field" :style="{ width: 240 }" @change="onFieldChange(c)">
                <a-option v-for="o in fieldOptions" :key="o.value" :value="o.value">{{ o.label }}</a-option>
              </a-select>
              <a-select v-model="c.op" :style="{ width: 100 }">
                <a-option v-for="o in opOptions(c)" :key="o.value" :value="o.value">{{ o.label }}</a-option>
              </a-select>
              <a-input-number
                v-if="FIELD_META[c.field]?.op === 'num'"
                v-model="c.value"
                :style="{ width: 110 }"
                :precision="2"
              />
              <span v-if="FIELD_META[c.field]?.unit" class="unit">{{ FIELD_META[c.field]?.unit }}</span>
              <a-button type="text" status="danger" size="small" @click="removeCondition(c.id)">删除</a-button>
            </div>
            <a-button size="small" @click="addCondition">+ 添加条件</a-button>
            <div class="cond-tip">
              提示：股票/ETF 可选资金流条件；场外基金无日内资金流，相关条件自动隐藏。
            </div>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.toolbar-info {
  color: var(--color-text-3);
  font-size: 13px;
}
.remark {
  color: var(--color-text-3);
  font-size: 12px;
  font-weight: 400;
}
.kind-tag {
  font-size: 12px;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 4px;
  margin-right: 6px;
}
.it-name {
  font-size: 13px;
}
.combine {
  margin-left: 6px;
  color: var(--color-text-3);
  font-size: 12px;
}
.mt-card {
  margin-top: 16px;
}
.signal-item {
  display: grid;
  grid-template-columns: 64px 140px 120px 90px 110px 1fr;
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
}
.sig-conf {
  color: var(--color-text-2);
  font-size: 13px;
}
.sig-time {
  color: var(--color-text-3);
  font-size: 12px;
}
.sig-detail {
  color: var(--color-text-3);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cond-list {
  width: 100%;
}
.cond-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.unit {
  color: var(--color-text-3);
  font-size: 12px;
}
.cond-tip {
  margin-top: 8px;
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
