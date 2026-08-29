<script setup lang="ts">
import { ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { usePortfolioStore } from '@/stores/portfolio'
import type { MonitorRule } from '@/types/fund'

const fundStore = usePortfolioStore()

const rules = ref<MonitorRule[]>([
  {
    id: 'r1',
    fundCode: '110022',
    type: '涨跌幅',
    threshold: 5,
    condition: 'gt',
    enabled: true,
    remark: '单日涨幅超过 5% 提醒',
  },
  {
    id: 'r2',
    fundCode: '005827',
    type: '净值',
    threshold: 2.0,
    condition: 'lt',
    enabled: true,
    remark: '净值跌破 2.0 提醒',
  },
])

const visible = ref(false)
const form = ref<Partial<MonitorRule>>({
  fundCode: '',
  type: '涨跌幅',
  threshold: 0,
  condition: 'gt',
  enabled: true,
})

function openAdd() {
  form.value = { fundCode: fundStore.funds[0]?.code ?? '', type: '涨跌幅', threshold: 0, condition: 'gt', enabled: true }
  visible.value = true
}

function confirmAdd() {
  if (!form.value.fundCode) {
    Message.warning('请选择基金')
    return
  }
  rules.value.push({
    ...(form.value as MonitorRule),
    id: `r${Date.now()}`,
  })
  visible.value = false
  Message.success('监控规则已创建')
}

function remove(id: string) {
  const idx = rules.value.findIndex((r) => r.id === id)
  if (idx > -1) rules.value.splice(idx, 1)
  Message.success('已删除')
}

function fundName(code: string) {
  return fundStore.getFundByCode(code)?.name ?? code
}
</script>

<template>
  <a-card :bordered="false">
    <div class="toolbar">
      <a-button type="primary" @click="openAdd">新建监控规则</a-button>
    </div>

    <a-table :data="rules" row-key="id" :pagination="false">
      <template #columns>
        <a-table-column title="基金" :width="220">
          <template #cell="{ record }">{{ fundName(record.fundCode) }}</template>
        </a-table-column>
        <a-table-column title="监控类型" data-index="type" :width="100" />
        <a-table-column title="触发条件" :width="160">
          <template #cell="{ record }">
            {{ record.condition === 'gt' ? '大于' : record.condition === 'lt' ? '小于' : '等于' }}
            <a-tag color="arcoblue">{{ record.threshold }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="状态" :width="100">
          <template #cell="{ record }">
            <a-switch v-model:model-value="record.enabled" :disabled="false" />
          </template>
        </a-table-column>
        <a-table-column title="备注" data-index="remark" />
        <a-table-column title="操作" :width="90">
          <template #cell="{ record }">
            <a-popconfirm content="确定删除该规则？" @ok="remove(record.id)">
              <a-button type="text" status="danger">删除</a-button>
            </a-popconfirm>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <a-modal
      v-model:visible="visible"
      title="新建监控规则"
      @ok="confirmAdd"
      @cancel="visible = false"
      unmount-on-close
    >
      <a-form :model="form" layout="vertical">
        <a-form-item label="选择基金" field="fundCode" required>
          <a-select v-model="form.fundCode">
            <a-option v-for="f in fundStore.funds" :key="f.code" :value="f.code">{{ f.name }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="监控类型" field="type">
          <a-select v-model="form.type">
            <a-option value="涨跌幅">涨跌幅</a-option>
            <a-option value="净值">净值</a-option>
            <a-option value="收益">收益</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="触发条件" field="condition">
          <a-select v-model="form.condition">
            <a-option value="gt">大于</a-option>
            <a-option value="lt">小于</a-option>
            <a-option value="eq">等于</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="阈值" field="threshold" required>
          <a-input-number v-model="form.threshold" :style="{ width: '100%' }" :precision="2" />
        </a-form-item>
        <a-form-item label="备注" field="remark">
          <a-input v-model="form.remark" placeholder="选填" />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-card>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}
</style>