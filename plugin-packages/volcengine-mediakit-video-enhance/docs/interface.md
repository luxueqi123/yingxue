# MediaKit画质增强接口合同

POST `/api/v1/tools/enhance-video`，GET `/api/v1/tasks/{taskId}`；originPath保持路径，不追加/v1。由宿主渠道apiKey提供Bearer鉴权。
选择模型enhance-video；请求只发送video_url、resolution和fps。单一原视频需由上游通过HTTP/HTTPS实际获取；本机地址并不代表上游可访问，不能提交Base64或本地路径。此包不自行上传到第三方存储。
resolution为720p/1080p/2k/4k，fps为1至120整数。源文件格式mp4/flv/ts/avi/mov/wmv/mkv，官方要求短边360至1440、长边360至2560，建议不超过10GB；上游对真实文件校验，客户端尺寸元数据不能替代文件验收。
未发送tool_version/scene/enhance_style，官方默认分别为standard/common/hd。专业版、AIGC场景、编码覆盖没有从源推断。原站私有服务是否覆写这些默认值尚未证明，不能据字段相同声称生成效果或算法完全等价；完整案例保持待验。
不接受创作文本、额外图像/音频参考、多输出或未映射控制。原片时长和原音保留效果须用真实生成产物验收，不能拿HTTP夹具代替。
响应映射：success=true只表示API成功；创建必须有task_id，查询必须与原taskId一致。running保持处理，completed且有非空result.video_url才成功；failed、success=false、缺失/错任务、未知状态和空成功拒绝。未完成响应即使带结果也不暴露，resultEphemeral由宿主及时下载归档。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "volcengine-mediakit-video-enhance",
  "name": "Volcengine MediaKit Video Enhance",
  "version": "1.0.0",
  "author": "影策",
  "description": "官方MediaKit单原片画质增强，保留清晰度和帧率。",
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
        "id": "volcengine-mediakit-video-enhance",
        "label": "Volcengine MediaKit Video Enhance",
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
        "baseUrl": "https://mediakit.cn-beijing.volces.com",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "endpoint identity",
            "description": "enhance-video；无模型替换。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "mapping": "video_url",
            "description": "一段可公开获取的完整原视频。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.volcengine-mediakit-video-enhance",
            "description": "resolution和fps保持原值，版本和场景按官方默认。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "enhance-video"
              ]
            },
            "message": "必须明确选择MediaKit画质增强，不能替换为生成模型"
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
                    1
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
            "message": "仅处理一段原视频"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.prompt"
                        },
                        ""
                      ]
                    }
                  }
                },
                0
              ]
            },
            "message": "视频增强不接收创作文本"
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
            "message": "每次只处理一个视频"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.resolution"
                },
                [
                  "720p",
                  "1080p",
                  "2k",
                  "4k"
                ]
              ]
            },
            "message": "保留源720p/1080p/2k/4k分辨率档位"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.fps"
                },
                [
                  1,
                  2,
                  3,
                  4,
                  5,
                  6,
                  7,
                  8,
                  9,
                  10,
                  11,
                  12,
                  13,
                  14,
                  15,
                  16,
                  17,
                  18,
                  19,
                  20,
                  21,
                  22,
                  23,
                  24,
                  25,
                  26,
                  27,
                  28,
                  29,
                  30,
                  31,
                  32,
                  33,
                  34,
                  35,
                  36,
                  37,
                  38,
                  39,
                  40,
                  41,
                  42,
                  43,
                  44,
                  45,
                  46,
                  47,
                  48,
                  49,
                  50,
                  51,
                  52,
                  53,
                  54,
                  55,
                  56,
                  57,
                  58,
                  59,
                  60,
                  61,
                  62,
                  63,
                  64,
                  65,
                  66,
                  67,
                  68,
                  69,
                  70,
                  71,
                  72,
                  73,
                  74,
                  75,
                  76,
                  77,
                  78,
                  79,
                  80,
                  81,
                  82,
                  83,
                  84,
                  85,
                  86,
                  87,
                  88,
                  89,
                  90,
                  91,
                  92,
                  93,
                  94,
                  95,
                  96,
                  97,
                  98,
                  99,
                  100,
                  101,
                  102,
                  103,
                  104,
                  105,
                  106,
                  107,
                  108,
                  109,
                  110,
                  111,
                  112,
                  113,
                  114,
                  115,
                  116,
                  117,
                  118,
                  119,
                  120
                ]
              ]
            },
            "message": "帧率必须为1至120整数"
          },
          {
            "assert": {
              "$in": [
                {
                  "$first": {
                    "$split": [
                      {
                        "$ref": "request.videos.0.value"
                      },
                      "://"
                    ]
                  }
                },
                [
                  "http",
                  "https"
                ]
              ]
            },
            "message": "需要上游可访问的HTTP视频地址，不能发送本地路径或Base64"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.tool_version"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.scene"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.enhance_style"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.bitrate"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.bitrate_level"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.resolution_limit"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "此源入口未声明增强版本、场景或编码覆盖，不能隐式替换默认"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v1/tools/enhance-video",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "video_url": {
              "$ref": "request.videos.0.value"
            },
            "resolution": {
              "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.resolution"
            },
            "fps": {
              "$ref": "request.providerOptions.volcengine-mediakit-video-enhance.fps"
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
            "$ref": "response.task_id"
          },
          "status": {
            "$if": {
              "condition": {
                "$not": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "response.success"
                        },
                        true
                      ]
                    },
                    {
                      "$ref": "response.task_id"
                    },
                    {
                      "$if": {
                        "condition": {
                          "$ref": "taskId"
                        },
                        "then": {
                          "$and": [
                            {
                              "$eq": [
                                {
                                  "$ref": "response.task_id"
                                },
                                {
                                  "$ref": "taskId"
                                }
                              ]
                            },
                            {
                              "$in": [
                                {
                                  "$ref": "response.status"
                                },
                                [
                                  "running",
                                  "completed",
                                  "failed"
                                ]
                              ]
                            }
                          ]
                        },
                        "else": {
                          "$or": [
                            {
                              "$not": {
                                "$ref": "response.status"
                              }
                            },
                            {
                              "$in": [
                                {
                                  "$ref": "response.status"
                                },
                                [
                                  "running",
                                  "completed",
                                  "failed"
                                ]
                              ]
                            }
                          ]
                        }
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$ref": "response.status"
                            },
                            "completed"
                          ]
                        },
                        "then": {
                          "$gt": [
                            {
                              "$len": {
                                "$ref": "response.result.video_url"
                              }
                            },
                            0
                          ]
                        },
                        "else": true
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
                        "$ref": "response.status"
                      },
                      "completed"
                    ]
                  },
                  "then": "succeeded",
                  "else": {
                    "$if": {
                      "condition": {
                        "$eq": [
                          {
                            "$ref": "response.status"
                          },
                          "failed"
                        ]
                      },
                      "then": "failed",
                      "else": {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$ref": "response.status"
                              },
                              "running"
                            ]
                          },
                          "then": "processing",
                          "else": "pending"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "message": {
            "$if": {
              "condition": {
                "$not": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "response.success"
                        },
                        true
                      ]
                    },
                    {
                      "$ref": "response.task_id"
                    },
                    {
                      "$if": {
                        "condition": {
                          "$ref": "taskId"
                        },
                        "then": {
                          "$and": [
                            {
                              "$eq": [
                                {
                                  "$ref": "response.task_id"
                                },
                                {
                                  "$ref": "taskId"
                                }
                              ]
                            },
                            {
                              "$in": [
                                {
                                  "$ref": "response.status"
                                },
                                [
                                  "running",
                                  "completed",
                                  "failed"
                                ]
                              ]
                            }
                          ]
                        },
                        "else": {
                          "$or": [
                            {
                              "$not": {
                                "$ref": "response.status"
                              }
                            },
                            {
                              "$in": [
                                {
                                  "$ref": "response.status"
                                },
                                [
                                  "running",
                                  "completed",
                                  "failed"
                                ]
                              ]
                            }
                          ]
                        }
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$ref": "response.status"
                            },
                            "completed"
                          ]
                        },
                        "then": {
                          "$gt": [
                            {
                              "$len": {
                                "$ref": "response.result.video_url"
                              }
                            },
                            0
                          ]
                        },
                        "else": true
                      }
                    }
                  ]
                }
              },
              "then": "火山增强响应缺少有效任务、状态或结果",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.error.message"
                  },
                  {
                    "$ref": "response.message"
                  },
                  ""
                ]
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
                        "$eq": [
                          {
                            "$ref": "response.success"
                          },
                          true
                        ]
                      },
                      {
                        "$ref": "response.task_id"
                      },
                      {
                        "$if": {
                          "condition": {
                            "$ref": "taskId"
                          },
                          "then": {
                            "$and": [
                              {
                                "$eq": [
                                  {
                                    "$ref": "response.task_id"
                                  },
                                  {
                                    "$ref": "taskId"
                                  }
                                ]
                              },
                              {
                                "$in": [
                                  {
                                    "$ref": "response.status"
                                  },
                                  [
                                    "running",
                                    "completed",
                                    "failed"
                                  ]
                                ]
                              }
                            ]
                          },
                          "else": {
                            "$or": [
                              {
                                "$not": {
                                  "$ref": "response.status"
                                }
                              },
                              {
                                "$in": [
                                  {
                                    "$ref": "response.status"
                                  },
                                  [
                                    "running",
                                    "completed",
                                    "failed"
                                  ]
                                ]
                              }
                            ]
                          }
                        }
                      },
                      {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$ref": "response.status"
                              },
                              "completed"
                            ]
                          },
                          "then": {
                            "$gt": [
                              {
                                "$len": {
                                  "$ref": "response.result.video_url"
                                }
                              },
                              0
                            ]
                          },
                          "else": true
                        }
                      }
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "completed"
                    ]
                  }
                ]
              },
              "then": [
                {
                  "$ref": "response.result.video_url"
                }
              ],
              "else": []
            }
          },
          "resultEphemeral": true
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
