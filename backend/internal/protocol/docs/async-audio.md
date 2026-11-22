# 异步音频任务兼容协议

该插件定义一个简化的 OpenAI 风格异步音频合同：JSON 创建任务，轮询任务资源，成功后读取媒体 URL。它不是 OpenAI 官方 Speech API，也不代表某个固定供应商。

## 接口与鉴权

{{OPERATIONS}}

```http
POST {channel_base_url}/v1/audio/tasks
GET  {channel_base_url}/v1/audio/tasks/{task_id}
Authorization: Bearer <CHANNEL_API_KEY>
Content-Type: application/json
```

## 模型、声音与计费

模型 ID、任务类型、声音、语言、格式、时长限制、音色克隆权限和计费完全由实现该兼容接口的渠道决定。插件没有供应商白名单；管理员必须用该部署的接口文档校对。

## 参数与字段映射

{{PARAMETERS}}

当前创建正文只包含：

```json
{"model":"YOUR_ASYNC_AUDIO_MODEL","input":"风暴即将到来。","voice":"YOUR_VOICE","response_format":"mp3","speed":1,"instructions":"低沉克制的男声旁白"}
```

当前映射音色、格式、语速与配音要求；没有映射参考音频、歌词或音乐结构。异步接口只是任务提交方式，不代表已经支持音乐作曲或声音克隆。

## 创建、轮询与结果

```bash
curl "{channel_base_url}/v1/audio/tasks" \
  -H "Authorization: Bearer <CHANNEL_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_ASYNC_AUDIO_MODEL","input":"风暴即将到来。","voice":"YOUR_VOICE","response_format":"mp3","speed":1}'
```

创建响应需包含任务 ID，查询路径使用该 ID。轮询 parser 按音频类型提取 `audios`、`audio_url`、`audioUrl`、`result_url` 或 `url`，不会把音频误写入视频结果。若部署返回其他深层结构，必须增加该渠道 fixture 和明确映射。

## 错误与安全

任务不存在、模型不支持、输入过长、声音授权或内容审核失败应原样返回。涉及真人声音克隆时必须确认授权；参考音频和生成链接不得写入公开日志。结果 URL 应尽快转存。

## 官方资料与边界

- 本页以映雪当前 adapter 为唯一字段事实源。
- 渠道部署方必须提供真实的模型、声音、错误码和计费文档；没有这些资料时不能对用户承诺能力。

{{CONTRACT}}
