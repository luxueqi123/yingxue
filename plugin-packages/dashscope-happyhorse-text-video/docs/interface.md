# HappyHorse 1.1 文生视频接口

## 请求

POST /api/v1/services/aigc/video-generation/video-synthesis，originPath=true，X-DashScope-Async=enable；Bearer鉴权读取渠道apiKey。必须在渠道中填写所属地域业务空间baseUrl，例如https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com；本包不猜测业务空间或提供通用域名回退。
model严格happyhorse-1.1-t2v；input.prompt原文保留，有中文最多2500字符、无中文5000字符。不得携带图片、视频、音频；源正文有未解析参考图片时在导入和提交门禁拒绝。
parameters.resolution支持480P/720P/1080P；ratio支持16:9、9:16、1:1、4:3、3:4、4:5、5:4、9:21、21:9；duration为3至15秒整数。每次一个视频。watermark传递宿主的明确选择；未提供使用厂商true默认。未开放seed覆盖，不静默丢弃其他providerOptions。无独立音频生成开关，要求生成声音时拒绝。

## 响应

创建和查询必须有output.task_id及合法状态。GET /api/v1/tasks/{taskId}，PENDING待处理、RUNNING进行中、SUCCEEDED且有output.video_url才成功、FAILED失败、CANCELED取消、UNKNOWN或未知状态失败。查询ID不匹配、业务错误、成功无视频均失败；未完成带URL不下载。task_id及结果URL均有效24小时，resultEphemeral=true由宿主回收。
没有真实模型或完整案例验收证据时保持待验。源私有默认与官方输出效果未证明等价。第133例正文引用@图片16但未保存对应引用，不计入接入成功。

## Manifest 完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "dashscope-happyhorse-text-video",
  "name": "HappyHorse 1.1 Text Video",
  "version": "1.0.0",
  "author": "Yingxue",
  "description": "HappyHorse1.1纯文生视频；保留原版正文、画幅和时长，不丢参考图。",
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
        "id": "dashscope-happyhorse-text-video",
        "label": "HappyHorse 1.1 Text Video",
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
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "仅happyhorse-1.1-t2v"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt",
            "description": "完整纯文本，含中文最多2500字符，否则5000"
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "duration",
            "description": "3至15秒"
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "resolution",
            "description": "480P/720P/1080P"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "mapping": "aspectRatio",
            "description": "原始画幅"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "mapping": "watermark",
            "description": "显式传递宿主水印选择"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "happyhorse-1.1-t2v"
              ]
            },
            "message": "必须使用happyhorse-1.1-t2v，不能替换模型版本"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.operation"
                },
                "text_to_video"
              ]
            },
            "message": "此接口仅文生视频"
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
            "message": "文生不能丢弃参考媒体"
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
            "message": "时长必须3至15秒整数"
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
            "message": "分辨率只能480P/720P/1080P"
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
            "message": "不支持此画幅"
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
            "message": "每次只生成一个视频"
          },
          {
            "assert": {
              "$and": [
                {
                  "$not": {
                    "$ref": "request.generateAudio"
                  }
                },
                {
                  "$not": {
                    "$ref": "request.output.generateAudio"
                  }
                }
              ]
            },
            "message": "接口没有声音开关，不能静默丢弃要求"
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
                    {
                      "$if": {
                        "condition": {
                          "$hasHan": {
                            "$ref": "request.prompt"
                          }
                        },
                        "then": 2500,
                        "else": 5000
                      }
                    }
                  ]
                }
              ]
            },
            "message": "正文不能为空或超限，不能自动截断"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.providerOptions"
                  }
                },
                0
              ]
            },
            "message": "此入口未开放供应商覆盖参数"
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
                "$ref": "request.prompt"
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
            "$ref": "response.output.task_id"
          },
          "status": {
            "$if": {
              "condition": {
                "$not": {
                  "$and": [
                    {
                      "$and": [
                        {
                          "$ref": "response.output.task_id"
                        },
                        {
                          "$in": [
                            {
                              "$lower": {
                                "$ref": "response.output.task_status"
                              }
                            },
                            [
                              "pending",
                              "running",
                              "succeeded",
                              "failed",
                              "canceled"
                            ]
                          ]
                        },
                        {
                          "$or": [
                            {
                              "$not": {
                                "$ref": "taskId"
                              }
                            },
                            {
                              "$eq": [
                                {
                                  "$ref": "response.output.task_id"
                                },
                                {
                                  "$ref": "taskId"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "$not": {
                        "$ref": "response.code"
                      }
                    },
                    {
                      "$not": {
                        "$ref": "response.output.code"
                      }
                    }
                  ]
                }
              },
              "then": "failed",
              "else": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$lower": {
                          "$ref": "response.output.task_status"
                        }
                      },
                      "succeeded"
                    ]
                  },
                  "then": {
                    "$if": {
                      "condition": {
                        "$ref": "response.output.video_url"
                      },
                      "then": "succeeded",
                      "else": "failed"
                    }
                  },
                  "else": {
                    "$if": {
                      "condition": {
                        "$eq": [
                          {
                            "$lower": {
                              "$ref": "response.output.task_status"
                            }
                          },
                          "running"
                        ]
                      },
                      "then": "processing",
                      "else": {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$ref": "response.output.task_status"
                                }
                              },
                              "canceled"
                            ]
                          },
                          "then": "cancelled",
                          "else": {
                            "$if": {
                              "condition": {
                                "$eq": [
                                  {
                                    "$lower": {
                                      "$ref": "response.output.task_status"
                                    }
                                  },
                                  "failed"
                                ]
                              },
                              "then": "failed",
                              "else": "pending"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "videos": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$and": [
                      {
                        "$and": [
                          {
                            "$ref": "response.output.task_id"
                          },
                          {
                            "$in": [
                              {
                                "$lower": {
                                  "$ref": "response.output.task_status"
                                }
                              },
                              [
                                "pending",
                                "running",
                                "succeeded",
                                "failed",
                                "canceled"
                              ]
                            ]
                          },
                          {
                            "$or": [
                              {
                                "$not": {
                                  "$ref": "taskId"
                                }
                              },
                              {
                                "$eq": [
                                  {
                                    "$ref": "response.output.task_id"
                                  },
                                  {
                                    "$ref": "taskId"
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "$not": {
                          "$ref": "response.code"
                        }
                      },
                      {
                        "$not": {
                          "$ref": "response.output.code"
                        }
                      }
                    ]
                  },
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
                    "$ref": "response.output.video_url"
                  }
                ]
              },
              "then": [
                {
                  "$ref": "response.output.video_url"
                }
              ],
              "else": []
            }
          },
          "messagePaths": [
            "output.message",
            "message"
          ],
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
