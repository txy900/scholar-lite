<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import InputPanel from '@/components/InputPanel.vue'
import OriginalPanel from '@/components/OriginalPanel.vue'
import TranslationPanel from '@/components/TranslationPanel.vue'
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
      <button class="sync-toggle" type="button" @click="store.toggleSync">
        同步滚动：{{ syncScrollEnabled ? '开' : '关' }}
      </button>
    </header>

    <InputPanel @submit="handleSubmit" />

    <main class="dual-panel">
      <OriginalPanel ref="originalPanelRef" :segments="segments" />
      <TranslationPanel ref="translationPanelRef" :segments="segments" :is-busy="isBusy" />
    </main>
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
</style>
