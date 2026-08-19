<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTranslationStore } from '@/stores/translationStore'
import { storeToRefs } from 'pinia'

const store = useTranslationStore()
const { historyList, historyPanelOpen } = storeToRefs(store)

// 没用浏览器原生 confirm()，因为它是阻塞式弹窗、样式没法自定义，跟项目整体风格不搭。
// 改成「二次点击确认」：第一次点删除，按钮变成「确认删除？」，第二次点才真正执行。
const confirmingId = ref<string | null>(null)

const formattedList = computed(() =>
  historyList.value.map((item) => ({
    ...item,
    timeLabel: new Date(item.createdAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }))
)

function handleRestore(id: string) {
  confirmingId.value = null
  store.restoreFromHistory(id)
}

function handleDeleteClick(id: string, e: Event) {
  e.stopPropagation() // 防止点删除按钮时同时触发外层的恢复点击
  if (confirmingId.value === id) {
    store.removeHistoryEntry(id)
    confirmingId.value = null
  } else {
    confirmingId.value = id
  }
}

function handleCancelDelete(e: Event) {
  e.stopPropagation()
  confirmingId.value = null
}
</script>

<template>
  <transition name="slide">
    <aside v-if="historyPanelOpen" class="history-panel">
      <div class="history-header">
        <span>历史记录</span>
        <button class="close-btn" type="button" @click="store.toggleHistoryPanel">✕</button>
      </div>
      <div v-if="formattedList.length === 0" class="empty">还没有翻译记录</div>
      <ul v-else class="history-list">
        <li v-for="item in formattedList" :key="item.id" @click="handleRestore(item.id)">
          <div class="preview">{{ item.preview || '（空）' }}…</div>
          <div class="meta">
            <span class="time">{{ item.timeLabel }}</span>
            <template v-if="confirmingId === item.id">
              <span class="confirm-group">
                <button class="confirm-btn" type="button" @click="(e) => handleDeleteClick(item.id, e)">
                  确认删除？
                </button>
                <button class="cancel-btn" type="button" @click="handleCancelDelete">取消</button>
              </span>
            </template>
            <button
              v-else
              class="delete-btn"
              type="button"
              @click="(e) => handleDeleteClick(item.id, e)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
    </aside>
  </transition>
</template>

<style scoped>
.history-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 280px;
  height: 100vh;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.06);
  z-index: 20;
  display: flex;
  flex-direction: column;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid #e4e7ed;
}
.close-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #999;
}
.empty {
  padding: 24px 16px;
  color: #999;
  font-size: 14px;
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
.history-list li {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.history-list li:hover {
  background: #f5f7fa;
}
.preview {
  font-size: 13px;
  line-height: 1.4;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}
.meta {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.time {
  font-size: 12px;
  color: #999;
}
.delete-btn {
  font-size: 12px;
  border: none;
  background: none;
  color: #f56c6c;
  cursor: pointer;
}
.confirm-group {
  display: flex;
  gap: 6px;
  align-items: center;
}
.confirm-btn {
  font-size: 12px;
  border: none;
  background: none;
  color: #f56c6c;
  font-weight: 600;
  cursor: pointer;
}
.cancel-btn {
  font-size: 12px;
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>