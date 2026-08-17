<script setup lang="ts">
import { ref } from 'vue'
import type { Segment } from '@/types/translation'
import { highlightText } from '@/utils/termHighlight'

defineProps<{
  segments: Segment[]
}>()

// 把滚动容器的DOM节点暴露给父组件，供 useSegmentScrollSync 绑定 IntersectionObserver
const bodyEl = ref<HTMLElement | null>(null)
defineExpose({ bodyEl })
</script>

<template>
  <div class="panel">
    <div class="panel-title">原文</div>
    <div class="panel-body" ref="bodyEl">
      <p
        v-for="seg in segments"
        :key="seg.id"
        :data-segment-id="seg.id"
        class="segment"
        v-html="highlightText(seg.original, seg.terms)"
      />
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
}
.segment :deep(.term-highlight) {
  background: #fff3cd;
  border-bottom: 1px dashed #d4a017;
  cursor: help;
  position: relative;
}
.segment :deep(.term-highlight)::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 0;
  background: #333;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  display: none;
}
.segment :deep(.term-highlight):hover::after {
  display: block;
}
</style>
