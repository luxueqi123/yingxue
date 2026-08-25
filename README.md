<p align="center">
  <img src="web/public/logo.svg" width="88" alt="映雪 logo">
</p>

<h1 align="center">映雪</h1>

<p align="center">为 AI 影视与短剧创作打造的一体化生产工作台</p>

<p align="center">
  <a href="https://tianyayingxue.cn">在线使用</a> ·
  <a href="docs/content/docs/overview/features.mdx">功能说明</a> ·
  <a href="docs/index.md">项目文档</a> ·
  <a href="SECURITY.md">安全策略</a>
</p>

映雪围绕影视内容的实际生产过程设计：从故事构思、角色与场景设定，到分镜编排、图片与视频生成，再到素材归档和任务追踪，都可以在同一个工作区内完成。它不是单一的生成工具，而是一套让创意、镜头和素材持续衔接的创作环境。

当前版本为 `v1.2.0-preview.1`，仍在快速迭代。数据结构和外部接口可能随产品升级调整，建议先在个人、本地或可信环境中使用。

## 映雪能做什么

- **把故事拆成可执行镜头**：整理剧本、角色、场景、风格和参考素材，在画布中编排分镜关系。
- **在一处完成多媒体生成**：统一发起文本、图片、视频和音频任务，支持参考图、首尾帧、视频续写和批量生成等流程。
- **让素材跟着项目走**：集中管理生成结果、上传素材、任务日志和业务引用，减少文件散落与版本混乱。
- **连接不同模型渠道**：通过系统渠道、自定义渠道和逻辑模型组织生成能力，由后端中转敏感请求。
- **让 Agent 参与创作**：借助本地 Canvas Agent、MCP 和 Codex 插件，让 AI 助手理解并操作当前画布。
- **支持个人部署与团队管理**：提供账号、权限、额度、任务队列、对象存储和管理后台等基础能力。

完整能力与当前实现状态见[功能说明](docs/content/docs/overview/features.mdx)。

## 工作方式

```text
故事与创意
   ↓
角色 / 场景 / 风格资产
   ↓
自由画布与结构化分镜
   ↓
图片 / 视频 / 音频生成
   ↓
任务追踪、素材复用与项目交付
```

网页工作区负责创作和画布交互；Go 后端负责登录、权限、任务、资源和模型中转；本地 Canvas Agent 负责连接浏览器画布与本机 AI 工具。各模块可以独立开发，也可以组合为完整服务。

## 快速开始

### 本机开发

需要准备：

- Bun
- Go 1.25
- Node.js 18+（仅 Canvas Agent 需要）

```bash
git clone https://github.com/luxueqi123/open-ai-canvas.git
cd open-ai-canvas
```

Windows PowerShell 可在仓库根目录运行：

```powershell
.\scripts\start-local.ps1
```

脚本会把调试数据放在 Git 忽略的 `.local/project-workbench-debug`，并分别启动前端与后端。首次打开 <http://localhost:3000> 后，可注册首个管理员账号，再到设置中配置模型渠道。

也可以分别启动：

```bash
# 终端一：后端
cd backend
CANVAS_BACKEND_DATA_DIR=../.local/project-workbench-debug go run ./cmd/server

# 终端二：前端
cd web
bun install
bun run dev
```

详细环境变量和排障方法见[本地开发文档](docs/content/docs/backend/local-development.mdx)。

### Docker 运行

本地构建前后端镜像：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

源码热更新开发：

```bash
LOCAL_UID=$(id -u) LOCAL_GID=$(id -g) \
  docker compose -f docker-compose.dev.yml up --build
```

生产部署使用 PostgreSQL、Redis、后端和 Web 四个服务：

```bash
docker compose --env-file .env \
  -f docker-compose.deploy.yml \
  -f docker-compose.build.yml up -d --build
```

生产环境只需公开 Web 端口；后端 `8080` 应保留在 Compose 网络内。部署前请根据 `.env.example` 配置 HTTPS、跨域来源、数据目录和注册开关。

## 数据与安全

- 公开注册默认关闭。请先在受控网络完成首个管理员账号注册，再开放公网入口。
- 生产环境必须使用 HTTPS，并为 `CANVAS_CORS_ORIGINS` 设置准确域名。
- 用户的 API Key 不应出现在 URL、日志、错误上报或公开配置中，只应发送到可信后端。
- 后端默认拒绝访问本机、私网和链路本地上游；开发环境只对白名单中的可信主机放行。
- PostgreSQL、Redis、上传文件、对象存储和备份都应使用持久化数据目录，并限制访问权限。
- 浏览器本地缓存是服务不可用时的降级手段，不等同于服务端已经保存。

安全问题请按[安全策略](SECURITY.md)处理，不要在公开 Issue 中提交密钥、Cookie、数据库或生产日志。

## 项目结构

| 目录 | 作用 |
| --- | --- |
| `web/` | React 工作区、画布交互、模型协议适配和浏览器缓存 |
| `backend/` | Go API、账号权限、任务队列、资源管理和模型中转 |
| `canvas-agent/` | 本机 Agent、MCP、画布会话桥接和本地渠道 |
| `plugins/yingce/` | 映雪的 Codex App 插件与技能 |
| `docs/` | 用户、开发、部署和设计专题文档 |

代码边界与协作规则见 [`AGENTS.md`](AGENTS.md)，文档入口见 [`docs/index.md`](docs/index.md)。

## 开发验证

根据改动范围选择对应命令：

```bash
# 前端
cd web && bun run build

# 后端
cd backend && go test ./...

# Canvas Agent
cd canvas-agent && npm test && npm run build

# 文档站
cd docs && bun run types:check
```

UI 改动还应检查关键路由、明暗主题、弹窗、滚动、空态和核心交互。当前待验证事项记录在[待测试清单](docs/content/docs/progress/pending-test.mdx)。

## 文档导航

- [功能说明](docs/content/docs/overview/features.mdx)
- [本地开发](docs/content/docs/backend/local-development.mdx)
- [插件系统](docs/content/docs/plugins/plugin-system.mdx)
- [工作区设计](docs/design/workspace-shell-design.mdx)
- [更新日志](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)

## 开源来源与许可

映雪是独立维护的二次开发项目，基于 [`ddcat-ai/open-ai-canvas`](https://github.com/ddcat-ai/open-ai-canvas) 继续开发；相关早期画布实现来源于 [`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas)。

项目遵循 [MIT License](LICENSE)。原项目作者与贡献者的版权和署名按许可证要求保留，具体见 [`LICENSE`](LICENSE) 与 [`NOTICE`](NOTICE)。
