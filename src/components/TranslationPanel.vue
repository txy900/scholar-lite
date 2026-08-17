<script setup lang="ts">
import { ref } from 'vue'
import type { Segment } from '@/types/translation'

defineProps<{
  segments: Segment[]
  isBusy: boolean
}>()

const bodyEl = ref<HTMLElement | null>(null)
defineExpose({ bodyEl })
</script>

<template>
  <div class="panel">
    <div class="panel-title">译文</div>
    <div class="panel-body" ref="bodyEl">
      <p
        v-for="seg in segments"
        :key="seg.id"
        :data-segment-id="seg.id"
        class="segment"
      >
        {{ seg.translated }}
        <span v-if="isBusy && !seg.translated" class="typing-dot">▍</span>
      </p>
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
.typing-dot {
  animation: blink 1s step-start infinite;
  color: #999;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
