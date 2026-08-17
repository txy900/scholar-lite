<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  submit: [text: string]
}>()

const text = ref('')

const DEMO_TEXT = `Virtual DOM is a programming concept where an ideal, or "virtual", representation of a UI is kept in memory and synced with the "real" DOM.

This process is called reconciliation. When state changes, Vue computes a new Virtual DOM tree and diffs it against the previous one, then applies only the minimal set of changes to the real DOM.

The Composition API was introduced to address limitations of the Options API in large-scale applications, offering better logic reuse and type inference.`

function fillDemo() {
  text.value = DEMO_TEXT
}

function handleSubmit() {
  if (!text.value.trim()) return
  emit('submit', text.value)
}
</script>

<template>
  <div class="input-panel">
    <textarea
      v-model="text"
      class="textarea"
      placeholder="粘贴一段英文技术文档，空行分段。点击“填入示例”可快速体验。"
      rows="6"
    />
    <div class="actions">
      <button class="btn secondary" type="button" @click="fillDemo">填入示例</button>
      <button class="btn primary" type="button" @click="handleSubmit">开始翻译</button>
    </div>
  </div>
</template>

<style scoped>
.input-panel {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e4e7ed);
}
.textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  font-family: inherit;
  resize: vertical;
}
.actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.btn {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid #ddd;
  cursor: pointer;
}
.btn.primary {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}
.btn.secondary {
  background: #fff;
}
</style>
