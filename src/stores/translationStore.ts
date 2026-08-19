import { defineStore } from 'pinia'
import { streamTranslateSegment } from '@/api/translateApi'
import { annotateTerms } from '@/utils/termHighlight'
import {
  addHistoryEntry,
  getAllHistoryEntries,
  getHistoryEntry,
  deleteHistoryEntry,
  type HistorySummary
} from '@/utils/historyDb'
import type { Segment, TaskStatus } from '@/types/translation'

// 简单的分段策略：按空行拆段，过滤空白。
// 真实文档结构更复杂，但作为P0版本这样已经够用，后续可以按需要升级成更智能的分段。
function splitIntoSegments(rawText: string): Segment[] {
  return rawText
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((original, idx) => ({
      id: idx,
      original,
      translated: '',
      terms: annotateTerms(original),
      done: false
    }))
}

// AbortController 不是可序列化的响应式数据，不适合放进 Pinia 的 state 里，
// 所以放在模块作用域，用闭包持有，store 内部通过 action 操作它即可。
let controller: AbortController | null = null

export const useTranslationStore = defineStore('translation', {
  state: () => ({
    status: 'idle' as TaskStatus,
    segments: [] as Segment[],
    errorMessage: '' as string,
    syncScrollEnabled: true, // 对应参考项目里的「同步开关」
    historyList: [] as HistorySummary[],
    historyPanelOpen: false
  }),

  getters: {
    isBusy: (state) => state.status === 'pending' || state.status === 'streaming'
  },

  actions: {
    reset() {
      controller?.abort()
      controller = null
      this.status = 'idle'
      this.segments = []
      this.errorMessage = ''
    },

    /**
     * 翻译单个段落的核心逻辑，被首次翻译（translateAll）和失败重试（retrySegment）
     * 共用，避免同一套"调API+处理流式回调"的逻辑写两遍。
     * 返回值：这一段是否翻译成功（没有 error）。
     */
    async runSingleSegment(seg: Segment): Promise<boolean> {
      seg.error = undefined
      seg.translated = ''
      seg.done = false

      if (!controller || controller.signal.aborted) {
        controller = new AbortController()
      }

      await new Promise<void>((resolve) => {
        streamTranslateSegment(
          seg.original,
          {
            onDelta: (text) => {
              seg.translated += text
            },
            onDone: () => {
              seg.done = true
              resolve()
            },
            onError: (err) => {
              seg.error = err.message
              resolve()
            }
          },
          controller?.signal
        )
      })

      return !seg.error
    },

    /**
     * 提交原文，按段落逐个发起流式翻译请求。
     * 没有一次性把整篇丢给模型，而是逐段调用，原因：
     *  1) 可以让「原文第N段」与「译文第N段」的对应关系始终清晰，不需要额外做对齐
     *  2) 某一段出错时，只影响这一段，不用整篇重来
     *  3) 支持「取消」——只需中断当前段落的请求，不用等一整篇跑完
     */
    async translateAll(rawText: string) {
      this.reset()
      const segments = splitIntoSegments(rawText)
      if (segments.length === 0) {
        this.errorMessage = '请输入需要翻译的内容'
        this.status = 'error'
        return
      }
      this.segments = segments
      this.status = 'streaming'

      for (let i = 0; i < this.segments.length; i++) {
        const ok = await this.runSingleSegment(this.segments[i])

        if ((this.status as TaskStatus) === 'cancelled') return

        // 例外：如果连第一段都失败了，大概率是系统性问题（API Key配错、网络不通），
        // 逐段重试没有意义、只会浪费请求，直接判定为整体失败更合理
        if (i === 0 && !ok) {
          this.status = 'error'
          this.errorMessage = this.segments[0].error || '翻译失败'
          return
        }
      }

      this.finishIfAllDone()
    },

    /**
     * 单段重试：重试指定段落，成功后自动接着翻译后面「还没跑过」的段落——
     * 这样即使是第一段失败导致后面整体没开始，重试也能把整篇接着补完，
     * 而不是只修好这一段、后面依然一片空白。
     *
     * 注意这和「取消翻译」是两回事：取消代表用户明确不想要这次翻译了，
     * 不提供"继续"入口；重试针对的是"用户想要完整结果，只是某一段网络抖动失败了"
     * 这个更明确的意图，所以只有重试才做续译。
     */
    async retrySegment(id: number) {
      const startIndex = this.segments.findIndex((s) => s.id === id)
      if (startIndex === -1) return

      const statusBeforeRetry = this.status
      this.status = 'streaming' // 保证 isBusy 为 true，防止和"开始翻译"按钮冲突

      for (let i = startIndex; i < this.segments.length; i++) {
        const seg = this.segments[i]
        if (seg.done) continue // 已经成功完成的段落跳过，不重复翻译

        seg.retrying = true
        const ok = await this.runSingleSegment(seg)
        seg.retrying = false

        if (!ok) {
          this.status = statusBeforeRetry // 还是失败，恢复到重试前的状态，别让 isBusy 卡死
          return
        }
      }

      this.finishIfAllDone()
    },

    /**
     * 统一的收尾判断：所有段落都成功完成才算真正的整体成功，才存历史记录；
     * 只要还有一段没完成，就不误报"成功"（之前的版本这里有个小bug：
     * 哪怕中间有段落失败，最后也会无条件标记成功并存历史，现在改成必须
     * 全部完成才算数，更准确）。
     */
    async finishIfAllDone() {
      const allDone = this.segments.every((s) => s.done)
      if (allDone) {
        this.status = 'success'
        this.errorMessage = ''
        await this.saveCurrentAsHistory()
      } else {
        this.status = 'idle'
      }
    },

    /**
     * 把当前这次翻译结果存进IndexedDB，并刷新历史列表。
     * 只在翻译成功完成时调用，取消/出错的半成品不存，避免历史记录里全是垃圾数据。
     */
    async saveCurrentAsHistory() {
      if (this.segments.length === 0) return
      const preview = this.segments[0]?.original.slice(0, 40) ?? ''
      const entry = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        preview,
        segments: JSON.parse(JSON.stringify(this.segments)) as Segment[] // 存快照，避免存进去的是响应式代理对象
      }
      try {
        await addHistoryEntry(entry)
        await this.loadHistoryList()
      } catch (err) {
        // 历史记录存储失败不应该影响主流程（翻译结果依然正常展示），只在控制台记录
        console.error('保存历史记录失败', err)
      }
    },

    async loadHistoryList() {
      try {
        const all = await getAllHistoryEntries()
        this.historyList = all
          .sort((a, b) => b.createdAt - a.createdAt) // 最新的排前面
          .map(({ id, createdAt, preview }) => ({ id, createdAt, preview }))
      } catch (err) {
        console.error('读取历史记录失败', err)
      }
    },

    async restoreFromHistory(id: string) {
      const entry = await getHistoryEntry(id)
      if (!entry) return
      controller?.abort()
      controller = null
      this.status = 'success'
      this.errorMessage = ''
      this.segments = entry.segments
      this.historyPanelOpen = false
    },

    async removeHistoryEntry(id: string) {
      await deleteHistoryEntry(id)
      await this.loadHistoryList()
    },

    toggleHistoryPanel() {
      this.historyPanelOpen = !this.historyPanelOpen
      if (this.historyPanelOpen) this.loadHistoryList()
    },

    /**
     * 取消进行中的翻译。语义上等同于"我不要这次翻译了"，不是"暂停"——
     * 不提供"继续"入口，已经翻译出来的段落保留展示（不清空），
     * 让用户能看到翻译到哪儿被打断的，但要重新翻译的话需要重新点"开始翻译"。
     */
    cancelTranslation() {
      if (!this.isBusy) return
      controller?.abort()
      this.status = 'cancelled'
    },

    toggleSync() {
      this.syncScrollEnabled = !this.syncScrollEnabled
    }
  }
})