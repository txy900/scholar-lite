# ScholarLite

英文技术文档双语对照阅读工具（Day 1-2 骨架 + Day 3-4 流式输出 + Day 5-8 同步滚动 已实现）。

参考 ScholarWeaver 的核心交互思路，做了简化版网页应用（不含Electron、文件树、知识库管理等模块）。

## 已实现功能

- [x] 粘贴英文文本，按空行自动分段
- [x] 逐段调用大模型API，流式输出译文（打字机效果）
- [x] 原文/译文双栏对照，**段落级同步滚动**（IntersectionObserver实现，可开关）
- [x] 术语高亮 + 悬浮提示（本地术语表，简化版）
- [x] 任务状态管理（idle/pending/streaming/success/error）

## 还没做（按计划，时间富余再加）

- [ ] 术语一致性升级为RAG检索（目前是写死的术语表）
- [ ] 历史记录本地持久化（IndexedDB）
- [ ] 主题切换（日间/夜间）
- [ ] 文件上传（目前只支持粘贴文本）

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
3. 在 Vercel 的环境变量里配置 `VITE_API_BASE_URL` / `VITE_API_KEY` / `VITE_MODEL`
4. 部署，拿到线上链接

## 核心实现说明（面试可以讲的点）

### 1. 数据结构：段落数组而不是整段字符串

原文/译文都组织成 `{ id, original, translated }[]` 的段落数组（见 `src/types/translation.ts`），
这是同步滚动和术语高亮能实现的前提——如果是整段字符串，没法建立"原文第N段"和"译文第N段"的对应关系。

### 2. 流式输出：为什么用 fetch + ReadableStream 而不是 EventSource

原生 `EventSource` 只能发 GET 请求、不能带自定义 Header，而调用大模型API需要在Header里带 `Authorization`。
所以用 `fetch` + `ReadableStream` 手动解析 SSE 协议（见 `src/api/translateApi.ts`）。

### 3. 段落级同步滚动：为什么用 IntersectionObserver 而不是监听 scroll 事件算百分比

原文和译文的长度通常不一致（中文经常比英文短，或者反过来），如果按滚动百分比同步，
两栏内容对不上。所以给每个段落打 `data-segment-id`，用 `IntersectionObserver` 判断
"当前视口里露出最多的是第几段"，再让另一侧滚动到同一个 segment id（见
`src/composables/useSegmentScrollSync.ts`）。

实现中有个坑：程序化滚动另一侧时，会触发它自己的 IntersectionObserver，
如果不处理会导致两栏互相拉扯、抖动。解决方式是加一个"当前滚动发起方"的锁，
程序化滚动期间忽略另一侧上报的焦点变化。
