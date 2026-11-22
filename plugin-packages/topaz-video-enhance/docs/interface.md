# Topaz Video Enhance 接口字段

## 协议身份

- 插件 ID：`topaz-video-enhance`。
- Provider ID：`topaz-video-enhance`。
- 能力：`video`。
- 默认 Base URL：`https://api.topazlabs.com`。
- 鉴权驱动：`header`。
- 创建：`POST /video/express`。
- 查询：`GET /video/{{taskId}}/status`。
- 取消：`DELETE /video/{{taskId}}`。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `filters` | prob-4增强或apo-8增强加插帧。 |
| `videos` | media[] | 是 | `upload` | 唯一原片，通过宿主签名PUT上传。 |
| `providerOptions` | object | 是 | `source/filters/output` | topazVideo命名空间保留原片容器、处理模型、尺寸、声音和编码质量。 |

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/video/express"` |
| `create.contentType` | `"application/json"` |
| `create.body` | `{"$ref":"request.providerOptions.topazVideo"}` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/video/{{taskId}}/status"` |
| `poll.contentType` | `"application/json"` |
| `cancel.method` | `"DELETE"` |
| `cancel.path` | `"/video/{{taskId}}"` |
| `cancel.contentType` | `"application/json"` |

## Provider 扩展键

- 无额外扩展键。

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `{"$coalesce":[{"$ref":"response.requestId"},{"$ref":"taskId"}]}` |
| `response.status` | `{"$if":{"condition":{"$and":[{"$eq":[{"$ref":"response.status"},"complete"]},{"$eq":[{"$trim":{"$coalesce":[{"$ref":"response.download.url"},""]}},""]}]},"then":"failed","else":{"$lower":{"$coalesce":[{"$ref":"response.status"},"pending"]}}}}` |
| `response.message` | `{"$if":{"condition":{"$and":[{"$eq":[{"$ref":"response.status"},"complete"]},{"$eq":[{"$trim":{"$coalesce":[{"$ref":"response.download.url"},""]}},""]}]},"then":"Topaz已完成但缺少成片下载地址","else":{"$ref":"response.message"}}}` |
| `response.videos` | `{"$ref":"response.download.url"}` |
| `response.resultEphemeral` | `true` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

使用 /video/express 单原片上传，不调用accept或complete-upload。宿主加密保存上传进度，状态返回urls时可恢复。2K映射2560长边；无插帧不得启用隐藏fps。缺渠道保留配置要求；无源数据或未接完的原操作不冒充可用。原音策略必须显式指定。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "topaz-video-enhance",
  "name": "Topaz Video Enhance",
  "version": "2.0.0",
  "author": "Topaz Labs / 影策",
  "description": "Topaz Video Enhance 独立请求协议插件。",
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
        "id": "topaz-video-enhance",
        "label": "Topaz Video Enhance",
        "capabilities": [
          "video"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.topazlabs.com",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "header",
          "field": "apiKey",
          "header": "X-API-Key"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "filters",
            "description": "prob-4增强或apo-8增强加插帧。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": true,
            "mapping": "upload",
            "description": "唯一原片，通过宿主签名PUT上传。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": true,
            "mapping": "source/filters/output",
            "description": "topazVideo命名空间保留原片容器、处理模型、尺寸、声音和编码质量。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    1
                  ]
                },
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
                        "$ref": "request.audios"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Topaz视频增强需要唯一原片"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$trim": {
                    "$coalesce": [
                      {
                        "$ref": "request.prompt"
                      },
                      ""
                    ]
                  }
                },
                ""
              ]
            },
            "message": "Topaz视频增强不接收创作文本"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.topazVideo.source.container"
                },
                [
                  "mp4",
                  "mov",
                  "mkv",
                  "webm"
                ]
              ]
            },
            "message": "需要明确原片容器"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.topazVideo.source.external"
                    },
                    null
                  ]
                },
                null
              ]
            },
            "message": "原片通过宿主上传，不能替换为外部凭据源"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.topazVideo.filters"
                      }
                    },
                    1
                  ]
                },
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.topazVideo.filters"
                      }
                    },
                    2
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.topazVideo.filters.0.model"
                    },
                    "prob-4"
                  ]
                }
              ]
            },
            "message": "缺少明确的原片增强模型"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.topazVideo.filters"
                      }
                    },
                    2
                  ]
                },
                "then": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "request.model"
                        },
                        "apo-8"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.topazVideo.filters.1.model"
                        },
                        "apo-8"
                      ]
                    },
                    {
                      "$in": [
                        {
                          "$ref": "request.providerOptions.topazVideo.filters.1.fps"
                        },
                        [
                          24,
                          30,
                          60,
                          90,
                          120
                        ]
                      ]
                    },
                    {
                      "$in": [
                        {
                          "$ref": "request.providerOptions.topazVideo.filters.1.slowmo"
                        },
                        [
                          1,
                          2,
                          3,
                          5
                        ]
                      ]
                    }
                  ]
                },
                "else": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "request.model"
                        },
                        "prob-4"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$coalesce": [
                            {
                              "$ref": "request.providerOptions.topazVideo.output.frameRate"
                            },
                            null
                          ]
                        },
                        null
                      ]
                    }
                  ]
                }
              }
            },
            "message": "增强模型与插帧慢放设置不匹配"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gt": [
                    {
                      "$ref": "request.providerOptions.topazVideo.output.resolution.width"
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$divide": [
                        {
                          "$ref": "request.providerOptions.topazVideo.output.resolution.width"
                        },
                        4
                      ]
                    },
                    {
                      "$toInt": {
                        "$divide": [
                          {
                            "$ref": "request.providerOptions.topazVideo.output.resolution.width"
                          },
                          4
                        ]
                      }
                    }
                  ]
                }
              ]
            },
            "message": "输出像素必须为正数且对齐4像素"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gt": [
                    {
                      "$ref": "request.providerOptions.topazVideo.output.resolution.height"
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$divide": [
                        {
                          "$ref": "request.providerOptions.topazVideo.output.resolution.height"
                        },
                        4
                      ]
                    },
                    {
                      "$toInt": {
                        "$divide": [
                          {
                            "$ref": "request.providerOptions.topazVideo.output.resolution.height"
                          },
                          4
                        ]
                      }
                    }
                  ]
                }
              ]
            },
            "message": "输出像素必须为正数且对齐4像素"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.topazVideo.output.audioTransfer"
                },
                [
                  "Copy",
                  "Convert",
                  "None"
                ]
              ]
            },
            "message": "必须明确原声处理方式"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.topazVideo.output.audioTransfer"
                    },
                    "None"
                  ]
                },
                "then": true,
                "else": {
                  "$in": [
                    {
                      "$ref": "request.providerOptions.topazVideo.output.audioCodec"
                    },
                    [
                      "AAC",
                      "AC3",
                      "PCM"
                    ]
                  ]
                }
              }
            },
            "message": "保留声音需要音频编码"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.topazVideo.output.videoEncoder"
                },
                [
                  "H264",
                  "H265",
                  "AV1",
                  "VP9"
                ]
              ]
            },
            "message": "缺少输出视频编码"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.topazVideo.output.dynamicCompressionLevel"
                },
                [
                  "Low",
                  "Mid",
                  "High"
                ]
              ]
            },
            "message": "必须明确压缩质量"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/video/express",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "$ref": "request.providerOptions.topazVideo"
          }
        },
        "poll": {
          "method": "GET",
          "path": "/video/{{taskId}}/status",
          "originPath": true,
          "contentType": "application/json"
        },
        "cancel": {
          "method": "DELETE",
          "path": "/video/{{taskId}}",
          "originPath": true,
          "contentType": "application/json"
        },
        "upload": {
          "createUrlsPath": "uploadUrls",
          "pendingUrlsPath": "urls",
          "statusPath": "status",
          "receivedStatuses": [
            "initializing",
            "preprocessing",
            "processing",
            "postprocessing",
            "complete"
          ],
          "pendingStatuses": [
            "accepted"
          ]
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.requestId"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "complete"
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$trim": {
                          "$coalesce": [
                            {
                              "$ref": "response.download.url"
                            },
                            ""
                          ]
                        }
                      },
                      ""
                    ]
                  }
                ]
              },
              "then": "failed",
              "else": {
                "$lower": {
                  "$coalesce": [
                    {
                      "$ref": "response.status"
                    },
                    "pending"
                  ]
                }
              }
            }
          },
          "message": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "complete"
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$trim": {
                          "$coalesce": [
                            {
                              "$ref": "response.download.url"
                            },
                            ""
                          ]
                        }
                      },
                      ""
                    ]
                  }
                ]
              },
              "then": "Topaz已完成但缺少成片下载地址",
              "else": {
                "$ref": "response.message"
              }
            }
          },
          "videos": {
            "$ref": "response.download.url"
          },
          "resultEphemeral": true
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
