<script setup lang="ts">
import { ref } from 'vue'
import type { Segment } from '@/types/translation'
import { useTranslationStore } from '@/stores/translationStore'

defineProps<{
  segments: Segment[]
  isBusy: boolean
}>()

const store = useTranslationStore()
const bodyEl = ref<HTMLElement | null>(null)
defineExpose({ bodyEl })

function handleRetry(id: number) {
  store.retrySegment(id)
}
</script>

<template>
  <div class="panel">
    <div class="panel-title">译文</div>
    <div class="panel-body" ref="bodyEl">
      <div
        v-for="seg in segments"
        :key="seg.id"
        :data-segment-id="seg.id"
        class="segment"
      >
        <template v-if="seg.error">
          <div class="segment-error">
            <span class="error-text">这段翻译失败：{{ seg.error }}</span>
            <button
              class="retry-btn"
              type="button"
              :disabled="seg.retrying"
              @click="handleRetry(seg.id)"
            >
              {{ seg.retrying ? '重试中…' : '重试' }}
            </button>
          </div>
        </template>
        <p v-else class="segment-text">
          {{ seg.translated }}
          <span v-if="(isBusy || seg.retrying) && !seg.translated" class="typing-dot">▍</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}
.panel-title {
  font-weight: 600;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color, #e4e7ed);
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.segment {
  line-height: 1.8;
  margin-bottom: 1.2em;
  scroll-margin-top: 8px;
  min-height: 1.8em;
}
.segment-text {
  margin: 0;
}
.typing-dot {
  animation: blink 1s step-start infinite;
  color: #999;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.segment-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
  font-size: 13px;
}
.error-text {
  color: #f56c6c;
  flex: 1;
}
.retry-btn {
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid #f56c6c;
  background: #fff;
  color: #f56c6c;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>