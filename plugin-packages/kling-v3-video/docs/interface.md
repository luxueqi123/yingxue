# Kling 3.0 Video 接口字段

## 协议身份

- 插件 ID：`kling-v3-video`。
- Provider ID：`kling-v3-video`。
- 能力：`video`。
- 默认 Base URL：`https://api-beijing.klingai.com`。
- 鉴权驱动：`bearer`。
- 创建：`POST /v1/videos/text2video`。
- 查询：`GET /v1/videos/text2video/{{taskId}}`。

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

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/v1/videos/text2video"` |
| `create.contentType` | `"application/json"` |
| `create.body.model_name` | `{"$ref":"request.model"}` |
| `create.body.prompt` | `{"$ref":"request.prompt"}` |
| `create.body.mode` | `{"$ref":"request.providerOptions.kling-v3-video.mode"}` |
| `create.body.duration` | `{"$omitEmpty":{"$if":{"condition":{"$and":[{"$gt":[{"$len":{"$ref":"request.videos"}},0]},{"$eq":[{"$ref":"request.providerOptions.kling-v3-video.videoReferenceType"},"base"]}]},"then":null,"else":{"$toString":{"$ref":"request.duration"}}}}}` |
| `create.body.aspect_ratio` | `{"$omitEmpty":{"$if":{"condition":{"$in":[{"$ref":"request.aspectRatio"},["16:9","9:16","1:1"]]},"then":{"$ref":"request.aspectRatio"},"else":null}}}` |
| `create.body.sound` | `{"$if":{"condition":{"$ref":"request.generateAudio"},"then":"on","else":"off"}}` |
| `create.body.multi_shot` | `{"$coalesce":[{"$ref":"request.providerOptions.kling-v3-video.multiShot"},false]}` |
| `create.body.shot_type` | `{"$omitEmpty":{"$if":{"condition":{"$ref":"request.providerOptions.kling-v3-video.multiShot"},"then":{"$if":{"condition":{"$gt":[{"$len":{"$ref":"request.providerOptions.kling-v3-video.multiPrompt"}},0]},"then":"customize","else":"intelligence"}},"else":null}}}` |
| `create.body.multi_prompt` | `{"$omitEmpty":{"$map":{"from":{"$ref":"request.providerOptions.kling-v3-video.multiPrompt"},"as":"shot","in":{"index":{"$ref":"shot.index"},"prompt":{"$ref":"shot.prompt"},"duration":{"$toString":{"$ref":"shot.duration"}}}}}}` |
| `create.body.image` | `{"$omitEmpty":{"$first":{"$map":{"from":{"$filter":{"from":{"$sortByOrder":{"$ref":"request.images"}},"as":"media","where":{"$in":[{"$ref":"media.role"},["first_frame"]]}}},"as":"media","in":{"$ref":"media.value"}}}}}` |
| `create.body.image_tail` | `{"$omitEmpty":{"$first":{"$map":{"from":{"$filter":{"from":{"$sortByOrder":{"$ref":"request.images"}},"as":"media","where":{"$in":[{"$ref":"media.role"},["last_frame"]]}}},"as":"media","in":{"$ref":"media.value"}}}}}` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/v1/videos/text2video/{{taskId}}"` |
| `poll.contentType` | `"application/json"` |

## Provider 扩展键

- `providerOptions.kling-v3-video.mode`
- `providerOptions.kling-v3-video.multiPrompt`
- `providerOptions.kling-v3-video.multiShot`
- `providerOptions.kling-v3-video.videoReferenceType`

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `{"$coalesce":[{"$ref":"response.data.task_id"},{"$ref":"taskId"}]}` |
| `response.status` | `{"$if":{"condition":{"$eq":[{"$ref":"response.data.task_status"},"succeed"]},"then":"succeeded","else":{"$ref":"response.data.task_status"}}}` |
| `response.message` | `{"$coalesce":[{"$ref":"response.data.task_status_msg"},{"$ref":"response.message"}]}` |
| `response.videos` | `{"$map":{"from":{"$ref":"response.data.task_result.videos"},"as":"video","in":{"$ref":"video.url"}}}` |
| `response.errorPaths[0]` | `"code"` |
| `response.resultEphemeral` | `true` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

官方合同 https://klingai.com/document-api/api/video/3-0-omni/text-to-video/legacy 与 image-to-video/legacy 。普通3.0使用model_name:kling-v3；文生text2video，图生image2video；首帧image、尾帧image_tail。与Omni区分，不将参考图片拼成首帧，不忽略主体、音色或自定义分镜。API Key Bearer适用于所有模型，鉴权依据/document-api/api/get-started/authentication。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "kling-v3-video",
  "name": "Kling 3.0 Video",
  "version": "2.1.0",
  "author": "Kuaishou / 影策",
  "description": "Kling 3.0 Video 独立请求协议插件。",
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
        "id": "kling-v3-video",
        "label": "Kling 3.0 Video",
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
        "baseUrl": "https://api-beijing.klingai.com",
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
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "kling-v3"
              ]
            },
            "message": "此协议要求普通Kling 3.0模型，不接受Omni或源平台别名"
          },
          {
            "assert": {
              "$and": [
                {
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
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.prompt"
                      }
                    },
                    2500
                  ]
                }
              ]
            },
            "message": "Omni提示词必须完整且不超过2500字符"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.kling-v3-video.mode"
                },
                [
                  "std",
                  "pro",
                  "4k"
                ]
              ]
            },
            "message": "必须明确选择标准、高品质或4K模式"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.resolution"
                    },
                    ""
                  ]
                },
                {
                  "$eq": [
                    {
                      "$lower": {
                        "$ref": "request.resolution"
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$ref": "request.providerOptions.kling-v3-video.mode"
                            },
                            "std"
                          ]
                        },
                        "then": "720p",
                        "else": {
                          "$if": {
                            "condition": {
                              "$eq": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.mode"
                                },
                                "pro"
                              ]
                            },
                            "then": "1080p",
                            "else": "4k"
                          }
                        }
                      }
                    }
                  ]
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.kling-v3-video.mode"
                        },
                        "4k"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$lower": {
                            "$ref": "request.resolution"
                          }
                        },
                        "2160p"
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "独立分辨率不能与质量模式冲突"
          },
          {
            "assert": {
              "$and": [
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
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.videos"
                      }
                    },
                    1
                  ]
                },
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
                          "$gt": [
                            {
                              "$len": {
                                "$ref": "request.videos"
                              }
                            },
                            0
                          ]
                        },
                        "then": 4,
                        "else": 7
                      }
                    }
                  ]
                }
              ]
            },
            "message": "Omni支持最多7图，有视频时最多4图1视频；独立音频需其它合同"
          },
          {
            "assert": {
              "$and": [
                {
                  "$lte": [
                    {
                      "$len": {
                        "$filter": {
                          "from": {
                            "$sortByOrder": {
                              "$ref": "request.images"
                            }
                          },
                          "as": "media",
                          "where": {
                            "$in": [
                              {
                                "$ref": "media.role"
                              },
                              [
                                "first_frame"
                              ]
                            ]
                          }
                        }
                      }
                    },
                    1
                  ]
                },
                {
                  "$lte": [
                    {
                      "$len": {
                        "$filter": {
                          "from": {
                            "$sortByOrder": {
                              "$ref": "request.images"
                            }
                          },
                          "as": "media",
                          "where": {
                            "$in": [
                              {
                                "$ref": "media.role"
                              },
                              [
                                "last_frame"
                              ]
                            ]
                          }
                        }
                      }
                    },
                    1
                  ]
                },
                {
                  "$or": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$in": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  [
                                    "last_frame"
                                  ]
                                ]
                              }
                            }
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$in": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  [
                                    "first_frame"
                                  ]
                                ]
                              }
                            }
                          }
                        },
                        1
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "首尾帧不可重复，尾帧必须同时提供首帧"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "where": {
                        "$not": {
                          "$in": [
                            {
                              "$ref": "media.role"
                            },
                            [
                              "",
                              "reference_image",
                              "first_frame",
                              "last_frame"
                            ]
                          ]
                        }
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "图片包含未适配的参考角色"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.kling-v3-video.multiShot"
                    },
                    null
                  ]
                },
                {
                  "$in": [
                    {
                      "$ref": "request.providerOptions.kling-v3-video.multiShot"
                    },
                    [
                      true,
                      false
                    ]
                  ]
                }
              ]
            },
            "message": "智能分镜必须是布尔值"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.kling-v3-video.elements"
                  }
                },
                0
              ]
            },
            "message": "主体ID需要独立的主体注册适配"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                    },
                    {
                      "$map": {
                        "from": {
                          "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                        },
                        "as": "shot",
                        "in": {
                          "index": {
                            "$ref": "shot.index"
                          },
                          "prompt": {
                            "$ref": "shot.prompt"
                          },
                          "duration": {
                            "$ref": "shot.duration"
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            },
            "message": "自定义分镜必须是仅含index、prompt、duration的数组"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                  }
                },
                6
              ]
            },
            "message": "自定义分镜最多6个镜头"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$filter": {
                      "from": {
                        "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                      },
                      "as": "shot",
                      "where": {
                        "$not": {
                          "$and": [
                            {
                              "$eq": [
                                {
                                  "$ref": "shot.index"
                                },
                                {
                                  "$add": [
                                    {
                                      "$ref": "shotIndex"
                                    },
                                    1
                                  ]
                                }
                              ]
                            },
                            {
                              "$eq": [
                                {
                                  "$ref": "shot.prompt"
                                },
                                {
                                  "$toString": {
                                    "$ref": "shot.prompt"
                                  }
                                }
                              ]
                            },
                            {
                              "$gt": [
                                {
                                  "$len": {
                                    "$trim": {
                                      "$ref": "shot.prompt"
                                    }
                                  }
                                },
                                0
                              ]
                            },
                            {
                              "$lte": [
                                {
                                  "$len": {
                                    "$ref": "shot.prompt"
                                  }
                                },
                                2500
                              ]
                            },
                            {
                              "$in": [
                                {
                                  "$ref": "shot.duration"
                                },
                                [
                                  1,
                                  "1",
                                  2,
                                  "2",
                                  3,
                                  "3",
                                  4,
                                  "4",
                                  5,
                                  "5",
                                  6,
                                  "6",
                                  7,
                                  "7",
                                  8,
                                  "8",
                                  9,
                                  "9",
                                  10,
                                  "10",
                                  11,
                                  "11",
                                  12,
                                  "12",
                                  13,
                                  "13",
                                  14,
                                  "14",
                                  15,
                                  "15"
                                ]
                              ]
                            }
                          ]
                        }
                      }
                    }
                  }
                },
                0
              ]
            },
            "message": "分镜须连续编号，正文1至2500字符，每个镜头1至15秒整数"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$gt": [
                      {
                        "$len": {
                          "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                        }
                      },
                      0
                    ]
                  }
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.kling-v3-video.multiShot"
                        },
                        true
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$add": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.multiPrompt.0.duration"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.multiPrompt.1.duration"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.multiPrompt.2.duration"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.multiPrompt.3.duration"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.multiPrompt.4.duration"
                                },
                                0
                              ]
                            },
                            {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.kling-v3-video.multiPrompt.5.duration"
                                },
                                0
                              ]
                            }
                          ]
                        },
                        {
                          "$ref": "request.duration"
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "自定义分镜须开启多镜头，分镜时长之和须等于视频总时长"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$gt": [
                      {
                        "$len": {
                          "$ref": "request.videos"
                        }
                      },
                      0
                    ]
                  }
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "request.generateAudio"
                        },
                        false
                      ]
                    },
                    {
                      "$in": [
                        {
                          "$ref": "request.providerOptions.kling-v3-video.videoReferenceType"
                        },
                        [
                          "feature",
                          "base"
                        ]
                      ]
                    },
                    {
                      "$in": [
                        {
                          "$ref": "request.providerOptions.kling-v3-video.keepOriginalSound"
                        },
                        [
                          "yes",
                          "no"
                        ]
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "视频参考需关闭生成声音并明确参考用途与原声设置"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$and": [
                      {
                        "$gt": [
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
                            "$ref": "request.providerOptions.kling-v3-video.videoReferenceType"
                          },
                          "base"
                        ]
                      }
                    ]
                  }
                },
                {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$in": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  [
                                    "first_frame"
                                  ]
                                ]
                              }
                            }
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$sortByOrder": {
                                  "$ref": "request.images"
                                }
                              },
                              "as": "media",
                              "where": {
                                "$in": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  [
                                    "last_frame"
                                  ]
                                ]
                              }
                            }
                          }
                        },
                        0
                      ]
                    },
                    {
                      "$not": {
                        "$ref": "request.providerOptions.kling-v3-video.multiShot"
                      }
                    }
                  ]
                }
              ]
            },
            "message": "视频编辑不能同时使用首尾帧或多镜头"
          },
          {
            "assert": {
              "$or": [
                {
                  "$and": [
                    {
                      "$gt": [
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
                          "$ref": "request.providerOptions.kling-v3-video.videoReferenceType"
                        },
                        "base"
                      ]
                    }
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.duration"
                        },
                        3
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.duration"
                        },
                        15
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "视频生成时长必须在3至15秒，视频编辑按原视频时长"
          },
          {
            "assert": {
              "$or": [
                {
                  "$gt": [
                    {
                      "$len": {
                        "$filter": {
                          "from": {
                            "$sortByOrder": {
                              "$ref": "request.images"
                            }
                          },
                          "as": "media",
                          "where": {
                            "$in": [
                              {
                                "$ref": "media.role"
                              },
                              [
                                "first_frame"
                              ]
                            ]
                          }
                        }
                      }
                    },
                    0
                  ]
                },
                {
                  "$and": [
                    {
                      "$gt": [
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
                          "$ref": "request.providerOptions.kling-v3-video.videoReferenceType"
                        },
                        "base"
                      ]
                    }
                  ]
                },
                {
                  "$in": [
                    {
                      "$ref": "request.aspectRatio"
                    },
                    [
                      "16:9",
                      "9:16",
                      "1:1"
                    ]
                  ]
                }
              ]
            },
            "message": "未提供首帧或待编辑视频时必须指定支持的画幅"
          },
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
                    0
                  ]
                },
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    2
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$filter": {
                          "from": {
                            "$ref": "request.images"
                          },
                          "as": "media",
                          "where": {
                            "$not": {
                              "$in": [
                                {
                                  "$ref": "media.role"
                                },
                                [
                                  "first_frame",
                                  "last_frame"
                                ]
                              ]
                            }
                          }
                        }
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "普通3.0只支持首尾帧输入，此入口不承接多图参考或视频编辑"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.kling-v3-video.voices"
                  }
                },
                0
              ]
            },
            "message": "音色ID必须完成对应音色适配，不能静默忽略"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/videos/text2video",
          "contentType": "application/json",
          "body": {
            "model_name": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "mode": {
              "$ref": "request.providerOptions.kling-v3-video.mode"
            },
            "duration": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$and": [
                      {
                        "$gt": [
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
                            "$ref": "request.providerOptions.kling-v3-video.videoReferenceType"
                          },
                          "base"
                        ]
                      }
                    ]
                  },
                  "then": null,
                  "else": {
                    "$toString": {
                      "$ref": "request.duration"
                    }
                  }
                }
              }
            },
            "aspect_ratio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$ref": "request.aspectRatio"
                      },
                      [
                        "16:9",
                        "9:16",
                        "1:1"
                      ]
                    ]
                  },
                  "then": {
                    "$ref": "request.aspectRatio"
                  },
                  "else": null
                }
              }
            },
            "sound": {
              "$if": {
                "condition": {
                  "$ref": "request.generateAudio"
                },
                "then": "on",
                "else": "off"
              }
            },
            "multi_shot": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.kling-v3-video.multiShot"
                },
                false
              ]
            },
            "shot_type": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$ref": "request.providerOptions.kling-v3-video.multiShot"
                  },
                  "then": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$len": {
                              "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                            }
                          },
                          0
                        ]
                      },
                      "then": "customize",
                      "else": "intelligence"
                    }
                  },
                  "else": null
                }
              }
            },
            "multi_prompt": {
              "$omitEmpty": {
                "$map": {
                  "from": {
                    "$ref": "request.providerOptions.kling-v3-video.multiPrompt"
                  },
                  "as": "shot",
                  "in": {
                    "index": {
                      "$ref": "shot.index"
                    },
                    "prompt": {
                      "$ref": "shot.prompt"
                    },
                    "duration": {
                      "$toString": {
                        "$ref": "shot.duration"
                      }
                    }
                  }
                }
              }
            },
            "image": {
              "$omitEmpty": {
                "$first": {
                  "$map": {
                    "from": {
                      "$filter": {
                        "from": {
                          "$sortByOrder": {
                            "$ref": "request.images"
                          }
                        },
                        "as": "media",
                        "where": {
                          "$in": [
                            {
                              "$ref": "media.role"
                            },
                            [
                              "first_frame"
                            ]
                          ]
                        }
                      }
                    },
                    "as": "media",
                    "in": {
                      "$ref": "media.value"
                    }
                  }
                }
              }
            },
            "image_tail": {
              "$omitEmpty": {
                "$first": {
                  "$map": {
                    "from": {
                      "$filter": {
                        "from": {
                          "$sortByOrder": {
                            "$ref": "request.images"
                          }
                        },
                        "as": "media",
                        "where": {
                          "$in": [
                            {
                              "$ref": "media.role"
                            },
                            [
                              "last_frame"
                            ]
                          ]
                        }
                      }
                    },
                    "as": "media",
                    "in": {
                      "$ref": "media.value"
                    }
                  }
                }
              }
            }
          },
          "pathTemplate": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$len": {
                      "$ref": "request.images"
                    }
                  },
                  0
                ]
              },
              "then": "/v1/videos/image2video",
              "else": "/v1/videos/text2video"
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/videos/text2video/{{taskId}}",
          "pathTemplate": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$len": {
                      "$ref": "request.images"
                    }
                  },
                  0
                ]
              },
              "then": "/v1/videos/image2video/{{taskId}}",
              "else": "/v1/videos/text2video/{{taskId}}"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.data.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$eq": [
                  {
                    "$ref": "response.data.task_status"
                  },
                  "succeed"
                ]
              },
              "then": "succeeded",
              "else": {
                "$ref": "response.data.task_status"
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.data.task_status_msg"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$map": {
              "from": {
                "$ref": "response.data.task_result.videos"
              },
              "as": "video",
              "in": {
                "$ref": "video.url"
              }
            }
          },
          "errorPaths": [
            "code"
          ],
          "resultEphemeral": true
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
