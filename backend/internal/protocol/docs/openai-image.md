# OpenAI Images

OpenAI Images 声明式插件实现 JSON 文生图和 multipart 图像编辑，并解析 OpenAI Images 风格的 `data[]` 响应。后端从 `openai-images.yingce-plugin` 加载协议，不经旧的手写创建分支。

## 接口与鉴权

{{OPERATIONS}}

```http
POST {channel_base_url}/v1/images/generations
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

提供参考图时，请求改为 `POST /v1/images/edits`、`multipart/form-data`；每张原图是一个 `image` 文件分段，蒙版是独立的 `mask` 文件分段。蒙版没有原图时在提交前失败。

## 模型、尺寸与质量

模型、允许尺寸、质量枚举、单次张数和计费会随上游服务变化，插件不维护可能过期的白名单。渠道若是 OpenAI 兼容实现，必须分别验证它是否支持 `n`、`quality`、`background`、`output_format` 和 Base64 响应。

模型能力配置中的 `responseFormat` 同时声明 `supported` 和 `default`。`default` 可选 `auto`、`b64_json` 或 `url`：`auto` 不发送 `response_format`，由上游使用默认行为；另外两项会明确发送对应值。不要根据 `openai-image` 协议名称推断所有兼容渠道都接受 Base64；需要保存上游实际验证过的模型级配置。

## 参数与字段映射

{{PARAMETERS}}

当前实现：`imageCount -> n`、`aspectRatio -> size`、`quality -> quality`；`images` 根据角色进入编辑请求的 `image` / `mask` 文件分段，不进入文生图 JSON。`resolution` 当前不会进入请求。协议还可声明 `background`、`response_format`、`output_format`、`style` 等扩展字段。

## 文生图请求

```bash
curl "{channel_base_url}/v1/images/generations" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"YOUR_IMAGE_MODEL",
    "prompt":"雨夜便利店门口，青绿色霓虹，电影剧照",
    "size":"1536x1024",
    "quality":"high",
    "n":1
  }'
```

URL 响应：

```json
{"created":1780000000,"data":[{"url":"https://cdn.example/generated.png"}]}
```

Base64 响应：

```json
{"created":1780000000,"data":[{"b64_json":"iVBORw0KGgo..."}]}
```

解析器遍历 `data[]`，优先识别 `url`，也接受 `b64_json` 或 `data`。URL 应立即下载；裸 Base64 会转为 `data:image/png;base64,...`，已带 data URL 前缀的值保持不变。若渠道使用 WebP/JPEG Base64 且响应不返回 MIME，当前协议无法可靠推断格式，应优先请求 URL 或补充带 MIME 的响应合同。

## 图像编辑参考请求

```bash
curl "{channel_base_url}/v1/images/edits" \
  -H "Authorization: Bearer <API_KEY>" \
  -F "model=YOUR_IMAGE_MODEL" \
  -F "image=@reference.png" \
  -F "prompt=保持人物一致，改成雨夜街道"
```

本地协议回归使用包内真实 manifest 和 HTTP 捕获，断言编辑路径、multipart 内容类型及 `image` / `mask` 分段字节。参考图和蒙版的源媒体读取仍受宿主下载、出站地址校验与大小限制约束。正式渠道的模型兼容性与计费需另行验证。

## 官方资料

- [OpenAI Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI Images API reference](https://developers.openai.com/api/reference/resources/images)

{{CONTRACT}}
