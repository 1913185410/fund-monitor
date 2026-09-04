<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import '@arco-design/web-vue/es/message/style/css.js'
import { usePortfolioStore } from '@/stores/portfolio'
import { useRulesStore } from '@/stores/rules'
import { useReminderStore, REMINDER_TEMPLATES } from '@/stores/reminders'
import { FIELD_META, OP_LABEL, type Rule, type RuleCondition, type RuleOp } from '@/types/rule'
import { kindLabel, kindColor, type InstrumentKind } from '@/types/instrument'

const props = defineProps<{
  modelValue: boolean
  /** 传入则直接进入"自定义条件"编辑该规则 */
  editRule?: Rule | null
  /** 传入则直接进入"内置模板"为该标的选择模板 */
  presetCode?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const portfolio = usePortfolioStore()
const rulesStore = useRulesStore()
const reminders = useReminderStore()

const open = computed(() => props.modelValue)
type Step = 'pick' | 'template' | 'rule'
const step = ref<Step>('pick')
const selectedCode = ref('')
const selectedKind = ref<InstrumentKind>('fund')
const editingId = ref<string | null>(null)
const mode = ref<'create' | 'edit'>('create')

const form = ref<{
  name: string
  code: string
  kind: InstrumentKind
  signal: 'buy' | 'sell' | 'hold'
  combine: 'and' | 'or'
  conditions: RuleCondition[]
  enabled: boolean
}>({ name: '', code: '', kind: 'fund', signal: 'buy', combine: 'and', conditions: [], enabled: true })

function reset() {
  editingId.value = null
  mode.value = 'create'
  form.value = { name: '', code: '', kind: 'fund', signal: 'buy', combine: 'and', conditions: [], enabled: true }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    reset()
    if (props.editRule) {
      // 编辑既有规则 → 直接进条件编辑器
      mode.value = 'edit'
      editingId.value = props.editRule.id
      form.value = {
        name: props.editRule.name,
        code: props.editRule.code,
        kind: props.editRule.kind,
        signal: props.editRule.signal,
        combine: props.editRule.combine,
        conditions: props.editRule.conditions.map((c) => ({ ...c })),
        enabled: props.editRule.enabled,
      }
      selectedCode.value = props.editRule.code
      selectedKind.value = props.editRule.kind
      step.value = 'rule'
    } else if (props.presetCode) {
      selectedCode.value = props.presetCode
      const it = portfolio.funds.find((f) => f.code === props.presetCode)
      selectedKind.value = (it?.kind as InstrumentKind) ?? 'fund'
      step.value = 'template'
    } else {
      step.value = 'pick'
    }
  },
)

function close() {
  emit('update:modelValue', false)
}
function back() {
  if (step.value === 'rule' || step.value === 'template') step.value = 'pick'
  else close()
}

function pickCode(code: string) {
  selectedCode.value = code
  const it = portfolio.funds.find((f) => f.code === code)
  selectedKind.value = (it?.kind as InstrumentKind) ?? 'fund'
}
function goTemplate() {
  if (!selectedCode.value) return Message.warning('请先选择标的')
  form.value.code = selectedCode.value
  form.value.kind = selectedKind.value
  step.value = 'template'
}
function goRule() {
  if (!selectedCode.value) return Message.warning('请先选择标的')
  form.value.code = selectedCode.value
  form.value.kind = selectedKind.value
  step.value = 'rule'
}

/* ---------- 内置模板步骤 ---------- */
function toggleTpl(tplId: string) {
  reminders.toggleTemplate(selectedCode.value, tplId)
  Message.success('已更新监控')
}

/* ---------- 自定义条件步骤 ---------- */
const fieldOptions = computed(() => {
  const fields = rulesStore.fieldsFor(form.value.kind)
  return fields.map((k) => ({ label: FIELD_META[k].label, value: k }))
})
function addCondition() {
  form.value.conditions.push({ id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, field: 'macdGolden', op: 'crossUp', value: 0 })
}
function removeCondition(id: string) {
  form.value.conditions = form.value.conditions.filter((c) => c.id !== id)
}
function onFieldChange(c: RuleCondition) {
  const meta = FIELD_META[c.field]
  if (!meta) return
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
function isValueNeeded(c: RuleCondition) {
  return FIELD_META[c.field]?.op === 'num'
}
function saveRule() {
  const nm = form.value.name.trim() || autoName()
  if (!form.value.code) return Message.warning('请选择标的')
  if (!form.value.conditions.length) return Message.warning('请至少添加一个条件')
  const body = {
    name: nm,
    code: form.value.code,
    kind: form.value.kind,
    signal: form.value.signal,
    combine: form.value.combine,
    conditions: form.value.conditions.map((c) => ({ ...c })),
    enabled: true,
  }
  if (mode.value === 'edit' && editingId.value) {
    const old = rulesStore.rules.find((r) => r.id === editingId.value)
    if (old) rulesStore.updateRule({ ...old, ...body })
    Message.success('规则已更新')
  } else {
    rulesStore.addRule(body)
    Message.success('自定义规则已创建')
  }
  close()
  reminders.evaluateAll()
}
function autoName() {
  const it = portfolio.funds.find((f) => f.code === form.value.code)
  const dir = form.value.signal === 'buy' ? '买入' : form.value.signal === 'sell' ? '卖出' : '观望'
  return `${it?.name ?? form.value.code}-${dir}条件`
}

/* ---------- 监控列表内引用（供编辑某规则） ---------- */
</script>

<template>
  <transition name="csh">
    <div v-if="open" class="composer-mask" @click.self="close">
      <div class="composer">
        <div class="c-bar">
          <button class="c-back" aria-label="返回" @click="back">‹</button>
          <span class="c-title">
            {{ step === 'pick' ? '新建提醒' : step === 'template' ? '选择形态模板' : mode === 'edit' ? '编辑自定义规则' : '自定义条件规则' }}
          </span>
          <button class="c-close" aria-label="关闭" @click="close">×</button>
        </div>

        <!-- ① 选标的 -->
        <div v-if="step === 'pick'" class="c-body">
          <div class="c-label">1 · 选择持仓</div>
          <div class="code-grid">
            <button
              v-for="f in portfolio.funds"
              :key="f.code"
              class="code-chip"
              :class="{ active: selectedCode === f.code }"
              @click="pickCode(f.code)"
            >
              <span class="cc-name" :style="{ color: kindColor(f.kind) }">{{ f.name }}</span>
              <span class="cc-kind">{{ kindLabel(f.kind) }} · {{ f.code }}</span>
            </button>
          </div>

          <div class="c-label" style="margin-top: 18px">2 · 提醒方式</div>
          <div class="type-row">
            <button class="type-card" @click="goTemplate">
              <div class="tc-icon">▦</div>
              <div class="tc-t">内置形态模板</div>
              <div class="tc-d">周线超跌加速 · 日线高位死叉，开箱即用</div>
            </button>
            <button class="type-card" @click="goRule">
              <div class="tc-icon">＋</div>
              <div class="tc-t">自定义条件</div>
              <div class="tc-d">涨跌幅 / MACD / KDJ / 资金流等 23 项自由组合</div>
            </button>
          </div>
        </div>

        <!-- ② 内置模板切换 -->
        <div v-else-if="step === 'template'" class="c-body">
          <div class="c-label">{{ portfolio.funds.find((f) => f.code === selectedCode)?.name }} · 形态模板</div>
          <div
            v-for="t in REMINDER_TEMPLATES"
            :key="t.id"
            class="tpl-row"
            :class="{ on: reminders.templateOn(selectedCode, t.id) }"
          >
            <div class="tpl-info">
              <span class="tpl-name">{{ t.name }}</span>
              <span class="tpl-desc">{{ t.desc }}</span>
            </div>
            <a-switch
              :model-value="reminders.templateOn(selectedCode, t.id)"
              @change="toggleTpl(t.id)"
            />
          </div>
          <p class="hint">切换后立即对该标的启用/停用监控，行情满足条件时自动提醒。</p>
        </div>

        <!-- ③ 自定义条件编辑器 -->
        <div v-else class="c-body">
          <div class="c-label">{{ mode === 'edit' ? '条件规则' : '2 · 配置条件' }}</div>
          <a-input v-model="form.name" placeholder="规则名称（留空自动生成）" style="margin-bottom: 10px" />
          <div class="seg-row">
            <span class="seg-label">方向</span>
            <a-radio-group v-model="form.signal" type="button" size="small">
              <a-radio value="buy">买入</a-radio>
              <a-radio value="sell">卖出</a-radio>
              <a-radio value="hold">观望</a-radio>
            </a-radio-group>
          </div>
          <div class="seg-row">
            <span class="seg-label">组合</span>
            <a-radio-group v-model="form.combine" type="button" size="small">
              <a-radio value="and">全部满足</a-radio>
              <a-radio value="or">任一满足</a-radio>
            </a-radio-group>
          </div>

          <div class="cond-head">
            <span class="seg-label">条件</span>
            <a-button size="mini" type="text" @click="addCondition">+ 添加条件</a-button>
          </div>
          <div v-for="c in form.conditions" :key="c.id" class="cond-row">
            <a-select
              :model-value="c.field"
              size="small"
              :options="fieldOptions"
              style="width: 46%"
              @change="(v: any) => { c.field = v; onFieldChange(c) }"
            />
            <a-select
              v-if="isValueNeeded(c)"
              :model-value="c.op"
              size="small"
              :options="opOptions(c)"
              style="width: 22%"
              @change="(v: any) => (c.op = v)"
            />
            <a-input-number
              v-if="isValueNeeded(c)"
              v-model="c.value"
              size="small"
              style="width: 20%"
              :placeholder="FIELD_META[c.field]?.unit"
            />
            <button class="cond-del" aria-label="删除条件" @click="removeCondition(c.id)">×</button>
          </div>

          <button class="save-btn" @click="saveRule">
            {{ mode === 'edit' ? '保存修改' : '创建提醒' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.composer-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.composer {
  width: 100%;
  max-width: 560px;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-1);
  border-radius: 16px 16px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
}
.c-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-2);
}
.c-title {
  font-size: 15px;
  font-weight: 600;
}
.c-back,
.c-close {
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  font-size: 24px;
  color: var(--color-text-3);
  cursor: pointer;
  line-height: 1;
}
.c-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
}
.c-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-2);
  margin-bottom: 10px;
}
.code-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.code-chip {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  background: var(--color-bg-2);
  cursor: pointer;
}
.code-chip.active {
  border-color: rgb(var(--primary-6));
  background: rgba(22, 93, 255, 0.05);
}
.cc-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-kind {
  font-size: 11px;
  color: var(--color-text-3);
}
.type-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.type-card {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--color-border-2);
  border-radius: 12px;
  background: var(--color-bg-2);
  cursor: pointer;
  transition: border-color 0.12s ease;
}
.type-card:hover {
  border-color: rgb(var(--primary-6));
}
.tc-icon {
  font-size: 20px;
  color: rgb(var(--primary-6));
}
.tc-t {
  font-weight: 600;
}
.tc-d {
  font-size: 11px;
  color: var(--color-text-3);
  line-height: 1.5;
}
.tpl-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  margin-bottom: 8px;
  background: var(--color-bg-2);
}
.tpl-row.on {
  border-color: rgb(var(--primary-6));
  background: rgba(22, 93, 255, 0.04);
}
.tpl-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tpl-name {
  font-weight: 600;
}
.tpl-desc {
  font-size: 12px;
  color: var(--color-text-3);
}
.hint {
  font-size: 12px;
  color: var(--color-text-4);
  margin-top: 4px;
}
.seg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 8px;
  flex-wrap: wrap;
}
.seg-label {
  font-size: 13px;
  color: var(--color-text-2);
}
.cond-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cond-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.cond-del {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--color-fill-2);
  color: var(--color-text-3);
  font-size: 16px;
  cursor: pointer;
}
.save-btn {
  width: 100%;
  height: 42px;
  margin-top: 6px;
  border: none;
  border-radius: 10px;
  background: rgb(var(--primary-6));
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}
.csh-enter-active,
.csh-leave-active {
  transition: opacity 0.2s ease;
}
.csh-enter-from,
.csh-leave-to {
  opacity: 0;
}
.csh-enter-active .composer,
.csh-leave-active .composer {
  transition: transform 0.25s ease;
}
.csh-enter-from .composer,
.csh-leave-to .composer {
  transform: translateY(100%);
}
</style>
