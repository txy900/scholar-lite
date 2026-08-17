// // 核心数据结构：原文/译文都按「段落数组」组织，而不是一整段字符串。
// // 这是同步滚动、术语高亮能实现的前提 —— 参考 ScholarWeaver 的「段落 ID → 文本」设计思路。

// export interface TermAnnotation {
//   term: string        // 英文术语，如 "Virtual DOM"
//   translation: string // 中文解释，如 "虚拟DOM"
// }

// export interface Segment {
//   id: number                    // 段落序号，原文和译文的第 N 段一一对应
//   original: string               // 该段原文
//   translated: string             // 该段译文（流式输出时逐步填充）
//   terms?: TermAnnotation[]       // 该段命中的术语（简化版：本地术语表匹配）
// }

// export type TaskStatus = 'idle' | 'pending' | 'streaming' | 'success' | 'error'

// export interface TranslationTask {
//   id: string
//   status: TaskStatus
//   segments: Segment[]
//   errorMessage?: string
//   createdAt: number
// }


// 核心数据结构：原文/译文都按「段落数组」组织，而不是一整段字符串。
// 这是同步滚动、术语高亮能实现的前提 —— 参考 ScholarWeaver 的「段落 ID → 文本」设计思路。

export interface TermAnnotation {
  term: string        // 英文术语，如 "Virtual DOM"
  translation: string // 中文解释，如 "虚拟DOM"
}

export interface Segment {
  id: number                    // 段落序号，原文和译文的第 N 段一一对应
  original: string               // 该段原文
  translated: string             // 该段译文（流式输出时逐步填充）
  terms?: TermAnnotation[]       // 该段命中的术语（简化版：本地术语表匹配）
}

export type TaskStatus = 'idle' | 'pending' | 'streaming' | 'success' | 'error' | 'cancelled'

export interface TranslationTask {
  id: string
  status: TaskStatus
  segments: Segment[]
  errorMessage?: string
  createdAt: number
}