# ScholarLite

英文技术文档双语对照阅读工具。支持流式翻译、段落级同步滚动、术语高亮、多格式文档导入（txt/md/pdf）、本地历史持久化与Markdown导出。

**在线体验**：https://scholar-lite.vercel.app/

参考 ScholarWeaver 的核心交互思路，做了简化版网页应用（不含Electron桌面壳、文件树、知识库管理等模块）。

## 功能

- 粘贴文本 / 上传 `.txt`、`.md`、`.pdf` 文件，自动分段
- 逐段调用大模型API，流式输出译文（打字机效果）
- 原文/译文双栏对照，**段落级同步滚动**（可开关）
- 术语高亮 + 悬浮提示（本地术语表）
- 翻译**取消**、单段**失败重试并自动续译**后续段落
- 常见错误（API Key无效、请求频率超限、网络异常）的人性化提示
- 断网状态实时感知
- 翻译历史本地持久化（IndexedDB），支持恢复与删除
- 双语对照结果导出为 Markdown

## 技术栈

Vue3 + TypeScript + Vite + Pinia

## 本地运行

```bash
npm install
cp .env.example .env
# 编辑 .env，填入你自己的 API Key（智谱GLM/通义千问/DeepSeek 任选一个，都有免费额度）
npm run dev
```

打开 http://localhost:5173，点击"填入示例"可以快速看到效果，不用自己找文本测试。

## 部署

推荐 Vercel：
1. 把这个项目推到你自己的 GitHub 仓库
2. 在 Vercel 里 import 这个仓库，Framework 选 Vite
3. 在 Vercel 的环境变量里配置 `VITE_API_BASE_URL` / `VITE_API_KEY` / `VITE_MODEL`（Environments 选 Production and Preview）
4. 部署，拿到线上链接

## 核心实现说明

### 1. 数据结构：段落数组而不是整段字符串

原文/译文都组织成 `Segment[]` 数组（见 `src/types/translation.ts`），每个段落带 `id`、`original`、`translated`、
`done`、`error` 等字段。这是同步滚动、术语高亮、单段重试能实现的前提——如果是整段字符串，
没法建立"原文第N段"和"译文第N段"的对应关系，也没法单独标记某一段的完成/失败状态。

### 2. 流式输出：为什么用 fetch + ReadableStream 而不是 EventSource

原生 `EventSource` 只能发 GET 请求、不能带自定义 Header，而调用大模型API需要在Header里带 `Authorization`。
所以用 `fetch` + `ReadableStream` 手动解析 SSE 协议（见 `src/api/translateApi.ts`）。

### 3. 段落级同步滚动：两版方案的取舍

原文和译文的长度通常不一致，按滚动百分比同步会导致内容对不上，所以给每个段落打
`data-segment-id`，判断"当前视口里最靠上的是第几段"，再让另一侧滚动到同一个 segment id
（见 `src/composables/useSegmentScrollSync.ts`）。

第一版用 `IntersectionObserver` 实现，实测发现它只在元素跨过预设阈值点（如25%/50%/75%）时才
触发回调，判断"当前焦点段落"的信息滞后、不连续，导致同步不准、还会抖动。第二版改用
`scroll` 事件 + `requestAnimationFrame` 节流 + `getBoundingClientRect` 实时测量，每一帧都能拿到
精确位置，不再依赖离散阈值。同时加了一个"当前滚动发起方"的锁，避免程序化滚动另一侧时
触发它自己的滚动事件、反过来又影响发起方，形成双向拉扯。

### 4. 单段失败重试与自动续译

`translationStore.ts` 里把"翻译单个段落"的核心逻辑收进 `runSingleSegment`，`translateAll`
（首次翻译）和 `retrySegment`（失败重试）都复用这一个函数，避免同一套"调API+处理流式回调"
的逻辑写两遍导致行为不一致。重试不是只修好失败的那一段——如果失败的正是第一段（会被判定
为系统性问题，比如API Key配错，整体提前退出），重试成功后会自动接着翻译后面"从未尝试过"
的段落，做到真正的断点续译，而不是修好一段、后面依然空白。

### 5. PDF解析：字号识别标题 + 双栏重排序

基于 `pdfjs-dist` 提取PDF文本（见 `src/utils/pdfExtract.ts`）。PDF里的换行只是排版换行，
不代表段落结束，原本按"是否以句号结尾"分段的规则对无标点的标题天然失效，会把标题和正文
错误拼接。解决方式是从 PDF.js 提供的文字变换矩阵反推出每行字号，用全文字号中位数作为基准，
明显偏大的行强制识别为标题、独立成段。

双栏排版文档（比如论文）如果按PDF提取的原始顺序读取，会出现"左栏第一行、右栏第一行……"
交叉错乱。解决方式是统计每页所有行的起始x坐标，找出最大的相邻间隙——如果间隙够宽、且两侧
都有足够数量的行，判定为双栏，先输出左栏全部内容（从上到下），再输出右栏。

两条规则都是启发式的，不保证对所有排版100%准确（比如仅靠加粗不放大字号的标题识别不出来），
复杂PDF建议提取后人工检查分段。

### 6. 历史持久化：为什么用 IndexedDB 而不是 localStorage

`localStorage` 是同步API，数据量大时会阻塞主线程，且只能存字符串、单域名容量通常在5MB左右；
`IndexedDB` 异步、原生支持存结构化对象、容量大得多，适合存多篇翻译历史（见
`src/utils/historyDb.ts`）。存历史记录前会对 Pinia 的响应式 state 做一次
`JSON.parse(JSON.stringify(...))` 深拷贝，避免把响应式代理对象直接存进数据库。

### 7. AbortController 不放进 Pinia state

`AbortController` 带有内部方法和状态，不适合被 Pinia 的响应式代理包裹，所以用模块作用域的
普通变量持有它，而不是放进 `state` 里。