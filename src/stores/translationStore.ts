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
      terms: annotateTerms(original)
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
      controller = new AbortController()

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        await new Promise<void>((resolve) => {
          streamTranslateSegment(
            seg.original,
            {
              onDelta: (text) => {
                const target = this.segments.find((s) => s.id === seg.id)
                if (target) target.translated += text
              },
              onDone: () => resolve(),
              onError: (err) => {
                // 单段失败不再让整个任务中断——只标记这一段出错，
                // 循环继续翻译剩下的段落，出错的段落之后可以单独重试
                const target = this.segments.find((s) => s.id === seg.id)
                if (target) target.error = err.message
                resolve()
              }
            },
            controller?.signal
          )
        })

        const current = this.status as TaskStatus
        if (current === 'cancelled') return

        // 例外：如果连第一段都失败了，大概率是系统性问题（API Key配错、网络不通），
        // 逐段重试没有意义、只会浪费请求，直接判定为整体失败更合理
        if (i === 0 && this.segments[0].error) {
          this.status = 'error'
          this.errorMessage = this.segments[0].error
          return
        }
      }

      this.status = 'success'
      await this.saveCurrentAsHistory()
    },

    /**
     * 单段重试。得益于「段落级独立请求」这个架构，重试单段的实现成本很低——
     * 本质上和首次翻译某一段是同一个函数调用。
     *
     * 有个边界情况需要处理：如果失败的正是「第一段」，translateAll 会判定为系统性问题
     * （比如API Key配错）提前整体退出，这种情况下这一段之后的段落根本没开始翻译过。
     * 所以重试成功后，不能只停在这一段——还要接着把后面「从未尝试过」的段落也跑完，
     * 这样才是真正的「断点续译」，而不是只修好孤立的一段、后面依然一片空白。
     */
    async retrySegment(id: number) {
      const startIndex = this.segments.findIndex((s) => s.id === id)
      if (startIndex === -1) return

      const seg = this.segments[startIndex]
      seg.error = undefined
      seg.translated = '' // 重试前先清空，否则 onDelta 的 += 会把新内容接在失败前的残留文字后面
      seg.retrying = true

      // 重试期间也要让 isBusy 为 true——否则用户可以在重试进行中同时点"开始翻译"
      // 重新提交整篇，导致两路请求互相冲突（和最早修的"重复点击"是同一类问题）
      const statusBeforeRetry = this.status
      this.status = 'streaming'

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
              seg.retrying = false
              resolve()
            },
            onError: (err) => {
              seg.error = err.message
              seg.retrying = false
              resolve()
            }
          },
          controller?.signal
        )
      })

      if (seg.error) {
        this.status = statusBeforeRetry // 重试还是失败，恢复到重试前的状态，别让 isBusy 卡死
        return
      }

      // 重试成功后，接着翻译后面「还没被尝试过」的段落（原文非空、还没有译文、也没有报错记录）
      for (let i = startIndex + 1; i < this.segments.length; i++) {
        const next = this.segments[i]
        if (next.translated || next.error) continue // 已经跑过（成功或失败）的段落跳过

        await new Promise<void>((resolve) => {
          streamTranslateSegment(
            next.original,
            {
              onDelta: (text) => {
                next.translated += text
              },
              onDone: () => resolve(),
              onError: (err) => {
                next.error = err.message
                resolve()
              }
            },
            controller?.signal
          )
        })
      }

      // 所有段落都跑完了，如果没有任何一段还带着错误，就可以判定整体成功了，
      // 补一次历史记录持久化——因为最初那次因为系统性错误提前退出时，是没机会存历史的
      const stillHasError = this.segments.some((s) => s.error)
      if (!stillHasError) {
        this.status = 'success'
        this.errorMessage = ''
        await this.saveCurrentAsHistory()
      } else {
        this.status = statusBeforeRetry // 还有段落没修好，恢复到重试前的状态，不误报成功
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
     * 取消进行中的翻译。中断当前段落的网络请求，已经翻译出来的段落保留展示，
     * 不清空——用户能看到"翻译到哪儿被打断了"，而不是前功尽弃。
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