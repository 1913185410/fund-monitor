<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import '@arco-design/web-vue/es/message/style/css.js'
import { IconSearch } from '@arco-design/web-vue/es/icon'
import { useRouter } from 'vue-router'
import { usePortfolioStore } from '@/stores/portfolio'
import { kindLabel, kindColor, type Instrument, type SearchResult } from '@/types/instrument'

const store = usePortfolioStore()
const router = useRouter()

const keyword = ref('')
const searching = ref(false)
const results = ref<SearchResult[]>([])
const showResults = ref(false)
let searchTimer: number | undefined

const addVisible = ref(false)
const addTarget = ref<SearchResult | null>(null)
const addAmount = ref(0)
let pollTimer: number | undefined

async function doSearch(kw: string) {
  if (!kw.trim()) {
    results.value = []
    return
  }
  searching.value = true
  try {
    results.value = await store.search(kw.trim())
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

function onKeywordInput() {
  window.clearTimeout(searchTimer)
  showResults.value = true
  searchTimer = window.setTimeout(() => doSearch(keyword.value), 350)
}

function openAdd(r: SearchResult) {
  addTarget.value = r
  addAmount.value = 0
  addVisible.value = true
  showResults.value = false
}

function confirmAdd() {
  if (!addTarget.value) return
  const ok = store.addFromResult(addTarget.value, addAmount.value)
  addVisible.value = false
  Message.success(ok ? '已加入标的库' : '该标的已在列表中')
}

function goDetail(it: Instrument) {
  router.push({ name: 'instrument-detail', params: { code: it.code } })
}

function confirmRemove(it: Instrument) {
  store.removeFund(it.code)
  Message.success('已移除')
}

async function manualRefresh() {
  await store.refresh()
  Message.success('行情已刷新')
}

function fmtMoney(v?: number) {
  return (v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })
}

function fmtPrice(it: Instrument) {
  if (it.kind === 'fund') return it.nav.toFixed(4)
  return it.nav.toFixed(3)
}

onMounted(() => {
  store.refresh()
  pollTimer = window.setInterval(() => store.refresh(), 60_000)
})
onUnmounted(() => {
  window.clearInterval(pollTimer)
  window.clearTimeout(searchTimer)
})
</script>

<template>
  <a-card :bordered="false">
    <div class="toolbar">
      <div class="search-wrap">
        <a-input
          v-model="keyword"
          placeholder="输入代码 / 名称 / 拼音，如 600519、510300、易方达、茅台"
          allow-clear
          :loading="searching"
          @input="onKeywordInput"
          @focus="showResults = true"
          @blur="showResults = false"
        >
          <template #prefix><icon-search /></template>
        </a-input>
        <div v-if="showResults && (results.length || searching)" class="search-dropdown">
          <div v-if="searching" class="drop-empty">搜索中…</div>
          <template v-else>
            <div
              v-for="r in results"
              :key="`${r.kind}:${r.code}`"
              class="drop-item"
              @mousedown.prevent="openAdd(r)"
            >
              <span class="kind-tag" :style="{ color: kindColor(r.kind), borderColor: kindColor(r.kind) }">
                {{ kindLabel(r.kind) }}
              </span>
              <span class="drop-name">{{ r.name }}</span>
              <span class="drop-code">{{ r.code }}</span>
            </div>
            <div v-if="!results.length" class="drop-empty">未找到匹配标的</div>
          </template>
        </div>
      </div>
      <a-button :loading="store.loading" @click="manualRefresh">刷新行情</a-button>
    </div>

    <a-table :data="store.funds" row-key="code" :pagination="false" :loading="store.loading">
      <template #columns>
        <a-table-column title="标的" data-index="name" :min-width="220">
          <template #cell="{ record }">
            <div class="fund-cell">
              <span class="kind-tag" :style="{ color: kindColor(record.kind), borderColor: kindColor(record.kind) }">
                {{ kindLabel(record.kind) }}
              </span>
              <span class="fund-name" @click="goDetail(record)">{{ record.name }}</span>
            </div>
          </template>
        </a-table-column>
        <a-table-column title="代码" data-index="code" :width="100" />
        <a-table-column title="最新价/净值" :width="120">
          <template #cell="{ record }">
            <b>{{ fmtPrice(record) }}</b>
          </template>
        </a-table-column>
        <a-table-column title="日期" data-index="navDate" :width="110" />
        <a-table-column title="涨跌幅" :width="110">
          <template #cell="{ record }">
            <span :class="record.dailyGrowth >= 0 ? 'grow' : 'shrink'">
              {{ record.dailyGrowth >= 0 ? '+' : '' }}{{ record.dailyGrowth.toFixed(2) }}%
            </span>
          </template>
        </a-table-column>
        <a-table-column title="持有金额(元)" :width="130">
          <template #cell="{ record }">{{ fmtMoney(record.holdingAmount) }}</template>
        </a-table-column>
        <a-table-column title="操作" :width="130">
          <template #cell="{ record }">
            <a-button type="text" size="small" @click="goDetail(record)">详情</a-button>
            <a-popconfirm content="确定移除该标的？" @ok="confirmRemove(record)">
              <a-button type="text" size="small" status="danger">移除</a-button>
            </a-popconfirm>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <a-modal v-model:visible="addVisible" title="加入标的库" :footer="false" unmount-on-close>
      <div v-if="addTarget" class="add-box">
        <div class="add-title">
          <span class="kind-tag" :style="{ color: kindColor(addTarget.kind), borderColor: kindColor(addTarget.kind) }">
            {{ kindLabel(addTarget.kind) }}
          </span>
          <b>{{ addTarget.name }}</b>
          <span class="drop-code">{{ addTarget.code }}</span>
        </div>
        <a-form layout="vertical" :model="{ amount: addAmount }">
          <a-form-item label="持有金额（元，选填，0 表示只观察不持仓）">
            <a-input-number v-model="addAmount" :min="0" :style="{ width: '100%' }" :precision="2" />
          </a-form-item>
        </a-form>
        <a-space>
          <a-button type="primary" @click="confirmAdd">加入</a-button>
          <a-button @click="addVisible = false">取消</a-button>
        </a-space>
      </div>
    </a-modal>
  </a-card>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}
.search-wrap {
  position: relative;
  flex: 1;
  max-width: 480px;
}
.search-dropdown {
  position: absolute;
  top: 38px;
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  max-height: 320px;
  overflow: auto;
}
.drop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
}
.drop-item:hover {
  background: var(--color-fill-2);
}
.drop-empty {
  padding: 14px;
  color: var(--color-text-3);
  font-size: 13px;
  text-align: center;
}
.kind-tag {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 4px;
}
.drop-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drop-code {
  color: var(--color-text-3);
  font-size: 12px;
}
.fund-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fund-name {
  color: #165dff;
  cursor: pointer;
}
.grow {
  color: rgb(var(--red-6));
}
.shrink {
  color: rgb(var(--green-6));
}
.add-box {
  padding: 4px 0;
}
.add-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
</style>
