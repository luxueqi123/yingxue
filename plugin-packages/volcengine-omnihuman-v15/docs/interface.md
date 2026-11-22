# OmniHuman 1.5 接口合同

## 请求

POST https://visual.volcengineapi.com/，Action分别为CVSubmitTask/CVGetResult，Version=2022-08-31。
宿主使用apiKey与secretKey执行volcengine-v4签名，Region=cn-north-1、Service=cv。请求使用单数image_url和audio_url，req_key固定jimeng_realman_avatar_picture_omni_v15。
model仅omnihuman-1.5；images为单张主体图，audios为单段驱动音频，需要供应商能实际访问的HTTP地址。音频时长必须小于60秒，建议15秒内；包不能从URL证明媒体时长，实际文件需在调用前验证。prompt原文保留，官方建议300字符以内。
providerOptions.volcengine-omnihuman-v15.fastMode必须显式布尔；resolution为自动/720p/1080p，自动省略output_resolution使用官方1080默认。画幅由图片决定，视频时长由音频决定，不接受独立裁切、重复输出或主体遮罩覆盖。默认seed=-1由上游处理；本入口未开放种子覆盖。
## 响应

code=10000才表示业务成功；创建必须有data.task_id。查询processing、in_queue、generating均不得暴露结果；done仍须成功码及有效HTTP data.video_url。not_found、expired、未知状态、缺结果或错误业务码均失败。
视频URL有效1小时，resultEphemeral=true由宿主及时下载归档。协议还验证驱动音频metadata.durationMs为大于0且小于60000的数值，元数据本身不代替实际文件探测。厂商选项只接受fastMode，其他覆盖参数不会静默丢弃。原案例转换及正常/重试入口保留音频驱动时长，不传独立时长。接口验证不代表实际模型生成或作品效果验收；未证明原私有服务默认值等价。运行安装和实际生成分别验收。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "volcengine-omnihuman-v15",
  "name": "Volcengine OmniHuman 1.5",
  "version": "1.0.0",
  "author": "影策",
  "description": "单图与驱动音频的OmniHuman 1.5声明式视频协议。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "Access Key",
        "required": true
      },
      {
        "name": "secretKey",
        "type": "secret",
        "label": "Secret Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "volcengine-omnihuman-v15",
        "label": "Volcengine OmniHuman 1.5",
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
        "baseUrl": "https://visual.volcengineapi.com",
        "requiresPublicMediaUrls": true,
        "auth": {
          "type": "volcengine-v4",
          "field": "apiKey",
          "secretField": "secretKey",
          "service": "cv",
          "region": "cn-north-1"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "req_key",
            "description": "omnihuman-1.5映射唯一服务标识"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt",
            "description": "原始动作提示，不截断"
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "image_url",
            "description": "单张主体图"
          },
          {
            "name": "audios",
            "type": "media[]",
            "mapping": "audio_url",
            "description": "单段驱动音频"
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "output_resolution",
            "description": "自动或720p/1080p"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.volcengine-omnihuman-v15",
            "description": "fastMode必须是显式布尔值"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "omnihuman-1.5"
              ]
            },
            "message": "必须明确选择OmniHuman 1.5原版本"
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
                    1
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
                }
              ]
            },
            "message": "需恰好一张主体图和一段驱动音频"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.images.0.role"
                    },
                    "reference_image"
                  ]
                },
                [
                  "first_frame",
                  "reference_image"
                ]
              ]
            },
            "message": "主体图不能使用尾帧或遮罩角色"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.audios.0.role"
                    },
                    "reference_audio"
                  ]
                },
                "reference_audio"
              ]
            },
            "message": "音频必须明确为驱动参考音频"
          },
          {
            "assert": {
              "$and": [
                {
                  "$in": [
                    {
                      "$first": {
                        "$split": [
                          {
                            "$ref": "request.images.0.value"
                          },
                          "://"
                        ]
                      }
                    },
                    [
                      "https",
                      "http"
                    ]
                  ]
                },
                {
                  "$in": [
                    {
                      "$first": {
                        "$split": [
                          {
                            "$ref": "request.audios.0.value"
                          },
                          "://"
                        ]
                      }
                    },
                    [
                      "https",
                      "http"
                    ]
                  ]
                }
              ]
            },
            "message": "需上游可访问的HTTP媒体地址"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.volcengine-omnihuman-v15.fastMode"
                },
                [
                  true,
                  false
                ]
              ]
            },
            "message": "需明确布尔快速模式，禁止隐式转换字符串或整数"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.volcengine-omnihuman-v15"
                  }
                },
                1
              ]
            },
            "message": "此入口仅接收fastMode，禁止丢弃其他厂商覆盖参数"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$ref": "request.audios.0.metadata.durationMs"
                    },
                    {
                      "$multiply": [
                        {
                          "$ref": "request.audios.0.metadata.durationMs"
                        },
                        1
                      ]
                    }
                  ]
                },
                {
                  "$gt": [
                    {
                      "$ref": "request.audios.0.metadata.durationMs"
                    },
                    0
                  ]
                },
                {
                  "$lt": [
                    {
                      "$ref": "request.audios.0.metadata.durationMs"
                    },
                    60000
                  ]
                }
              ]
            },
            "message": "驱动音频需提供有效数值时长且小于60秒"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.resolution"
                    },
                    "auto"
                  ]
                },
                [
                  "auto",
                  "720p",
                  "1080p"
                ]
              ]
            },
            "message": "输出分辨率仅自动、720p或1080p"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.aspectRatio"
                    },
                    "auto"
                  ]
                },
                [
                  "auto",
                  "adaptive"
                ]
              ]
            },
            "message": "画幅由主体图决定，不能覆盖比例"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.duration"
                    },
                    0
                  ]
                },
                0
              ]
            },
            "message": "视频时长由驱动音频决定，不能覆盖时长"
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
            "message": "每次生成一段视频"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$ref": "request.providerOptions.volcengine-omnihuman-v15.maskUrls"
                  }
                },
                0
              ]
            },
            "message": "本入口不推断讲话主体遮罩，需专门的主体检测链路"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/",
          "originPath": true,
          "contentType": "application/json",
          "query": {
            "Action": "CVSubmitTask",
            "Version": "2022-08-31"
          },
          "body": {
            "req_key": "jimeng_realman_avatar_picture_omni_v15",
            "image_url": {
              "$ref": "request.images.0.value"
            },
            "audio_url": {
              "$ref": "request.audios.0.value"
            },
            "prompt": {
              "$omitEmpty": {
                "$ref": "request.prompt"
              }
            },
            "pe_fast_mode": {
              "$ref": "request.providerOptions.volcengine-omnihuman-v15.fastMode"
            },
            "output_resolution": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.resolution"
                      },
                      "720p"
                    ]
                  },
                  "then": 720,
                  "else": {
                    "$if": {
                      "condition": {
                        "$eq": [
                          {
                            "$ref": "request.resolution"
                          },
                          "1080p"
                        ]
                      },
                      "then": 1080,
                      "else": null
                    }
                  }
                }
              }
            }
          }
        },
        "poll": {
          "method": "POST",
          "path": "/",
          "originPath": true,
          "contentType": "application/json",
          "query": {
            "Action": "CVGetResult",
            "Version": "2022-08-31"
          },
          "body": {
            "req_key": "jimeng_realman_avatar_picture_omni_v15",
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$ref": "response.data.task_id"
          },
          "status": {
            "$if": {
              "condition": {
                "$not": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$ref": "response.code"
                        },
                        10000
                      ]
                    },
                    {
                      "$if": {
                        "condition": {
                          "$ref": "taskId"
                        },
                        "then": {
                          "$in": [
                            {
                              "$ref": "response.data.status"
                            },
                            [
                              "processing",
                              "in_queue",
                              "generating",
                              "done"
                            ]
                          ]
                        },
                        "else": {
                          "$gt": [
                            {
                              "$len": {
                                "$ref": "response.data.task_id"
                              }
                            },
                            0
                          ]
                        }
                      }
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$ref": "response.data.status"
                            },
                            "done"
                          ]
                        },
                        "then": {
                          "$in": [
                            {
                              "$first": {
                                "$split": [
                                  {
                                    "$ref": "response.data.video_url"
                                  },
                                  "://"
                                ]
                              }
                            },
                            [
                              "https",
                              "http"
                            ]
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
                        "$ref": "response.data.status"
                      },
                      "done"
                    ]
                  },
                  "then": "succeeded",
                  "else": {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$ref": "response.data.status"
                          },
                          [
                            "processing",
                            "generating"
                          ]
                        ]
                      },
                      "then": "processing",
                      "else": "pending"
                    }
                  }
                }
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.message"
              },
              "OmniHuman响应缺少成功码、有效状态或媒体"
            ]
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
                            "$ref": "response.code"
                          },
                          10000
                        ]
                      },
                      {
                        "$if": {
                          "condition": {
                            "$ref": "taskId"
                          },
                          "then": {
                            "$in": [
                              {
                                "$ref": "response.data.status"
                              },
                              [
                                "processing",
                                "in_queue",
                                "generating",
                                "done"
                              ]
                            ]
                          },
                          "else": {
                            "$gt": [
                              {
                                "$len": {
                                  "$ref": "response.data.task_id"
                                }
                              },
                              0
                            ]
                          }
                        }
                      },
                      {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$ref": "response.data.status"
                              },
                              "done"
                            ]
                          },
                          "then": {
                            "$in": [
                              {
                                "$first": {
                                  "$split": [
                                    {
                                      "$ref": "response.data.video_url"
                                    },
                                    "://"
                                  ]
                                }
                              },
                              [
                                "https",
                                "http"
                              ]
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
                        "$ref": "response.data.status"
                      },
                      "done"
                    ]
                  }
                ]
              },
              "then": [
                {
                  "$ref": "response.data.video_url"
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
