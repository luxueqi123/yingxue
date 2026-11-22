# OpenAI Audio Speech

该插件调用 OpenAI 风格的同步文字转语音接口，把映雪提示词映射为 `input`，并传递音色、格式、语速与可选的配音要求。

## 接口与鉴权

{{OPERATIONS}}

```http
POST {channel_base_url}/v1/audio/speech
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

## 模型、声音与输出格式

模型、voice、格式、单次文本长度、流式能力和价格以 OpenAI 或兼容渠道实际文档为准。音色可填写渠道提供的 ID；预设声音不代表所有渠道都支持。模型未配置与缺少制作协议是不同状态。

## 参数与字段映射

{{PARAMETERS}}

实际请求正文固定为：

```json
{"model":"YOUR_TTS_MODEL","input":"请在午夜前离开这座城市。","voice":"YOUR_VOICE","response_format":"mp3","speed":1.25,"instructions":"自然、克制的旁白"}
```

完整上游常见请求参考：

```bash
curl "{channel_base_url}/v1/audio/speech" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_TTS_MODEL","voice":"YOUR_VOICE","input":"请在午夜前离开这座城市。","response_format":"mp3"}' \
  --output speech.mp3
```

节点设置经公共任务合同进入声明式插件。`instructions` 为空时省略；音色、格式与语速保持节点选择。

## 响应与当前实现差异

随包插件声明 `binaryPayload`，同步响应按音频二进制读取并进入映雪资源保存链路。音乐作曲、声音克隆、参考音频、变声和独立采样率控制不属于这个语音合同，不能通过省略这些要求来冒充兼容。

## 官方资料

- [OpenAI Text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)
- [OpenAI Audio Speech reference](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)

{{CONTRACT}}
