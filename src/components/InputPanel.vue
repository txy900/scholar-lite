<script setup lang="ts">
import { ref } from 'vue'
import { extractTextFromPdf } from '@/utils/pdfExtract'

const props = defineProps<{
  isBusy: boolean
}>()

const emit = defineEmits<{
  submit: [text: string]
}>()

const text = ref('')
const fileInputEl = ref<HTMLInputElement | null>(null)
const fileError = ref('')
const isExtracting = ref(false) // PDF解析比读txt慢得多，需要单独的loading状态给用户反馈

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

async function handleFileChange(e: Event) {
  fileError.value = ''
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const isPdf = /\.pdf$/i.test(file.name)
  const isPlainText = /\.(txt|md)$/i.test(file.name)

  if (!isPdf && !isPlainText) {
    fileError.value = '暂时只支持 .txt、.md 或 .pdf 文件'
    input.value = '' // 清空选择，允许用户重新选择同一个文件也能再次触发 change 事件
    return
  }

  if (isPlainText) {
    // txt/md 是纯文本，FileReader 读出来就是能直接用的内容，不需要额外解析
    const reader = new FileReader()
    reader.onload = () => {
      text.value = String(reader.result ?? '')
    }
    reader.onerror = () => {
      fileError.value = '文件读取失败，请重试'
    }
    reader.readAsText(file, 'utf-8')
    input.value = ''
    return
  }

  // PDF：解析耗时明显更长（尤其页数多的文件），要给loading反馈，不然像卡住了
  isExtracting.value = true
  try {
    const extracted = await extractTextFromPdf(file)
    text.value = extracted
  } catch (err) {
    fileError.value = (err as Error).message || 'PDF解析失败，请重试'
  } finally {
    isExtracting.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="input-panel">
    <textarea
      v-model="text"
      class="textarea"
      placeholder="粘贴一段英文技术文档，空行分段。点击“填入示例”可快速体验，或上传 txt/md/pdf 文件。"
      rows="6"
      :disabled="isBusy || isExtracting"
    />
    <div v-if="isExtracting" class="file-hint">正在从PDF提取文字…</div>
    <div v-if="fileError" class="file-error">{{ fileError }}</div>
    <!--
      PDF提取出的段落是启发式规则拼接的，不保证100%准确（比如缩写词结尾可能被
      误判成段落结束），建议提取完成后自己快速扫一眼、手动调整分段再翻译
    -->
    <div v-if="text && !isBusy" class="pdf-tip">
      提示：如果内容是从PDF提取的，建议先检查一下分段是否正确，再点击"开始翻译"
    </div>
    <div class="actions">
      <button class="btn secondary" type="button" :disabled="isBusy || isExtracting" @click="fillDemo">
        填入示例
      </button>
      <button
        class="btn secondary"
        type="button"
        :disabled="isBusy || isExtracting"
        @click="triggerFilePicker"
      >
        {{ isExtracting ? '提取中…' : '上传文件' }}
      </button>
      <input
        ref="fileInputEl"
        type="file"
        accept=".txt,.md,.pdf"
        class="file-input"
        @change="handleFileChange"
      />
      <button class="btn primary" type="button" :disabled="isBusy || isExtracting" @click="handleSubmit">
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
.file-hint {
  margin-top: 6px;
  color: #409eff;
  font-size: 13px;
}
.pdf-tip {
  margin-top: 6px;
  color: #999;
  font-size: 12px;
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