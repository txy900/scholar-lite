import type { TermAnnotation } from '@/types/translation'

// P1简化版：写死一个术语表。
// 如果时间充裕（对应P2），可以升级成：把术语表存进向量库，用RAG检索匹配，
// 这样能覆盖术语表里没有预先列出的表达方式，一致性更强。
// 但对于demo演示和"讲清楚原理"这个目标，本地术语表已经足够。
const TERM_GLOSSARY: TermAnnotation[] = [
  { term: 'Virtual DOM', translation: '虚拟DOM' },
  { term: 'Reconciliation', translation: '协调/diff算法' },
  { term: 'Composition API', translation: '组合式API' },
  { term: 'Reactivity', translation: '响应式系统' },
  { term: 'Hoisting', translation: '静态提升' },
  { term: 'Tree-shaking', translation: '摇树优化' },
  { term: 'Server-side Rendering', translation: '服务端渲染' },
  { term: 'Hydration', translation: '水合' }
]

export function annotateTerms(text: string): TermAnnotation[] {
  return TERM_GLOSSARY.filter((t) =>
    new RegExp(`\\b${t.term}\\b`, 'i').test(text)
  )
}

// 把命中的术语在原文里包一层 <span class="term-highlight" data-term="...">
// 供 Vue 用 v-html 渲染，并配合 CSS + title/tooltip 展示译文。
export function highlightText(text: string, terms: TermAnnotation[] = []): string {
  let result = text
  for (const t of terms) {
    const re = new RegExp(`\\b(${t.term})\\b`, 'gi')
    result = result.replace(
      re,
      `<span class="term-highlight" data-tooltip="${t.translation}">$1</span>`
    )
  }
  return result
}
