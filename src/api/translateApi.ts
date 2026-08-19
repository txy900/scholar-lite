// 说明：绝大多数国内大模型（智谱GLM、通义千问、DeepSeek、月之暗面等）都提供了
// 兼容 OpenAI /chat/completions 格式的接口，所以这里按 OpenAI 协议封装，
// 换供应商基本只需要改 .env 里的 BASE_URL / API_KEY / MODEL，代码不用动。

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
const API_KEY = import.meta.env.VITE_API_KEY || ''
const MODEL = import.meta.env.VITE_MODEL || 'glm-4-flash'

export interface StreamCallbacks {
  onDelta: (text: string) => void   // 每收到一小段文本就回调一次（打字机效果）
  onDone: () => void
  onError: (err: Error) => void
}

// 把常见的 HTTP 状态码翻译成用户能看懂、能自己处理的提示，
// 而不是甩一串"401 Unauthorized"这种只有开发者才明白的原始错误。
function describeHttpError(status: number, statusText: string): string {
  switch (status) {
    case 401:
    case 403:
      return 'API Key无效或未配置，请检查 .env 文件中的 VITE_API_KEY'
    case 429:
      return '请求过于频繁，请稍后再试'
    case 500:
    case 502:
    case 503:
      return 'AI服务暂时不可用，请稍后再试'
    default:
      return `请求失败（${status} ${statusText}）`
  }
}

/**
 * 流式翻译单个段落。
 * 用 fetch + ReadableStream 手动解析 SSE，因为原生 EventSource 不支持自定义 Header
 * （带不了 Authorization），这个限制在真实项目里也会遇到，值得记住。
 */
export async function streamTranslateSegment(
  originalText: string,
  { onDelta, onDone, onError }: StreamCallbacks,
  signal?: AbortSignal
) {
  try {
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      signal,
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          {
            role: 'system',
            content:
              '你是专业的技术文档翻译引擎。将用户提供的英文段落翻译成中文，只输出译文本身，不要添加任何解释、引号或前后缀。'
          },
          { role: 'user', content: originalText }
        ]
      })
    })

    if (!resp.ok || !resp.body) {
      throw new Error(describeHttpError(resp.status, resp.statusText))
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 协议：每条消息以 \n\n 分隔，每行形如 "data: {...}"
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || '' // 最后一段可能不完整，留到下一次拼接

      for (const line of lines) {
        const trimmed = line.replace(/^data:\s*/, '').trim()
        if (!trimmed || trimmed === '[DONE]') continue

        try {
          const json = JSON.parse(trimmed)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) onDelta(delta)
        } catch {
          // 忽略无法解析的心跳/空行，避免整个流因为一行脏数据中断
        }
      }
    }

    onDone()
  } catch (err) {
    // 用户主动取消（AbortController.abort()）时，fetch 会抛出 AbortError。
    // 这不算真正的"错误"，但仍然要调用 onDone() 让调用方的 Promise 正常 resolve，
    // 否则外层 await 会一直挂起，导致取消后 store 的状态永远卡在 streaming
    if ((err as Error).name === 'AbortError') {
      onDone()
      return
    }
    // 断网、DNS解析失败等场景，fetch 抛出的是 TypeError，消息通常是英文的
    // "Failed to fetch"，同样翻译成用户看得懂的提示
    if (err instanceof TypeError) {
      onError(new Error('网络请求失败，请检查网络连接'))
      return
    }
    onError(err as Error)
  }
}