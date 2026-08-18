<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import InputPanel from '@/components/InputPanel.vue'
import OriginalPanel from '@/components/OriginalPanel.vue'
import TranslationPanel from '@/components/TranslationPanel.vue'
import HistoryPanel from '@/components/HistoryPanel.vue'
import { useTranslationStore } from '@/stores/translationStore'
import { useSegmentScrollSync } from '@/composables/useSegmentScrollSync'
import { storeToRefs } from 'pinia'

const store = useTranslationStore()
const { segments, status, errorMessage, isBusy, syncScrollEnabled } = storeToRefs(store)

// 组件实例引用，用于拿到内部的滚动容器DOM
const originalPanelRef = ref<InstanceType<typeof OriginalPanel> | null>(null)
const translationPanelRef = ref<InstanceType<typeof TranslationPanel> | null>(null)

const leftContainer = computed(() => originalPanelRef.value?.bodyEl ?? null)
const rightContainer = computed(() => translationPanelRef.value?.bodyEl ?? null)

const { reinit } = useSegmentScrollSync(
  leftContainer as any,
  rightContainer as any,
  syncScrollEnabled
)

// 段落列表变化（比如新文档提交）后，DOM节点是新的，需要重新绑定观察目标
watch(
  () => segments.value.length,
  async () => {
    await nextTick()
    reinit()
  }
)

function handleSubmit(text: string) {
  store.translateAll(text)
}

const statusText = computed(() => {
  switch (status.value) {
    case 'streaming':
      return '翻译中…'
    case 'success':
      return '翻译完成'
    case 'error':
      return `出错了：${errorMessage.value}`
    case 'cancelled':
      return '已取消'
    default:
      return ''
  }
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="title">ScholarLite · 英文技术文档双语对照阅读</div>
      <div class="status" :class="status">{{ statusText }}</div>
      <button v-if="isBusy" class="cancel-btn" type="button" @click="store.cancelTranslation">
        取消翻译
      </button>
      <button class="sync-toggle" type="button" @click="store.toggleSync">
        同步滚动：{{ syncScrollEnabled ? '开' : '关' }}
      </button>
      <button class="history-toggle" type="button" @click="store.toggleHistoryPanel">
        历史记录
      </button>
    </header>

    <InputPanel :is-busy="isBusy" @submit="handleSubmit" />

    <!-- 空状态：还没提交过任何内容时，给出引导文案，而不是一片空白 -->
    <div v-if="status === 'idle' && segments.length === 0" class="empty-state">
      粘贴一段英文技术文档，点击"开始翻译"，或先点"填入示例"快速体验
    </div>

    <!-- 报错状态：请求失败时给出可见的提示卡片，而不是只在 console 里报错 -->
    <div v-else-if="status === 'error'" class="error-state">
      <div class="error-title">翻译失败</div>
      <div class="error-detail">{{ errorMessage || '请检查网络或 API Key 配置' }}</div>
    </div>

    <main v-else class="dual-panel">
      <OriginalPanel ref="originalPanelRef" :segments="segments" />
      <TranslationPanel ref="translationPanelRef" :segments="segments" :is-busy="isBusy" />
    </main>

    <HistoryPanel />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid #e4e7ed;
}
.title {
  font-weight: 700;
  flex: 1;
}
.status.error {
  color: #f56c6c;
}
.status.success {
  color: #67c23a;
}
.sync-toggle {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
}
.cancel-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #f56c6c;
  background: #fff;
  color: #f56c6c;
  cursor: pointer;
}
.status.cancelled {
  color: #e6a23c;
}
.history-toggle {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: #fff;
  cursor: pointer;
}
.dual-panel {
  flex: 1;
  display: flex;
  min-height: 0;
}
.dual-panel > * {
  flex: 1;
  border-right: 1px solid #e4e7ed;
}
.dual-panel > *:last-child {
  border-right: none;
}
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  padding: 24px;
  text-align: center;
}
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
}
.error-title {
  font-weight: 600;
  color: #f56c6c;
  font-size: 16px;
}
.error-detail {
  color: #999;
  font-size: 14px;
  text-align: center;
}
</style>