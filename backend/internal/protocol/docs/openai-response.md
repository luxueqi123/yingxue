# OpenAI Responses API

Responses API 是 OpenAI 当前统一的文本与工具调用接口，输入使用 `input`，可同时承载简单字符串、结构化消息和工具回合。映雪默认发送字符串提示词，并从同步响应的 `output_text` 或 `output[]` 中提取文本。

## 接口、鉴权与请求模式

{{OPERATIONS}}

```http
POST {channel_base_url}/v1/responses
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

## 模型与能力发现

插件不硬编码模型表。请使用渠道模型管理中已验证支持 Responses API 的模型 ID。兼容服务即使实现 `/v1/responses`，也可能不支持内置工具、状态延续、结构化输出或多模态输入，能力必须以该服务文档和实际探测为准。

## 参数与字段映射

{{PARAMETERS}}

`extra` 可透传 `input`、`instructions`、`temperature`、`top_p`、`max_output_tokens`、`stream`、`tools` 和 `text`。`extra.input` 会替换默认字符串；复杂输入必须使用上游规定的 item 结构，不应把 Chat Completions 的 `messages` 原样塞进来。

## 请求示例

```bash
curl "{channel_base_url}/v1/responses" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_MODEL",
    "instructions": "输出可直接拍摄的镜头清单。",
    "input": "一名女孩在停电的商场里寻找出口。",
    "max_output_tokens": 1200
  }'
```

```json
{
  "id": "resp_xxx",
  "status": "completed",
  "output_text": "镜头 1……",
  "usage": {"input_tokens":28,"output_tokens":174,"total_tokens":202}
}
```

## 结构化输入示例

```json
{
  "model": "YOUR_MODEL",
  "input": [{
    "role": "user",
    "content": [{"type":"input_text","text":"分析这段剧情的节奏问题"}]
  }]
}
```

## 响应解析与限制

解析器优先读取顶层 `output_text`；缺失时按顺序拼接 `output[]` 中 message 的 `content[]` 内 `output_text` 正文，保留文本片段间空格与 `usage`。宿主对已识别的 Responses 线格式共用这项归一，普通文本任务和声明式 Agent 均可读取原始 HTTP 响应，不依赖 SDK 补充顶层字段；状态、错误与工具调用仍由插件映射。推理摘要、拒绝信息和工具参数不会混入正文。工具的实际执行仍由 Agent 调用链处理，普通文本任务不会执行 function call、computer use 或 file search，也不会通过 `previous_response_id` 自动续接状态。

流式响应由文本事件链路处理。上游拒绝、模型不支持、输入结构错误、输出 token 超限和工具参数校验失败均应作为失败返回。

## 官方资料

- [OpenAI Responses API Reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)

{{CONTRACT}}
