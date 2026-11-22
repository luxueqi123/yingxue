# ElevenLabs Music 接口字段

## 协议身份

- 插件 ID：`elevenlabs-music`。
- Provider ID：`elevenlabs-music`。
- 能力：`audio`。
- 默认 Base URL：`https://api.elevenlabs.io`。
- 鉴权驱动：`header`。
- 创建：`POST /v1/music`。
- 生命周期：同步响应。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model_id` | 明确选择当前渠道支持的音乐模型版本。 |
| `prompt` | string | 是 | `prompt` | 完整音乐描述，不能当作配音文本提交。 |
| `providerOptions` | object | 否 | `music_length_ms/force_instrumental` | elevenlabs-music 命名空间；曲长为毫秒。 |

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/v1/music"` |
| `create.contentType` | `"application/json"` |
| `create.body.model_id` | `{"$ref":"request.model"}` |
| `create.body.prompt` | `{"$ref":"request.prompt"}` |
| `create.body.music_length_ms` | `{"$omitEmpty":{"$ref":"request.providerOptions.elevenlabs-music.music_length_ms"}}` |
| `create.body.force_instrumental` | `{"$coalesce":[{"$ref":"request.providerOptions.elevenlabs-music.force_instrumental"},false]}` |
| `create.query.output_format` | `"auto"` |

## Provider 扩展键

- `providerOptions.elevenlabs-music.force_instrumental`
- `providerOptions.elevenlabs-music.music_length_ms`

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.binaryPayload` | `true` |
| `response.resultKind` | `"audio"` |
| `response.status` | `"succeeded"` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

协议依据 https://elevenlabs.io/docs/api-reference/music/compose 。POST /v1/music 返回音频文件。音乐曲长保留毫秒，未指定时交由模型决定。仅承接描述作曲，不冒充参考音频、声音克隆或音乐编辑。模型版本必须由用户选择，不根据 LTV 显示名称猜测。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "elevenlabs-music",
  "name": "ElevenLabs Music",
  "version": "2.0.0",
  "author": "ElevenLabs / 影策",
  "description": "ElevenLabs Music 独立请求协议插件。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "elevenlabs-music",
        "label": "ElevenLabs Music",
        "capabilities": [
          "audio"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.elevenlabs.io",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "header",
          "field": "apiKey",
          "header": "xi-api-key"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model_id",
            "description": "明确选择当前渠道支持的音乐模型版本。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "完整音乐描述，不能当作配音文本提交。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "music_length_ms/force_instrumental",
            "description": "elevenlabs-music 命名空间；曲长为毫秒。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "music_v1",
                  "music_v2",
                  "music_v2_5"
                ]
              ]
            },
            "message": "请选择文档支持的 ElevenLabs 音乐模型版本"
          },
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$trim": {
                      "$ref": "request.prompt"
                    }
                  }
                },
                0
              ]
            },
            "message": "请填写音乐描述"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "描述作曲接口不承接参考素材，不能忽略已连接素材"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.elevenlabs-music.music_length_ms"
                    },
                    null
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.providerOptions.elevenlabs-music.music_length_ms"
                        },
                        3000
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.providerOptions.elevenlabs-music.music_length_ms"
                        },
                        600000
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$toInt": {
                            "$ref": "request.providerOptions.elevenlabs-music.music_length_ms"
                          }
                        },
                        {
                          "$ref": "request.providerOptions.elevenlabs-music.music_length_ms"
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "音乐时长必须为 3000 至 600000 的整数毫秒"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/music",
          "contentType": "application/json",
          "body": {
            "model_id": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "music_length_ms": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.elevenlabs-music.music_length_ms"
              }
            },
            "force_instrumental": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.elevenlabs-music.force_instrumental"
                },
                false
              ]
            }
          },
          "query": {
            "output_format": "auto"
          }
        },
        "response": {
          "binaryPayload": true,
          "resultKind": "audio",
          "status": "succeeded"
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
