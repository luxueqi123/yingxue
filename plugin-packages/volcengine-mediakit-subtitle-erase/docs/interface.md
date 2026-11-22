# 接口合同

- Provider `volcengine-mediakit-subtitle-erase`；model必须为`erase-video-subtitle-pro`。Bearer apiKey从渠道secret读取，包内没有凭据。
- 创建`POST /api/v1/tools/erase-video-subtitle-pro`；发送一段videos的video_url、本providerOptions下明确的mode，以及原来明确保存的可选erase_ratio_location。
- `Subtitle`处理OCR识别为字幕的文本，默认仅画面下方50%；`Text`处理全画面字幕及其他类型文本，不包含场景文字。保留原模式，不扩大擦除区域。原有erase_ratio_location逐坐标保留，最多20框；矩形采用0到1归一化左上/右下坐标，拒绝空、反向、越界、非数值或额外字段。Text仅擦指定框，Subtitle仅擦原框与下半画面的交集。
- 支持官方主流视频容器；输入最高2K，输出最高1080P。原源要求最长边不超过2048、至少3秒，运行提交前拒绝未知或超出这些规格的元数据。元数据校验不是完整解码，实际上游媒体可读性和处理结果仍须验收。
- 官方model_version默认v4，output_encode_mode默认Quality；原源未保存这些字段，包省略而不伪造v5或私有默认。原私有后端是否同一算法未证明。拒绝显式版本、时间段、编码、输出分辨率或回调覆盖，不能悄悄忽略。
- 不传生成时长、画幅、帧率或提示词；处理整段原视频。统一生成面板默认值不是原擦除请求，不能把它们变成视频截短或缩放要求。
- 查询`GET /api/v1/tasks/{taskId}`；success必须为true，任务ID一致，running等待、completed需result.video_url、failed失败。处理中即使有URL也不下载，成功缺结果和未知状态均失败。
- result视频地址24小时有效，由现有宿主下载归属于当前用户的资源；requiresPublicMediaUrls=true要求上游可读HTTP(S)输入，不把本地地址、Base64或未授权的TOS地址直接发送。
- 原文档含完整状态和错误合同；本机HTTP夹具、包安装和实际画面效果分别验收。真实模型调用、权利、完整视听和生产仍待验。

## 响应映射

读取success、task_id、status、result.video_url、error.message与message；短期结果resultEphemeral=true。失败不包装为成功，也不自动重复收费提交。

## Manifest 完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "volcengine-mediakit-subtitle-erase",
  "name": "Volcengine MediaKit Subtitle Erase",
  "version": "1.0.1",
  "author": "影策",
  "description": "火山字幕／文本擦除声明式协议，保留原视频及明确模式。",
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
        "id": "volcengine-mediakit-subtitle-erase",
        "label": "Volcengine MediaKit Subtitle Erase",
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
            "description": "erase-video-subtitle-pro；不能替换标准版或生成模型。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "mapping": "video_url",
            "description": "一段原视频，使用宿主公开可访问地址。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.volcengine-mediakit-subtitle-erase",
            "description": "mode必须明确为Subtitle或Text；可选erase_ratio_location保留原1到20个矩形坐标。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "erase-video-subtitle-pro"
              ]
            },
            "message": "必须选择精细化字幕擦除端点，标准版不接收mode"
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
            "message": "字幕擦除不接收创作文本"
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
                  "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.mode"
                },
                [
                  "Subtitle",
                  "Text"
                ]
              ]
            },
            "message": "必须保留原Subtitle或Text模式，禁止默认替代"
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
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.model_version"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.output_encode_mode"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.time_segment_filter"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.subtitle_filter"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.media_output_destination"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.callback_url"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.callback_args"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.resolution"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.fps"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.duration"
                    },
                    null
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.ratio"
                    },
                    null
                  ]
                }
              ]
            },
            "message": "原源未保存版本、时间段或编码覆盖，不能添加或忽略"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.erase_ratio_location"
                    },
                    null
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$len": {
                            "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.erase_ratio_location"
                          }
                        },
                        1
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$len": {
                            "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.erase_ratio_location"
                          }
                        },
                        20
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$len": {
                            "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.erase_ratio_location"
                          }
                        },
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.erase_ratio_location"
                              },
                              "as": "box",
                              "where": {
                                "$and": [
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "box"
                                      },
                                      {
                                        "top_left_x": {
                                          "$ref": "box.top_left_x"
                                        },
                                        "top_left_y": {
                                          "$ref": "box.top_left_y"
                                        },
                                        "bottom_right_x": {
                                          "$ref": "box.bottom_right_x"
                                        },
                                        "bottom_right_y": {
                                          "$ref": "box.bottom_right_y"
                                        }
                                      }
                                    ]
                                  },
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "box.top_left_x"
                                      },
                                      {
                                        "$multiply": [
                                          {
                                            "$ref": "box.top_left_x"
                                          },
                                          1
                                        ]
                                      }
                                    ]
                                  },
                                  {
                                    "$gte": [
                                      {
                                        "$ref": "box.top_left_x"
                                      },
                                      0
                                    ]
                                  },
                                  {
                                    "$lte": [
                                      {
                                        "$ref": "box.top_left_x"
                                      },
                                      1
                                    ]
                                  },
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "box.top_left_y"
                                      },
                                      {
                                        "$multiply": [
                                          {
                                            "$ref": "box.top_left_y"
                                          },
                                          1
                                        ]
                                      }
                                    ]
                                  },
                                  {
                                    "$gte": [
                                      {
                                        "$ref": "box.top_left_y"
                                      },
                                      0
                                    ]
                                  },
                                  {
                                    "$lte": [
                                      {
                                        "$ref": "box.top_left_y"
                                      },
                                      1
                                    ]
                                  },
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "box.bottom_right_x"
                                      },
                                      {
                                        "$multiply": [
                                          {
                                            "$ref": "box.bottom_right_x"
                                          },
                                          1
                                        ]
                                      }
                                    ]
                                  },
                                  {
                                    "$gte": [
                                      {
                                        "$ref": "box.bottom_right_x"
                                      },
                                      0
                                    ]
                                  },
                                  {
                                    "$lte": [
                                      {
                                        "$ref": "box.bottom_right_x"
                                      },
                                      1
                                    ]
                                  },
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "box.bottom_right_y"
                                      },
                                      {
                                        "$multiply": [
                                          {
                                            "$ref": "box.bottom_right_y"
                                          },
                                          1
                                        ]
                                      }
                                    ]
                                  },
                                  {
                                    "$gte": [
                                      {
                                        "$ref": "box.bottom_right_y"
                                      },
                                      0
                                    ]
                                  },
                                  {
                                    "$lte": [
                                      {
                                        "$ref": "box.bottom_right_y"
                                      },
                                      1
                                    ]
                                  },
                                  {
                                    "$lt": [
                                      {
                                        "$ref": "box.top_left_x"
                                      },
                                      {
                                        "$ref": "box.bottom_right_x"
                                      }
                                    ]
                                  },
                                  {
                                    "$lt": [
                                      {
                                        "$ref": "box.top_left_y"
                                      },
                                      {
                                        "$ref": "box.bottom_right_y"
                                      }
                                    ]
                                  }
                                ]
                              }
                            }
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "原框选必须为1到20个有效矩形，数值坐标0到1且左上严格小于右下；不能丢字段或扩大区域"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v1/tools/erase-video-subtitle-pro",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "video_url": {
              "$ref": "request.videos.0.value"
            },
            "mode": {
              "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.mode"
            },
            "erase_ratio_location": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-mediakit-subtitle-erase.erase_ratio_location"
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
              "then": "火山字幕擦除响应缺少有效任务、状态或结果",
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
