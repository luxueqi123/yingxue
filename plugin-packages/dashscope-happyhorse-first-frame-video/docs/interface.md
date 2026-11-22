# 接口合同

- Provider：`dashscope-happyhorse-first-frame-video`；模型：`happyhorse-1.0-i2v`或`happyhorse-1.1-i2v`；操作：`image_to_video`。
- 创建：`POST /api/v1/services/aigc/video-generation/video-synthesis`，Bearer与`X-DashScope-Async: enable`。查询：`GET /api/v1/tasks/{task_id}`，建议15秒查询，不隐式重提收费任务。未声明取消入口。
- 恰好一个`first_frame`，`input.media`使用该角色与宿主准备的`media.value`，不把r2v参考图或尾帧猜成首帧。拒绝音频、视频及多图。
- JPEG/JPG/PNG/WEBP，宽高至少300像素，宽高比0.4至2.5，单图最多20000000字节。宿主读取实际字节与尺寸头，检查后提交同一原字节Base64；不信任自报元数据，不改图。URL读取沿用现有出站安全与大小限制。尺寸头检查不等于完整图片解码。
- `request.output`优先，兼容顶层时长、档位；默认1080P和5秒，480P/720P/1080P、整数3至15秒；每次一个视频。视频比例来自输入图片，没有ratio/aspect_ratio字段；只允许auto/adaptive要求，固定输出画幅拒绝，不能静默忽略。
- prompt可选，原文保留；含Han的总长度最多2500，否则最多5000个Unicode字符，按保守规则拒绝超长而不截断。厂商专属prompt和seed只读本Provider命名空间；不支持独立generate_audio或quality请求。
- seed可选，整数0至2147483647；省略/null不补值，0与上界保持。统一watermark由宿主输出字段决定；厂商默认true，宿主可能显式提供false。
- PENDING/RUNNING继续等待，SUCCEEDED必须有`output.video_url`；FAILED/CANCELED/UNKNOWN终止。缺task_id、成功无视频、非JSON和下载失败保持失败。结果短期有效，由现有宿主按用户归属下载归档。
- 原站1.1首帧schema仅有resolution/duration，源请求过滤其他模态的ratio；输入图片决定比例。1.0和1.1同模式均按精确模型ID提交，不升级替代，不声明原私有服务等价。LTV正文和单图绑定原样保留，不借用多参考的编号标记转换。
- 真实上游生成、媒体结果、权利、完整视听、完整案例及生产仍待验。不得以本地测试或安装增加完整案例计数。

## 配置与响应映射

`apiKey`从渠道secret配置读取，Manifest不包含真实凭据。统一model/images/duration/resolution/output及本Provider扩展构造请求；响应读取output.task_id/task_status/video_url/code/message和usage。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "dashscope-happyhorse-first-frame-video",
  "name": "DashScope HappyHorse 1.0 / 1.1 First Frame Video",
  "version": "1.0.1",
  "author": "Yingxue",
  "description": "HappyHorse 1.0 / 1.1 单图首帧生视频声明式协议。",
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
        "id": "dashscope-happyhorse-first-frame-video",
        "label": "DashScope HappyHorse 1.0 / 1.1 First Frame Video",
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
          "minShortSide": 300,
          "minAspectRatio": 0.4,
          "maxAspectRatio": 2.5
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
              "happyhorse-1.0-i2v",
              "happyhorse-1.1-i2v"
            ],
            "description": "官方同模式1.0或1.1精确模型ID；保留请求版本，不自动升级或替代。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "input.prompt",
            "description": "可选原始正文；不自动截断或改写。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "input.media",
            "description": "恰好一个first_frame，使用宿主检查后的同一原字节。"
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
            "mapping": "dashscope-happyhorse-first-frame-video",
            "description": "本Provider命名空间的原始prompt及可选seed。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.seed"
                    },
                    null
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.seed"
                        },
                        0
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.seed"
                        },
                        2147483647
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.seed"
                        },
                        {
                          "$toInt": {
                            "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.seed"
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "seed必须为0至2147483647的整数，不能改写提交"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "happyhorse-1.0-i2v",
                  "happyhorse-1.1-i2v"
                ]
              ]
            },
            "message": "仅支持happyhorse-1.0-i2v、happyhorse-1.1-i2v，不替换版本或模式"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.operation"
                },
                "image_to_video"
              ]
            },
            "message": "首帧接口仅支持image_to_video"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.images"
                  }
                },
                1
              ]
            },
            "message": "首帧接口必须恰好一张图片"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.images.0.role"
                },
                "first_frame"
              ]
            },
            "message": "必须明确指定first_frame角色，不推测参考图角色"
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
            "message": "首帧接口不接收视频或音频"
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
                },
                {
                  "$eq": [
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
                    {
                      "$toInt": {
                        "$coalesce": [
                          {
                            "$ref": "request.output.duration"
                          },
                          {
                            "$ref": "request.duration"
                          },
                          5
                        ]
                      }
                    }
                  ]
                }
              ]
            },
            "message": "时长必须为3至15秒整数"
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
            "message": "仅支持480P/720P/1080P"
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
                    "adaptive"
                  ]
                },
                [
                  "auto",
                  "adaptive"
                ]
              ]
            },
            "message": "首帧输出比例来自输入图片，不能忽略指定的固定画幅"
          },
          {
            "assert": {
              "$eq": [
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
            "message": "每次只能生成一个视频"
          },
          {
            "assert": {
              "$not": {
                "$ref": "request.output.generateAudio"
              }
            },
            "message": "接口没有独立generate_audio开关，不能忽略有效要求"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$if": {
                      "condition": {
                        "$ne": [
                          {
                            "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.prompt"
                          },
                          null
                        ]
                      },
                      "then": {
                        "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.prompt"
                      },
                      "else": {
                        "$ref": "request.prompt"
                      }
                    }
                  }
                },
                {
                  "$if": {
                    "condition": {
                      "$hasHan": {
                        "$if": {
                          "condition": {
                            "$ne": [
                              {
                                "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.prompt"
                              },
                              null
                            ]
                          },
                          "then": {
                            "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.prompt"
                          },
                          "else": {
                            "$ref": "request.prompt"
                          }
                        }
                      }
                    },
                    "then": 2500,
                    "else": 5000
                  }
                }
              ]
            },
            "message": "正文超过官方字符限制，不能截断原文提交"
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
                "$omitEmpty": {
                  "$if": {
                    "condition": {
                      "$ne": [
                        {
                          "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.prompt"
                        },
                        null
                      ]
                    },
                    "then": {
                      "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.prompt"
                    },
                    "else": {
                      "$ref": "request.prompt"
                    }
                  }
                }
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
                    "type": {
                      "$ref": "media.role"
                    },
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
                  "$ref": "request.providerOptions.dashscope-happyhorse-first-frame-video.seed"
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
