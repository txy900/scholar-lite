// 核心数据结构：原文/译文都按「段落数组」组织，而不是一整段字符串。
// 这是同步滚动、术语高亮能实现的前提 —— 参考 ScholarWeaver 的「段落 ID → 文本」设计思路。

export interface TermAnnotation {
  term: string        // 英文术语，如 "Virtual DOM"
  translation: string // 中文解释，如 "虚拟DOM"
}

export interface Segment {
  id: number                     // 段落序号，原文和译文的第 N 段一一对应
  original: string               // 该段原文
  translated: string             // 该段译文（流式输出时逐步填充）
  terms?: TermAnnotation[]       // 该段命中的术语（简化版：本地术语表匹配）
  error?: string                 // 该段翻译失败时的错误信息，用于显示单段重试按钮
  retrying?: boolean             // 该段是否正在重试中（区别于整体 isBusy，只影响这一段的UI）
  done?: boolean                 // 该段是否已经完整翻译完成——不能只看 translated 是否非空来判断，
                                  // 因为「取消」或「网络中断」时 translated 可能是半截内容，
                                  // 必须靠这个显式标记区分「完成」和「被打断的半成品」
}

export type TaskStatus = 'idle' | 'pending' | 'streaming' | 'success' | 'error' | 'cancelled'

export interface TranslationTask {
  id: string
  status: TaskStatus
  segments: Segment[]
  errorMessage?: string
  createdAt: number
}