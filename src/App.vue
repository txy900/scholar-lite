<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import InputPanel from '@/components/InputPanel.vue'
import OriginalPanel from '@/components/OriginalPanel.vue'
import TranslationPanel from '@/components/TranslationPanel.vue'
import HistoryPanel from '@/components/HistoryPanel.vue'
import { useTranslationStore } from '@/stores/translationStore'
import { useSegmentScrollSync } from '@/composables/useSegmentScrollSync'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { buildMarkdownContent, downloadMarkdown } from '@/utils/exportMarkdown'
import { storeToRefs } from 'pinia'

const store = useTranslationStore()
const { segments, status, errorMessage, isBusy, syncScrollEnabled } = storeToRefs(store)

const { isOnline } = useNetworkStatus()

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

// 导出条件：至少要有段落内容——空状态下没什么可导出的
const canExport = computed(() => segments.value.length > 0)

function handleExport() {
  if (!canExport.value) return
  const content = buildMarkdownContent(segments.value)
  const timestamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, '')
    .replace('T', '-')
  downloadMarkdown(content, `scholarlite-${timestamp}.md`)
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
    <!-- 网络状态提示条：离线时立刻反馈，不用等请求超时才发现异常 -->
    <div v-if="!isOnline" class="offline-banner">
      网络已断开，翻译请求可能会失败或卡住，请检查网络连接
    </div>

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
      <button
        v-if="canExport"
        class="export-btn"
        type="button"
        :disabled="isBusy"
        @click="handleExport"
      >
        导出Markdown
      </button>
    </header>

    <InputPanel :is-busy="isBusy" @submit="handleSubmit" />

    <!-- 空状态：还没提交过任何内容时，给出引导文案，而不是一片空白 -->
    <div v-if="status === 'idle' && segments.length === 0" class="empty-state">
      粘贴一段英文技术文档，点击"开始翻译"，或先点"填入示例"快速体验
    </div>

    <!--
      全屏报错卡片：只在"完全没有任何段落数据"时展示，
      比如空输入、或第一段就失败判定为系统性问题（API Key配错等）。
      如果已经有部分段落翻译成功了（只是某一段失败），
      不应该用全屏卡片盖住双栏——那样用户看不到已经翻译好的内容，
      也够不到失败段落旁边的"重试"按钮。这种情况走下面的双栏视图，
      失败的段落会在 TranslationPanel 里单独展示错误提示+重试按钮。
    -->
    <div v-else-if="status === 'error' && segments.length === 0" class="error-state">
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
.offline-banner {
  background: #fdf6ec;
  color: #e6a23c;
  padding: 8px 16px;
  font-size: 13px;
  text-align: center;
  border-bottom: 1px solid #f5dab1;
}
.export-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #67c23a;
  background: #fff;
  color: #67c23a;
  cursor: pointer;
}
.export-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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