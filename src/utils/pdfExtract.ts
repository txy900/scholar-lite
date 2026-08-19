import * as pdfjsLib from 'pdfjs-dist'
// Vite 特有的 `?url` 后缀：把这个文件当静态资源处理，导入的是打包后的URL字符串，
// 而不是把worker代码内联进主bundle——PDF.js的解析工作本来就要跑在独立的worker线程里，
// 不然大文件解析会卡住主线程、页面直接失去响应。
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface TextItemLike {
  str: string
  transform: number[] // [scaleX, skewX, skewY, scaleY, x, y]，第5、6个值是文字左下角坐标
}

interface LineInfo {
  text: string
  xStart: number  // 这一行第一个文字片段的x坐标，用来判断分栏
  y: number        // 这一行的y坐标，PDF坐标系y轴向上，数值越大越靠页面顶部
  fontSize: number // 这一行里最大的字号，用来判断是不是标题
}

/**
 * 把 PDF.js 返回的零散文字片段，按 y 坐标变化重新组装成「行」。
 * 同时记录每行的起始x坐标（供分栏判断用）和字号（供标题判断用）——
 * 字号是从 transform 矩阵反推出来的：矩阵前两个值构成的向量长度约等于字号。
 */
function extractLines(items: TextItemLike[]): LineInfo[] {
  const lines: LineInfo[] = []
  let current: LineInfo | null = null
  let lastY: number | null = null

  for (const item of items) {
    if (!item.str) continue
    const y = item.transform[5]
    const x = item.transform[4]
    const fontSize = Math.hypot(item.transform[0], item.transform[1])

    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (current && current.text.trim()) lines.push(current)
      current = { text: item.str, xStart: x, y, fontSize }
    } else if (!current) {
      current = { text: item.str, xStart: x, y, fontSize }
    } else {
      current.text += item.str
      current.fontSize = Math.max(current.fontSize, fontSize)
    }
    lastY = y
  }
  if (current && current.text.trim()) lines.push(current)
  return lines
}

/**
 * 判断这一页是不是双栏排版，是的话按「先读完左栏、再读右栏」重新排序。
 *
 * 判断依据：统计这一页所有行的起始x坐标，排序后找出「最大的相邻间隙」——
 * 如果这个间隙足够宽（超过页面宽度的12%），且间隙两侧都有相当数量的行
 * （不是极少数几行的偶然分布），就认为这是两栏之间的分隔空白，判定为双栏。
 * 这是一个启发式规则，不保证对所有排版都准确，复杂布局（比如三栏、图文混排）
 * 大概率会误判，需要人工检查。
 */
function reorderForColumns(lines: LineInfo[], pageWidth: number): LineInfo[] {
  if (lines.length < 6) return [...lines].sort((a, b) => b.y - a.y) // 内容太少，直接按上下顺序，没必要判断分栏

  const sortedX = [...lines.map((l) => l.xStart)].sort((a, b) => a - b)
  let maxGap = 0
  let gapIndex = -1
  for (let i = 1; i < sortedX.length; i++) {
    const gap = sortedX[i] - sortedX[i - 1]
    if (gap > maxGap) {
      maxGap = gap
      gapIndex = i
    }
  }

  const isTwoColumn =
    gapIndex > 0 &&
    maxGap > pageWidth * 0.12 &&
    gapIndex >= lines.length * 0.2 &&
    gapIndex <= lines.length * 0.8 // 左右两栏都要有一定数量的行，避免把"个别行缩进不同"误判成分栏

  if (!isTwoColumn) {
    return [...lines].sort((a, b) => b.y - a.y) // 单栏：按从上到下排序作为兜底顺序
  }

  const splitX = (sortedX[gapIndex - 1] + sortedX[gapIndex]) / 2
  const left = lines.filter((l) => l.xStart < splitX).sort((a, b) => b.y - a.y)
  const right = lines.filter((l) => l.xStart >= splitX).sort((a, b) => b.y - a.y)
  return [...left, ...right]
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * 把「行」重新拼接成「自然段落」。
 * 两条规则，满足任意一条就强制断开成新段落：
 *  1. 这一行以句号/问号/感叹号结尾——原有规则，处理正常正文换行
 *  2. 这一行的字号明显大于全文中位数字号（超过1.15倍）——新增规则，专门处理
 *     "标题没有标点符号、容易被误判成正文换行接着往下拼"这个问题
 * 字号判断用的是「全文中位数」而不是"上一行的字号"，因为标题后面紧跟的
 * 第一段正文，字号是正常大小，如果只跟上一行（标题）比较，会误判成"变小了"
 * 从而错误地把正文也当成另一种特殊行处理。
 */
function reconstructParagraphs(lines: LineInfo[]): string {
  if (lines.length === 0) return ''
  const baseFontSize = median(lines.map((l) => l.fontSize)) || 1

  const paragraphs: string[] = []
  let current = ''

  for (const line of lines) {
    const text = line.text.trim()
    if (!text) continue

    const isHeading = line.fontSize > baseFontSize * 1.15
    if (isHeading) {
      if (current) paragraphs.push(current)
      paragraphs.push(text) // 标题单独成一段，不和前后正文拼接
      current = ''
      continue
    }

    current = current ? `${current} ${text}` : text
    if (/[.?!]["')\]]?$/.test(text)) {
      paragraphs.push(current)
      current = ''
    }
  }
  if (current) paragraphs.push(current)

  // 用空行分隔段落，正好匹配现有 translationStore 里「按空行分段」的解析逻辑，
  // 提取出来的内容不需要额外转换，可以直接复用整个翻译流程
  return paragraphs.join('\n\n')
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allLines: LineInfo[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const [, , pageWidth] = page.view // view = [x0, y0, x1, y1]，x1约等于页面宽度
    const content = await page.getTextContent()
    const lines = extractLines(content.items as TextItemLike[])
    allLines.push(...reorderForColumns(lines, pageWidth))
  }

  const result = reconstructParagraphs(allLines)
  if (!result.trim()) {
    throw new Error('未能从这个PDF中提取出文字，可能是扫描版PDF（图片形式），暂不支持')
  }
  return result
}