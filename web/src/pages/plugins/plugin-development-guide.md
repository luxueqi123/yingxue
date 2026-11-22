# 上传统一插件包

宿主只有一种插件：一个版本化 Manifest 描述一个插件包可以向宿主贡献的全部能力。Provider、工作流、画布节点、媒体转换、素材源、Agent 和命令都写在同一个 `contributes` 下；运行时可以不同，但不会再出现“协议插件”和“UI 插件”两套清单。

## 1. 包格式

上传文件必须是 `.yingce-plugin` ZIP 包，大小不超过 48 MiB。包内必须有根目录 `manifest.json`；不能上传裸 JSON。清单和可选的 Web 运行时代码、静态资源属于同一个版本、权限和生命周期：

```text
my-plugin.yingce-plugin
├── manifest.json
├── web/entry.js       # 可选；必须配合 runtime.web=sandbox 或 worker
├── web/assets/...     # 可选静态资源
└── docs/...           # 可选文档
```

后端 Provider 只使用清单中的声明式映射，不执行包内代码。UI/功能代码必须声明 `entry`，由宿主隔离运行时加载；不能把脚本注入主应用页面。当前版本先完成包校验、存储和入口合同，未授权的 Web 代码不会自动进入主页面。

## 2. 最小清单

`manifest.json` 必须是 UTF-8 JSON。插件 ID 使用小写 kebab-case。Manifest 不得包含 Cookie、Token 或 API Key。`entry` 只能指向包内 `web/` 文件。

```json
{
  "apiVersion": "yingce.plugin/v1",
  "id": "acme-comfyui", "name": "Acme ComfyUI", "version": "1.0.0", "author": "Acme", "description": "通过工作流贡献提供视频生成能力",
  "permissions": ["generation.run", "media.read"],
  "configuration": { "fields": [{ "name": "apiKey", "type": "secret", "label": "API Token", "required": true }] },
  "contributes": {
    "providers": [{
      "id": "acme-comfyui", "label": "Acme ComfyUI", "capabilities": ["video"], "scopes": ["user.custom-channel", "canvas"],
      "baseUrl": "https://api.example.com", "auth": { "type": "bearer", "field": "apiKey" },
      "create": { "method": "POST", "path": "/workflows/{{model}}", "fields": { "prompt": "request.prompt", "duration": "request.duration" } },
      "poll": { "method": "GET", "path": "/tasks/{{taskId}}" },
      "response": { "taskIdPaths": ["data.task_id"], "statusPaths": ["data.status"], "resultPaths": ["data.results"], "resultKind": "video", "resultEphemeral": true }
    }],
    "workflows": [{
      "id": "minimax-h3", "label": "MiniMax H3 文生视频", "providerId": "acme-comfyui", "capability": "video",
      "parameters": [{ "name": "duration", "type": "number", "required": true }, { "name": "resolution", "type": "string", "values": ["720p", "1080p"] }],
      "defaults": { "duration": 5, "resolution": "720p" }
    }]
  }
}
```

带 Web 功能的插件在同一份清单中增加：

```json
{
  "entry": "web/entry.js",
  "surfaces": ["fullscreen"],
  "runtime": { "web": "sandbox" }
}
```

## 3. Contribution 规则

- `providers` 声明上游能力和字段映射。鉴权、Base URL、超时、私网校验、轮询、下载和计费由宿主负责。
- `workflows` 声明一个 provider 下的具体工作流或模型入口。AutoDL/ComfyUI 等工作流型 API 必须在这里扩展，不能为每个工作流新增宿主代码。
- `canvasNodes` 声明节点 ID、默认尺寸和 schema。`renderer` 为 `declarative` 时使用宿主 schema renderer；`sandbox` 由隔离运行时承载。
- `transforms` 声明媒体或生成请求转换，必须匹配清单权限和受控 runtime。
- `assetSources`、`usageObservers`、`agents`、`commands` 和 `importExport` 是同一清单的其他贡献面。

一个插件可以同时声明多种贡献，但 ID 必须在插件包内唯一，并且所有贡献共享同一个安装、启停、权限和版本生命周期。

## 4. Provider 与工作流

更新宿主支持受控`inputImages`声明，例如`{ "formats": ["jpeg", "png", "webp"], "maxBytes": 20000000, "minShortSide": 300, "minAspectRatio": 0.4, "maxAspectRatio": 2.5 }`。宿主会在创建前检查实际图片字节及尺寸头，并将`images`和统一`inputs`中的图片替换为同一原字节的Base64引用；自报尺寸与大小不能代替检查。允许格式不重复，`maxBytes`须为正数且不超过64MiB，`minShortSide`须非负；可选宽高比上下界须同时为正数且有序，以实际宽度／高度检查并包含边界。该声明与`requiresPublicMediaUrls`互斥，未声明的Provider行为保持。参考图与首帧的短边约束不同，必须按各Provider合同声明。旧宿主可能忽略新字段，必须先核对宿主更新及运行证据；此门禁不代表完整图片解码、真实生成或完整案例验收。

请求字段右侧只能引用宿主统一请求，例如 `request.prompt`、`request.model`、`request.duration`、`request.extra`。声明式字段也支持安全的对象/数组路径（例如 `request.images.0.url`）和通用字符串变换（`|trim`、`|lower`、`|upper`），不执行插件代码。渠道声明的枚举值由画布完整保留，插件可使用通用大小写变换适配上游，不应要求宿主增加渠道专用归一化。字段解析为空时会省略该字段，适合映射可选参考素材。Provider 如果把 `requiresPublicMediaUrls` 设为 `true`，宿主会在请求前把用户资源转换为短期签名公网 URL。响应映射支持对象路径和数组下标，并可用 `errorPaths` 声明上游错误码路径。同步 provider 只需要 `create` 和 `response`；异步 provider 再声明 `poll`。

结果 URL 如果是短期地址，必须设置 `resultEphemeral: true`。宿主会在任务完成后立即下载并保存资源，画布和任务记录只保存宿主资源引用。

媒体的 `order` 从 0 开始。声明式请求环境在同一媒体列表存在非零 `order` 时保留全部显式顺序，包括数组后部的 `order: 0`；只有全列表均为零（未指定顺序）时才按输入位置赋序。`$sortByOrder` 在此基础上稳定排序，不修改原始请求。参考图与蒙版分组后仍应保留各自顺序，不能把第一参考图换成数组中最早出现的另一张图。

异步成功后还需查询文件地址时，宿主支持受控的两段结果获取：`response.metadata` 用表达式提取查询响应里的文件标识，`result.query` 可引用 `metadata`，`result.validations` 在发请求前校验这些标识。此元数据仅用于本次结果获取，不混入请求 `Extra`，不作为媒体发布，也不把任务 ID 当作文件 ID。

`result.response` 显式声明文件查询的 JSON 响应映射，沿用 `errorPaths`、`resultPaths`、`resultKind` 等合同；只有声明它，宿主才解析 JSON 并下载其媒体 URL。上游错误、非 JSON、空媒体或下载失败保持失败。未声明时沿用原二进制结果端点。结果请求保持相对路径，API Key、URL 安全校验、下载和资源归档仍由宿主管理。此扩展需要更新后的宿主，上传到旧版本不代表完整接通。

## 5. 安全与运行边界

更新宿主支持受控字符串表达式`$hasHan`，仅检测字符串是否含Unicode Han字符（含补充平面），返回布尔值；非字符串报错。配合既有`$len`（按Unicode字符计数）、`$if`及`$lte`可校验供应商的中文／非中文正文上限，不裁剪原文或执行自定义脚本。需要此扩展的包必须先核对宿主版本，上传成功不能代替实际请求验收。

- API Key 只在渠道配置中输入和保存，不进入 Manifest、URL、日志或任务正文。
- 上传插件不能请求 `host:` 执行器，不能执行任意浏览器脚本。
- 外部请求必须通过后端 provider runtime，宿主统一执行 SSRF、防重放、超时、并发、错误和计费策略。
- 插件声明的权限是最小权限；没有对应权限的 contribution 不会被激活。

上传、启用、停用和卸载都作用于同一个插件 registry record。清单校验失败时整包不会安装，不会留下半激活的 provider、节点或工作流。
