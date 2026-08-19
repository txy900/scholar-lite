import type { Segment } from '@/types/translation'

/**
 * 把段落数组拼成一份双语对照的Markdown文档。
 * 复用的还是「段落数组」这个核心数据结构——从翻译展示到历史持久化再到导出，
 * 项目里所有跟内容相关的功能都基于同一份数据模型，不需要为导出单独转换格式。
 */
export function buildMarkdownContent(segments: Segment[]): string {
  const parts = segments.map((seg, idx) => {
    const lines = [`## 段落 ${idx + 1}`, '', '**原文**', '', seg.original, '', '**译文**', '']
    lines.push(seg.translated || (seg.error ? `_（翻译失败：${seg.error}）_` : '_（未翻译）_'))
    return lines.join('\n')
  })

  return [
    '# ScholarLite 双语对照翻译',
    '',
    `> 导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    ...parts
  ].join('\n\n')
}

/**
 * 触发浏览器下载：用 Blob 包装文本内容，生成一个临时的对象URL挂到一个隐藏的
 * <a> 标签上模拟点击。用完要调用 revokeObjectURL 释放内存，否则每次导出
 * 都会残留一个不会被自动回收的URL引用。
 */
export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}