# 接口合同

- Provider：`dashscope-happyhorse-reference-video`；模型：`happyhorse-1.0-r2v`或`happyhorse-1.1-r2v`；操作：`reference_to_video`。
- 创建：`POST /api/v1/services/aigc/video-generation/video-synthesis`，Bearer 鉴权与 `X-DashScope-Async: enable`。
- 优先读取 `request.output`，兼容顶层 duration/aspectRatio/resolution。时长整数 3–15 秒；档位 480P/720P/1080P；画幅 16:9、9:16、1:1、4:3、3:4、4:5、5:4、9:21、21:9。
- 输入 1–9 张 reference_image（subject/style reference 统一映射为参考图），按 order 排序；首尾帧、音频和视频不属于此接口。`media.value` 是宿主准备的媒体值；官方支持公网 HTTP(S) 或 Base64 图片，不要求插件取得本地文件。
- 图片须 JPEG/JPG/PNG/WEBP、短边至少 400 像素、每图不超过 20 MB。本包用受控`inputImages`声明允许格式、20000000字节上限及400像素最小短边；宿主在创建前读取实际字节和尺寸头，拒绝伪造MIME、坏数据、尺寸／大小不符，然后按原顺序提交同一字节的Base64，不缩放、重编码或改图。URL读取沿用出站安全规则及收紧的响应大小上限；尺寸头校验不代表完整图片解码或案例验收。
- 原生正文使用 `[Image N]` 对应有序参考图。LTV 导入正文在正常生成和重试路径从 `@图片N` 转换到此格式，不更换图片、不缩短正文；转换原文位于本 Provider 的命名空间 prompt。
- 正文最多 5000 非中文字符或 2500 中文字符；源导入和直接 Provider 调用均按含汉字正文总长2500的保守规则检查，否则最多5000个Unicode字符。以实际提交的本Provider命名空间正文为准；合法原文逐字保留，超长拒绝，避免上游自动截断。
- 1.0.3包需要支持受控`$hasHan`表达式及`inputImages`声明的更新宿主；表达式只检测Unicode Han字符，图片读取由宿主控制。旧宿主可能忽略新增声明而不检查实际图片，因此必须核对更新版本及运行证据，不能把上传成功当作门禁生效。
- 不提供 generate_audio 或独立 quality 开关；仅接受上述1.0和1.1精确模型ID，不接受其他业务操作。宿主共用配置里的图片 quality 不参与此视频请求，不应导致视频提交失败；导入器仍拒绝源节点中没有落点的有效质量要求。watermark 读取统一输出字段；未指定时由宿主的布尔输出语义决定。seed 使用本 Provider 命名空间。
- 查询：`GET /api/v1/tasks/{task_id}`；PENDING/RUNNING 继续等待，SUCCEEDED 需 output.video_url；FAILED/CANCELED/UNKNOWN 终止。缺 task_id 或成功缺视频均失败，不生成假 URL。
- 推荐每 15 秒查询；任务与结果 URL 有效 24 小时，结果标记 ephemeral，由现有宿主资源保存路径归档。插件不隐式重提收费任务。
- 真实生成、短期结果下载、权利、完整视听和生产尚未通过，本地验证不能替代这些验收。

可选`seed`须为0至2147483647的整数；省略或null不补造值，0及上界保持原值。负数、越界、小数、字符串和布尔值在声明式请求构建前拒绝，不自动取整或钳位。

## 配置与响应映射

`apiKey` 从既有渠道的秘密字段读取，插件不保存凭据。统一输入字段 `model`、`prompt`、`images`、`duration`、`aspectRatio`、`resolution`、`watermark` 与 `providerOptions` 的映射见以下完整合同。

响应读取 `output.task_id`、`output.task_status`、`output.video_url`、`output.code`、`output.message` 及 `usage`；CANCELED 保留取消终态，UNKNOWN 和成功缺媒体均失败。

## Manifest 完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "dashscope-happyhorse-reference-video",
  "name": "DashScope HappyHorse 1.0 / 1.1 Reference Video",
  "version": "1.0.3",
  "author": "Yingxue",
  "description": "HappyHorse 1.0 / 1.1 多图参考生视频声明式协议。",
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
        "id": "dashscope-happyhorse-reference-video",
        "label": "DashScope HappyHorse 1.0 / 1.1 Reference Video",
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
        "baseUrl": "https://dashscope.aliyuncs.com",
        "inputImages": {
          "formats": [
            "jpeg",
            "png",
            "webp"
          ],
          "maxBytes": 20000000,
          "minShortSide": 400
        },
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
            "values": [
              "happyhorse-1.0-r2v",
              "happyhorse-1.1-r2v"
            ],
            "description": "官方同模式1.0或1.1精确模型ID；保留请求版本，不自动升级或替代。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input.prompt",
            "description": "完整视频正文，不自动截断。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "input.media",
            "description": "1 到 9 张有序参考图。"
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "parameters.duration",
            "values": [
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "10",
              "11",
              "12",
              "13",
              "14",
              "15"
            ],
            "description": "整数秒数，3 到 15 秒。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "mapping": "parameters.ratio",
            "values": [
              "16:9",
              "9:16",
              "1:1",
              "4:3",
              "3:4",
              "4:5",
              "5:4",
              "9:21",
              "21:9"
            ],
            "description": "官方枚举画幅比例。"
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "parameters.resolution",
            "values": [
              "480P",
              "720P",
              "1080P"
            ],
            "description": "480P、720P 或 1080P。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "mapping": "parameters.watermark",
            "description": "统一水印开关。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "dashscope-happyhorse-reference-video",
            "description": "本协议命名空间中的 prompt（仅表示引用标记转换后的原文）及 seed。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.seed"
                    },
                    null
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.seed"
                        },
                        0
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.seed"
                        },
                        2147483647
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.seed"
                        },
                        {
                          "$toInt": {
                            "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.seed"
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "seed 必须是 0 至 2147483647 的整数，不能改写后提交"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "happyhorse-1.0-r2v",
                  "happyhorse-1.1-r2v"
                ]
              ]
            },
            "message": "仅支持happyhorse-1.0-r2v、happyhorse-1.1-r2v，不替换版本或模式"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.operation"
                },
                "reference_to_video"
              ]
            },
            "message": "HappyHorse 参考接口仅支持 reference_to_video"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$len": {
                        "$ref": "request.images"
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
                    9
                  ]
                }
              ]
            },
            "message": "参考图数量必须为 1 到 9"
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
                        "$in": [
                          {
                            "$coalesce": [
                              {
                                "$ref": "media.role"
                              },
                              "reference_image"
                            ]
                          },
                          [
                            "reference_image",
                            "subject_reference",
                            "style_reference"
                          ]
                        ]
                      }
                    }
                  }
                },
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                }
              ]
            },
            "message": "参考接口不能混入首帧、尾帧或其他媒体角色"
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
            "message": "参考接口不接收视频或音频输入"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.output.duration"
                        },
                        {
                          "$ref": "request.duration"
                        },
                        5
                      ]
                    },
                    3
                  ]
                },
                {
                  "$lte": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.output.duration"
                        },
                        {
                          "$ref": "request.duration"
                        },
                        5
                      ]
                    },
                    15
                  ]
                }
              ]
            },
            "message": "视频时长必须为 3 到 15 秒的整数"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.output.resolution"
                    },
                    {
                      "$ref": "request.resolution"
                    },
                    "1080P"
                  ]
                },
                [
                  "480P",
                  "720P",
                  "1080P"
                ]
              ]
            },
            "message": "清晰度必须为 480P、720P 或 1080P"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.output.aspectRatio"
                    },
                    {
                      "$ref": "request.aspectRatio"
                    },
                    "16:9"
                  ]
                },
                [
                  "16:9",
                  "9:16",
                  "1:1",
                  "4:3",
                  "3:4",
                  "4:5",
                  "5:4",
                  "9:21",
                  "21:9"
                ]
              ]
            },
            "message": "不支持该视频画幅"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.output.count"
                    },
                    1
                  ]
                },
                1
              ]
            },
            "message": "每次仅生成一个视频"
          },
          {
            "assert": {
              "$not": {
                "$ref": "request.output.generateAudio"
              }
            },
            "message": "官方接口没有可选择的 generate_audio 参数，不能忽略声音开关"
          },
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.prompt"
                      },
                      {
                        "$ref": "request.prompt"
                      }
                    ]
                  }
                },
                0
              ]
            },
            "message": "参考生视频需要完整正文"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.prompt"
                      },
                      {
                        "$ref": "request.prompt"
                      }
                    ]
                  }
                },
                {
                  "$if": {
                    "condition": {
                      "$hasHan": {
                        "$coalesce": [
                          {
                            "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.prompt"
                          },
                          {
                            "$ref": "request.prompt"
                          }
                        ]
                      }
                    },
                    "then": 2500,
                    "else": 5000
                  }
                }
              ]
            },
            "message": "HappyHorse正文超过官方字符限制：含汉字总长最多2500，否则最多5000；不能截断原文提交"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v1/services/aigc/video-generation/video-synthesis",
          "originPath": true,
          "contentType": "application/json",
          "headers": {
            "X-DashScope-Async": "enable"
          },
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "input": {
              "prompt": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.prompt"
                  },
                  {
                    "$ref": "request.prompt"
                  }
                ]
              },
              "media": {
                "$map": {
                  "from": {
                    "$sortByOrder": {
                      "$ref": "request.images"
                    }
                  },
                  "as": "media",
                  "in": {
                    "type": "reference_image",
                    "url": {
                      "$ref": "media.value"
                    }
                  }
                }
              }
            },
            "parameters": {
              "resolution": {
                "$coalesce": [
                  {
                    "$ref": "request.output.resolution"
                  },
                  {
                    "$ref": "request.resolution"
                  },
                  "1080P"
                ]
              },
              "ratio": {
                "$coalesce": [
                  {
                    "$ref": "request.output.aspectRatio"
                  },
                  {
                    "$ref": "request.aspectRatio"
                  },
                  "16:9"
                ]
              },
              "duration": {
                "$coalesce": [
                  {
                    "$ref": "request.output.duration"
                  },
                  {
                    "$ref": "request.duration"
                  },
                  5
                ]
              },
              "watermark": {
                "$coalesce": [
                  {
                    "$ref": "request.output.watermark"
                  },
                  {
                    "$ref": "request.watermark"
                  },
                  true
                ]
              },
              "seed": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.dashscope-happyhorse-reference-video.seed"
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v1/tasks/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.output.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$or": [
                  {
                    "$in": [
                      {
                        "$lower": {
                          "$ref": "response.output.task_status"
                        }
                      },
                      [
                        "failed",
                        "unknown"
                      ]
                    ]
                  },
                  {
                    "$and": [
                      {
                        "$eq": [
                          {
                            "$lower": {
                              "$ref": "response.output.task_status"
                            }
                          },
                          "succeeded"
                        ]
                      },
                      {
                        "$not": {
                          "$ref": "response.output.video_url"
                        }
                      }
                    ]
                  },
                  {
                    "$and": [
                      {
                        "$not": {
                          "$ref": "response.output.task_id"
                        }
                      },
                      {
                        "$not": {
                          "$ref": "taskId"
                        }
                      }
                    ]
                  }
                ]
              },
              "then": "failed",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.output.task_status"
                  },
                  "pending"
                ]
              }
            }
          },
          "messagePaths": [
            "output.message",
            "message"
          ],
          "errorPaths": [
            "output.code",
            "code"
          ],
          "videos": {
            "$ref": "response.output.video_url"
          },
          "resultEphemeral": true,
          "usage": {
            "$ref": "response.usage"
          }
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
