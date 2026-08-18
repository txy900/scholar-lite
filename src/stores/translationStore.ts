// import { defineStore } from 'pinia'
// import { streamTranslateSegment } from '@/api/translateApi'
// import { annotateTerms } from '@/utils/termHighlight'
// import type { Segment, TaskStatus } from '@/types/translation'

// // 简单的分段策略：按空行拆段，过滤空白。
// // 真实文档结构更复杂，但作为P0版本这样已经够用，后续可以按需要升级成更智能的分段。
// function splitIntoSegments(rawText: string): Segment[] {
//   return rawText
//     .split(/\n\s*\n/)
//     .map((t) => t.trim())
//     .filter(Boolean)
//     .map((original, idx) => ({
//       id: idx,
//       original,
//       translated: '',
//       terms: annotateTerms(original)
//     }))
// }

// // AbortController 不是可序列化的响应式数据，不适合放进 Pinia 的 state 里，
// // 所以放在模块作用域，用闭包持有，store 内部通过 action 操作它即可。
// let controller: AbortController | null = null

// export const useTranslationStore = defineStore('translation', {
//   state: () => ({
//     status: 'idle' as TaskStatus,
//     segments: [] as Segment[],
//     errorMessage: '' as string,
//     syncScrollEnabled: true // 对应参考项目里的「同步开关」
//   }),

//   getters: {
//     isBusy: (state) => state.status === 'pending' || state.status === 'streaming'
//   },

//   actions: {
//     reset() {
//       controller?.abort()
//       controller = null
//       this.status = 'idle'
//       this.segments = []
//       this.errorMessage = ''
//     },

//     /**
//      * 提交原文，按段落逐个发起流式翻译请求。
//      * 没有一次性把整篇丢给模型，而是逐段调用，原因：
//      *  1) 可以让「原文第N段」与「译文第N段」的对应关系始终清晰，不需要额外做对齐
//      *  2) 某一段出错时，只影响这一段，不用整篇重来
//      *  3) 支持「取消」——只需中断当前段落的请求，不用等一整篇跑完
//      */
//     async translateAll(rawText: string) {
//       this.reset()
//       const segments = splitIntoSegments(rawText)
//       if (segments.length === 0) {
//         this.errorMessage = '请输入需要翻译的内容'
//         this.status = 'error'
//         return
//       }
//       this.segments = segments
//       this.status = 'streaming'
//       controller = new AbortController()

//       for (const seg of this.segments) {
//         await new Promise<void>((resolve) => {
//           streamTranslateSegment(
//             seg.original,
//             {
//               onDelta: (text) => {
//                 const target = this.segments.find((s) => s.id === seg.id)
//                 if (target) target.translated += text
//               },
//               onDone: () => resolve(),
//               onError: (err) => {
//                 this.errorMessage = err.message
//                 this.status = 'error'
//                 resolve()
//               }
//             },
//             controller?.signal
//           )
//         })
//         // 用 as TaskStatus 是因为 TS 在同步代码里把 status 收窄成了 'streaming'，
//         // 看不到上面异步回调可能把它改成 'error'/'cancelled'，需要手动放宽类型
//         const current = this.status as TaskStatus
//         if (current === 'error' || current === 'cancelled') return
//       }

//       this.status = 'success'
//     },

//     /**
//      * 取消进行中的翻译。中断当前段落的网络请求，已经翻译出来的段落保留展示，
//      * 不清空——用户能看到"翻译到哪儿被打断了"，而不是前功尽弃。
//      */
//     cancelTranslation() {
//       if (!this.isBusy) return
//       controller?.abort()
//       this.status = 'cancelled'
//     },

//     toggleSync() {
//       this.syncScrollEnabled = !this.syncScrollEnabled
//     }
//   }
// })

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

      for (const seg of this.segments) {
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
                this.errorMessage = err.message
                this.status = 'error'
                resolve()
              }
            },
            controller?.signal
          )
        })
        // 用 as TaskStatus 是因为 TS 在同步代码里把 status 收窄成了 'streaming'，
        // 看不到上面异步回调可能把它改成 'error'/'cancelled'，需要手动放宽类型
        const current = this.status as TaskStatus
        if (current === 'error' || current === 'cancelled') return
      }

      this.status = 'success'
      await this.saveCurrentAsHistory()
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