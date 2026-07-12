# H5 页面生成平台

使用 `@anthropic-ai/claude-agent-sdk` + DeepSeek 模型实现的 H5 页面生成平台。核心创新是通过一个 **OpenAI 兼容代理层**，让 Anthropic SDK 透明地使用 DeepSeek 模型。

## 架构

```
h5-platform/
├── backend/                          # Nest.js
│   ├── src/
│   │   ├── main.ts                   # 启动入口，CORS
│   │   ├── app.module.ts             # 根模块
│   │   ├── proxy/
│   │   │   ├── proxy.controller.ts   # POST /v1/messages (Anthropic 兼容接口)
│   │   │   └── proxy.service.ts      # Anthropic ↔ OpenAI/DeepSeek 格式转换
│   │   ├── chat/
│   │   │   ├── chat.controller.ts    # POST /chat/send (SSE), GET /chat/conversations
│   │   │   ├── chat.service.ts       # 业务编排 + DB 持久化
│   │   │   └── deepseek.service.ts   # DeepSeek 直接调用
│   │   ├── agent-sdk/
│   │   │   ├── agent-sdk.controller.ts # POST /agent/run (SDK 全链路)
│   │   │   ├── agent-sdk.module.ts
│   │   │   └── agent-sdk.service.ts    # 封装 @anthropic-ai/claude-agent-sdk query()
│   │   ├── conversation/
│   │   │   ├── conversation.service.ts
│   │   │   └── entities/
│   │   │       ├── conversation.entity.ts
│   │   │       └── message.entity.ts
│   │   └── database/
│   │       └── database.module.ts    # TypeORM + SQLite
│   ├── .env                          # DeepSeek API Key
│   └── data/h5-platform.db           # SQLite 数据库
├── frontend/                         # Next.js
│   └── app/
│       ├── page.tsx                  # 左右分栏布局
│       ├── components/
│       │   ├── ChatPanel.tsx         # 左侧：对话区
│       │   ├── ChatMessage.tsx       # 消息组件 (Markdown + 思考链折叠)
│       │   └── PreviewPanel.tsx      # 右侧：iframe 预览区
│       └── hooks/
│           └── useChatSSE.ts         # SSE 流式接收 hook
└── .gitignore
```

## 核心创新：OpenAI 兼容代理层

`@anthropic-ai/claude-agent-sdk` 目前仅支持 Anthropic 系列模型。为了让 SDK 能使用 DeepSeek，我们实现了一个透明的格式转换代理层：

```
Anthropic Request                    OpenAI/DeepSeek Request
┌──────────────────────┐             ┌──────────────────────┐
│ POST /v1/messages    │    proxy    │ POST /v1/chat/       │
│ model: claude-...    │ ──────────→ │   completions         │
│ messages: [...]      │             │ model: deepseek-...   │
│ thinking: enabled    │   convert   │ messages: [...]       │
│ stream: true         │             │ extra_body: {         │
└──────────────────────┘             │   thinking_mode }     │
       ↕                             └──────────────────────┘
       │  convert back
       ↕
Anthropic SSE (message_start → thinking_delta → signature → text_delta → message_stop)
```

通过设置环境变量 `ANTHROPIC_BASE_URL=http://localhost:3001`，SDK 内部的所有 API 调用都会被重定向到我们的代理层，SDK 完全无感知。

## 完整数据流

```
Frontend (Next.js)
    ↓ POST /agent/run
AgentSdkService.query()
    ↓ env: ANTHROPIC_BASE_URL=http://localhost:3001
@anthropic-ai/claude-agent-sdk
    ↓ spawns Claude CLI subprocess
Claude CLI (with ANTHROPIC_BASE_URL)
    ↓ POST http://localhost:3001/v1/messages
ProxyService (Anthropic → OpenAI 转换)
    ↓ POST https://api.deepseek.com/v1/chat/completions
DeepSeek API (streaming)
    ↓ reasoning_content + content
ProxyService (OpenAI → Anthropic 转换)
    ↓ SSE events (thinking_delta, text_delta, ...)
Claude CLI subprocess
    ↓ yields SDKMessages
@anthropic-ai/claude-agent-sdk
    ↓ Query async iterable
AgentSdkService → AgentSdkController
    ↓ SSE events (thinking, text, done)
Frontend (ChatPanel + PreviewPanel)
```

## API 端点

| 端点 | 说明 | 格式 |
|---|---|---|
| `POST /v1/messages` | Anthropic 兼容代理（供 SDK 调用） | Anthropic SSE 协议 |
| `POST /agent/run` | **SDK 全链路** query() → 代理 → DeepSeek | 自定义 SSE |
| `POST /chat/send` | 直接对话（直接调 DeepSeek） | 自定义 SSE |
| `GET /chat/conversations` | 对话列表 | JSON |
| `GET /chat/conversations/:id` | 对话详情 | JSON |

### SSE 事件格式

所有 SSE 端点使用统一的事件格式：

```
event: meta
data: {"ttfbMs":5550}

event: thinking
data: {"content":"推理过程..."}

event: text
data: {"content":"回复文本..."}

event: done
data: {"usage":{"input_tokens":179,"output_tokens":30,"total_cost_usd":0.001645}}
```

## 数据库模型

### Conversation
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| title | string | 对话标题 |
| createdAt | datetime | 创建时间 |
| updatedAt | datetime | 更新时间 |

### Message
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| role | 'user' \| 'assistant' | 消息角色 |
| content | text | 消息内容 |
| thinkingChain | text | DeepSeek 思考链（reasoning_content） |
| conversationId | UUID | 外键 |
| createdAt | datetime | 创建时间 |

## 快速开始

### 前提

- Node.js >= 18
- DeepSeek API Key（从 [platform.deepseek.com](https://platform.deepseek.com) 获取）
- Claude CLI：`npm install -g @anthropic-ai/claude-code`（SDK 全链路需要）

### 安装与运行

```bash
# 1. 安装后端依赖
cd backend
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 DEEPSEEK_API_KEY

# 3. 启动后端（端口 3001）
npm run start:dev

# 4. 新终端，安装前端依赖
cd frontend
npm install

# 5. 启动前端（端口 3000）
npm run dev

# 6. 浏览器打开 http://localhost:3000
```

## 技术栈

- **后端框架**: Nest.js 11
- **AI SDK**: @anthropic-ai/claude-agent-sdk
- **AI 模型**: DeepSeek（通过 OpenAI 兼容 API 调用）
- **数据库**: SQLite + TypeORM
- **前端框架**: Next.js 15 + React 19
- **样式**: Tailwind CSS 4
- **Markdown**: react-markdown + remark-gfm
