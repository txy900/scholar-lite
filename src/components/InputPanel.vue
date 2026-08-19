<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isBusy: boolean
}>()

const emit = defineEmits<{
  submit: [text: string]
}>()

const text = ref('')
const fileInputEl = ref<HTMLInputElement | null>(null)
const fileError = ref('')

const DEMO_TEXT = `Virtual DOM is a programming concept where an ideal, or "virtual", representation of a UI is kept in memory and synced with the "real" DOM.

This process is called reconciliation. When state changes, Vue computes a new Virtual DOM tree and diffs it against the previous one, then applies only the minimal set of changes to the real DOM.

The Composition API was introduced to address limitations of the Options API in large-scale applications, offering better logic reuse and type inference.`

function fillDemo() {
  text.value = DEMO_TEXT
}

function handleSubmit() {
  // 关键修复：翻译进行中禁止重复提交，防止上一次未完成的段落请求
  // 和新一轮请求同时写入同一批 segments，导致译文错乱、状态混乱
  if (props.isBusy) return
  if (!text.value.trim()) return
  emit('submit', text.value)
}

function triggerFilePicker() {
  fileInputEl.value?.click()
}

function handleFileChange(e: Event) {
  fileError.value = ''
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 只接受 txt/md：这两种是纯文本，FileReader 读出来就是能直接用的内容，
  // 不需要额外解析。其他格式（比如 PDF、Word）内部是二进制/复杂标记结构，
  // 不能简单地当文本读，超出了这次要做的范围。
  const isAllowed = /\.(txt|md)$/i.test(file.name)
  if (!isAllowed) {
    fileError.value = '暂时只支持 .txt 或 .md 文件'
    input.value = '' // 清空选择，允许用户重新选择同一个文件也能再次触发 change 事件
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    text.value = String(reader.result ?? '')
  }
  reader.onerror = () => {
    fileError.value = '文件读取失败，请重试'
  }
  reader.readAsText(file, 'utf-8')
  input.value = ''
}
</script>

<template>
  <div class="input-panel">
    <textarea
      v-model="text"
      class="textarea"
      placeholder="粘贴一段英文技术文档，空行分段。点击“填入示例”可快速体验，或上传 txt/md 文件。"
      rows="6"
      :disabled="isBusy"
    />
    <div v-if="fileError" class="file-error">{{ fileError }}</div>
    <div class="actions">
      <button class="btn secondary" type="button" :disabled="isBusy" @click="fillDemo">
        填入示例
      </button>
      <button class="btn secondary" type="button" :disabled="isBusy" @click="triggerFilePicker">
        上传文件
      </button>
      <input
        ref="fileInputEl"
        type="file"
        accept=".txt,.md"
        class="file-input"
        @change="handleFileChange"
      />
      <button class="btn primary" type="button" :disabled="isBusy" @click="handleSubmit">
        {{ isBusy ? '翻译中…' : '开始翻译' }}
      </button>
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
.file-error {
  margin-top: 6px;
  color: #f56c6c;
  font-size: 13px;
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
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.textarea:disabled {
  background: #f5f5f5;
  color: #999;
}
.file-input {
  display: none;
}
</style>