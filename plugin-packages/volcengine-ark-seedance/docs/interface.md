# 火山方舟 Seedance 官方视频生成 接口字段

## 协议身份

- 插件 ID：`volcengine-ark-seedance`。
- Provider ID：`volcengine-ark-video`。
- 能力：`video`。
- 默认 Base URL：`https://ark.cn-beijing.volces.com`。
- 鉴权驱动：`bearer`。
- 创建：`POST /api/v3/contents/generations/tasks`。
- 查询：`GET /api/v3/contents/generations/tasks/{{taskId}}`。
- 取消：`DELETE /api/v3/contents/generations/tasks/{{taskId}}`。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 视频模型 ID。 |
| `prompt` | string | 是 | `prompt/content/input` | 视频提示词。 |
| `images` | media[] | 否 | `first/last/reference image` | 显式 role 图片输入。 |
| `videos` | media[] | 否 | `reference video` | 参考视频。 |
| `audios` | media[] | 否 | `reference audio/voice` | 参考音频或音色。 |
| `duration` | integer | 否 | `duration/seconds` | 时长秒数。 |
| `aspectRatio` | string | 否 | `ratio/aspect_ratio/size` | 画幅比例或尺寸。 |
| `resolution` | string | 否 | `resolution` | 分辨率档位。 |
| `generateAudio` | boolean | 否 | `generate_audio` | 是否生成音频。 |
| `watermark` | boolean | 否 | `watermark` | 水印开关。 |
| `providerOptions` | object | 否 | `provider-specific fields` | 插件命名空间内的厂商扩展字段。 |
| `seed` | integer | 否 | `seed` | providerOptions seed。 |
| `camera_fixed` | boolean | 否 | `camera_fixed` | providerOptions camera_fixed。 |

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/api/v3/contents/generations/tasks"` |
| `create.contentType` | `"application/json"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.content` | `{"$concatArrays":[{"$if":{"condition":{"$ref":"request.prompt"},"then":[{"type":"text","text":{"$ref":"request.prompt"}}],"else":[]}},{"$map":{"from":{"$sortByOrder":{"$ref":"request.images"}},"as":"media","in":{"type":"image_url","image_url":{"url":{"$ref":"media.value"}},"role":{"$coalesce":[{"$ref":"media.role"},"reference_image"]}}}},{"$map":{"from":{"$sortByOrder":{"$ref":"request.videos"}},"as":"media","in":{"type":"video_url","video_url":{"url":{"$ref":"media.value"}},"role":{"$coalesce":[{"$ref":"media.role"},"reference_video"]}}}},{"$map":{"from":{"$sortByOrder":{"$ref":"request.audios"}},"as":"media","in":{"type":"audio_url","audio_url":{"url":{"$ref":"media.value"}},"role":{"$coalesce":[{"$ref":"media.role"},"reference_audio"]}}}}]}` |
| `create.body.ratio` | `{"$coalesce":[{"$ref":"request.aspectRatio"},"16:9"]}` |
| `create.body.resolution` | `{"$if":{"condition":{"$eq":[{"$lower":{"$ref":"request.resolution"}},"2160p"]},"then":"4k","else":{"$coalesce":[{"$ref":"request.resolution"},"720p"]}}}` |
| `create.body.duration` | `{"$coalesce":[{"$ref":"request.duration"},5]}` |
| `create.body.generate_audio` | `{"$coalesce":[{"$ref":"request.generateAudio"},false]}` |
| `create.body.watermark` | `{"$coalesce":[{"$ref":"request.watermark"},false]}` |
| `create.body.seed` | `{"$omitEmpty":{"$ref":"request.providerOptions.volcengine-ark-video.seed"}}` |
| `create.body.camera_fixed` | `{"$omitEmpty":{"$ref":"request.providerOptions.volcengine-ark-video.camera_fixed"}}` |
| `create.body.tools` | `{"$omitEmpty":{"$if":{"condition":{"$eq":[{"$ref":"request.providerOptions.volcengine-ark-video.webSearch"},true]},"then":[{"type":"web_search"}],"else":null}}}` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/api/v3/contents/generations/tasks/{{taskId}}"` |
| `cancel.method` | `"DELETE"` |
| `cancel.path` | `"/api/v3/contents/generations/tasks/{{taskId}}"` |

## Provider 扩展键

- `providerOptions.volcengine-ark-video.camera_fixed`
- `providerOptions.volcengine-ark-video.seed`
- `providerOptions.volcengine-ark-video.webSearch`

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `{"$coalesce":[{"$ref":"response.id"},{"$ref":"response.task_id"},{"$ref":"response.taskId"},{"$ref":"response.data.id"},{"$ref":"taskId"}]}` |
| `response.status` | `{"$coalesce":[{"$ref":"response.status"},{"$ref":"response.state"},{"$ref":"response.data.status"},"pending"]}` |
| `response.message` | `{"$coalesce":[{"$ref":"response.error.message"},{"$ref":"response.message"},{"$ref":"response.fail_reason"}]}` |
| `response.videos` | `{"$coalesce":[{"$ref":"response.content.video_url"},{"$ref":"response.video_url"},{"$ref":"response.output.video_url"},{"$ref":"response.data.video_url"}]}` |
| `response.errorPaths[0]` | `"error.code"` |
| `response.resultEphemeral` | `true` |
| `response.usage` | `{"$ref":"response.usage"}` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

依据 https://docs.volcengine.com/docs/82379/1520757 。Seedance 2.0系列与2.5支持webSearch开关，映射tools:[{type:web_search}]；关闭时不调用搜索工具。usage.tool_usage.web_search是实际搜索次数，0不代表请求失败。原始参考角色和顺序保留。2.5最多30图/10视频/10音频，2.0最多9图/3视频/3音频；具体媒体时长、尺寸、肖像素材和模型规格仍由配置及供应商校验。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "volcengine-ark-seedance",
  "name": "火山方舟 Seedance 官方视频生成",
  "version": "2.0.0",
  "author": "Volcengine / 影策",
  "description": "火山方舟官方 Seedance 视频生成接口，使用普通 /api/v3 Contents Generations Tasks 和方舟推理 API Key；不是 Agent Plan 专用线路。",
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
        "id": "volcengine-ark-video",
        "label": "火山方舟 Seedance 官方视频生成",
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
        "baseUrl": "https://ark.cn-beijing.volces.com",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "视频模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt/content/input",
            "description": "视频提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "first/last/reference image",
            "description": "显式 role 图片输入。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "reference video",
            "description": "参考视频。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "reference audio/voice",
            "description": "参考音频或音色。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration/seconds",
            "description": "时长秒数。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio/aspect_ratio/size",
            "description": "画幅比例或尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率档位。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio",
            "description": "是否生成音频。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "watermark",
            "description": "水印开关。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          },
          {
            "name": "seed",
            "type": "integer",
            "required": false,
            "mapping": "seed",
            "description": "providerOptions seed。"
          },
          {
            "name": "camera_fixed",
            "type": "boolean",
            "required": false,
            "mapping": "camera_fixed",
            "description": "providerOptions camera_fixed。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-video.webSearch"
                    },
                    null
                  ]
                },
                {
                  "$in": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-video.webSearch"
                    },
                    [
                      true,
                      false
                    ]
                  ]
                }
              ]
            },
            "message": "视频联网参数必须是布尔值"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$ref": "request.providerOptions.volcengine-ark-video.webSearch"
                  }
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$at": [
                            {
                              "$split": [
                                {
                                  "$ref": "request.model"
                                },
                                "-"
                              ]
                            },
                            0
                          ]
                        },
                        "doubao"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$at": [
                            {
                              "$split": [
                                {
                                  "$ref": "request.model"
                                },
                                "-"
                              ]
                            },
                            1
                          ]
                        },
                        "seedance"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$at": [
                            {
                              "$split": [
                                {
                                  "$ref": "request.model"
                                },
                                "-"
                              ]
                            },
                            2
                          ]
                        },
                        "2"
                      ]
                    },
                    {
                      "$in": [
                        {
                          "$at": [
                            {
                              "$split": [
                                {
                                  "$ref": "request.model"
                                },
                                "-"
                              ]
                            },
                            3
                          ]
                        },
                        [
                          "0",
                          "5"
                        ]
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "视频联网搜索需要Seedance 2.0系列或2.5模型"
          },
          {
            "assert": {
              "$and": [
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$and": [
                            {
                              "$and": [
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        0
                                      ]
                                    },
                                    "doubao"
                                  ]
                                },
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        1
                                      ]
                                    },
                                    "seedance"
                                  ]
                                },
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        2
                                      ]
                                    },
                                    "2"
                                  ]
                                },
                                {
                                  "$in": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        3
                                      ]
                                    },
                                    [
                                      "0",
                                      "5"
                                    ]
                                  ]
                                }
                              ]
                            },
                            {
                              "$eq": [
                                {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "request.model"
                                        },
                                        "-"
                                      ]
                                    },
                                    3
                                  ]
                                },
                                "5"
                              ]
                            }
                          ]
                        },
                        "then": 30,
                        "else": 9
                      }
                    }
                  ]
                },
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$and": [
                            {
                              "$and": [
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        0
                                      ]
                                    },
                                    "doubao"
                                  ]
                                },
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        1
                                      ]
                                    },
                                    "seedance"
                                  ]
                                },
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        2
                                      ]
                                    },
                                    "2"
                                  ]
                                },
                                {
                                  "$in": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        3
                                      ]
                                    },
                                    [
                                      "0",
                                      "5"
                                    ]
                                  ]
                                }
                              ]
                            },
                            {
                              "$eq": [
                                {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "request.model"
                                        },
                                        "-"
                                      ]
                                    },
                                    3
                                  ]
                                },
                                "5"
                              ]
                            }
                          ]
                        },
                        "then": 10,
                        "else": 3
                      }
                    }
                  ]
                },
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.audios"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$and": [
                            {
                              "$and": [
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        0
                                      ]
                                    },
                                    "doubao"
                                  ]
                                },
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        1
                                      ]
                                    },
                                    "seedance"
                                  ]
                                },
                                {
                                  "$eq": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        2
                                      ]
                                    },
                                    "2"
                                  ]
                                },
                                {
                                  "$in": [
                                    {
                                      "$at": [
                                        {
                                          "$split": [
                                            {
                                              "$ref": "request.model"
                                            },
                                            "-"
                                          ]
                                        },
                                        3
                                      ]
                                    },
                                    [
                                      "0",
                                      "5"
                                    ]
                                  ]
                                }
                              ]
                            },
                            {
                              "$eq": [
                                {
                                  "$at": [
                                    {
                                      "$split": [
                                        {
                                          "$ref": "request.model"
                                        },
                                        "-"
                                      ]
                                    },
                                    3
                                  ]
                                },
                                "5"
                              ]
                            }
                          ]
                        },
                        "then": 10,
                        "else": 3
                      }
                    }
                  ]
                }
              ]
            },
            "message": "参考数量超过当前Seedance版本限制"
          },
          {
            "assert": {
              "$or": [
                {
                  "$and": [
                    {
                      "$and": [
                        {
                          "$eq": [
                            {
                              "$at": [
                                {
                                  "$split": [
                                    {
                                      "$ref": "request.model"
                                    },
                                    "-"
                                  ]
                                },
                                0
                              ]
                            },
                            "doubao"
                          ]
                        },
                        {
                          "$eq": [
                            {
                              "$at": [
                                {
                                  "$split": [
                                    {
                                      "$ref": "request.model"
                                    },
                                    "-"
                                  ]
                                },
                                1
                              ]
                            },
                            "seedance"
                          ]
                        },
                        {
                          "$eq": [
                            {
                              "$at": [
                                {
                                  "$split": [
                                    {
                                      "$ref": "request.model"
                                    },
                                    "-"
                                  ]
                                },
                                2
                              ]
                            },
                            "2"
                          ]
                        },
                        {
                          "$in": [
                            {
                              "$at": [
                                {
                                  "$split": [
                                    {
                                      "$ref": "request.model"
                                    },
                                    "-"
                                  ]
                                },
                                3
                              ]
                            },
                            [
                              "0",
                              "5"
                            ]
                          ]
                        }
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$at": [
                            {
                              "$split": [
                                {
                                  "$ref": "request.model"
                                },
                                "-"
                              ]
                            },
                            3
                          ]
                        },
                        "5"
                      ]
                    }
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
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Seedance 2.0的音频参考需要同时提供图片或视频"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v3/contents/generations/tasks",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "content": {
              "$concatArrays": [
                {
                  "$if": {
                    "condition": {
                      "$ref": "request.prompt"
                    },
                    "then": [
                      {
                        "type": "text",
                        "text": {
                          "$ref": "request.prompt"
                        }
                      }
                    ],
                    "else": []
                  }
                },
                {
                  "$map": {
                    "from": {
                      "$sortByOrder": {
                        "$ref": "request.images"
                      }
                    },
                    "as": "media",
                    "in": {
                      "type": "image_url",
                      "image_url": {
                        "url": {
                          "$ref": "media.value"
                        }
                      },
                      "role": {
                        "$coalesce": [
                          {
                            "$ref": "media.role"
                          },
                          "reference_image"
                        ]
                      }
                    }
                  }
                },
                {
                  "$map": {
                    "from": {
                      "$sortByOrder": {
                        "$ref": "request.videos"
                      }
                    },
                    "as": "media",
                    "in": {
                      "type": "video_url",
                      "video_url": {
                        "url": {
                          "$ref": "media.value"
                        }
                      },
                      "role": {
                        "$coalesce": [
                          {
                            "$ref": "media.role"
                          },
                          "reference_video"
                        ]
                      }
                    }
                  }
                },
                {
                  "$map": {
                    "from": {
                      "$sortByOrder": {
                        "$ref": "request.audios"
                      }
                    },
                    "as": "media",
                    "in": {
                      "type": "audio_url",
                      "audio_url": {
                        "url": {
                          "$ref": "media.value"
                        }
                      },
                      "role": {
                        "$coalesce": [
                          {
                            "$ref": "media.role"
                          },
                          "reference_audio"
                        ]
                      }
                    }
                  }
                }
              ]
            },
            "ratio": {
              "$coalesce": [
                {
                  "$ref": "request.aspectRatio"
                },
                "16:9"
              ]
            },
            "resolution": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$lower": {
                        "$ref": "request.resolution"
                      }
                    },
                    "2160p"
                  ]
                },
                "then": "4k",
                "else": {
                  "$coalesce": [
                    {
                      "$ref": "request.resolution"
                    },
                    "720p"
                  ]
                }
              }
            },
            "duration": {
              "$coalesce": [
                {
                  "$ref": "request.duration"
                },
                5
              ]
            },
            "generate_audio": {
              "$coalesce": [
                {
                  "$ref": "request.generateAudio"
                },
                false
              ]
            },
            "watermark": {
              "$coalesce": [
                {
                  "$ref": "request.watermark"
                },
                false
              ]
            },
            "seed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-video.seed"
              }
            },
            "camera_fixed": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-video.camera_fixed"
              }
            },
            "tools": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-video.webSearch"
                      },
                      true
                    ]
                  },
                  "then": [
                    {
                      "type": "web_search"
                    }
                  ],
                  "else": null
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v3/contents/generations/tasks/{{taskId}}"
        },
        "cancel": {
          "method": "DELETE",
          "path": "/api/v3/contents/generations/tasks/{{taskId}}"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.taskId"
              },
              {
                "$ref": "response.data.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.status"
              },
              {
                "$ref": "response.state"
              },
              {
                "$ref": "response.data.status"
              },
              "pending"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.fail_reason"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.content.video_url"
              },
              {
                "$ref": "response.video_url"
              },
              {
                "$ref": "response.output.video_url"
              },
              {
                "$ref": "response.data.video_url"
              }
            ]
          },
          "errorPaths": [
            "error.code"
          ],
          "resultEphemeral": true,
          "usage": {
            "$ref": "response.usage"
          }
        },
        "videoReferences": {
          "layout": "content",
          "token": "参考图{n}"
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
