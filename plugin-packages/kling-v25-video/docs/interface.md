# Kling 2.5 Turbo 接口合同

- POST `/v1/videos/image2video`；GET `/v1/videos/image2video/{taskId}`。Bearer密钥只由宿主渠道读取。
- `model_name=kling-v2-5-turbo`，原文prompt最多2500字符，mode为std/pro；duration以字符串提交5或10。统一output值优先。
- 宿主通用图片quality不参与视频档位；只有本Provider命名空间mode与视频resolution决定档位，不向上游发送图片quality。
- image/image_tail按first_frame/last_frame取值，不按数组位置猜测；内嵌数据去掉data URL前缀。宿主读取一次原字节并核对格式、大小、尺寸头，提交相同字节，不重编码。
- 旧版合同JPEG/PNG最多10000000字节，短边至少300、比例0.4至2.5。仅首尾帧要求pro。完整像素解码另行验收。
- 自适应原图画幅；拒绝固定画幅、4K、非5/10时长、生成音频、视频/音频参考、主体、智能/自定义分镜、多输出。未实现字段不得静默变成3.0参数。
- 响应映射：data.task_id保存为taskId；data.task_status的submitted/processing保持等待，succeed映射为succeeded且必须有非空data.task_result.videos[].url；只有succeed暴露媒体，未完成或失败响应即使带URL也不提前下载。failed、上游非零code、缺task ID和空成功保持失败。data.task_status_msg或message提供错误信息。30天临时结果由现有宿主下载归档。
- LTV源`kling-v2-5-turbo-pro`依照源schema映射到实际2.5模型；low/high为std/pro，不接受O1、3.0或Turbo3.0版本。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "kling-v25-video",
  "name": "Kling 2.5 Turbo Video",
  "version": "1.0.1",
  "author": "影策",
  "description": "Kling 2.5 Turbo同版本首帧与首尾帧声明式协议。",
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
        "id": "kling-v25-video",
        "label": "Kling 2.5 Turbo Video",
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
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "inputImages": {
          "formats": [
            "jpeg",
            "png"
          ],
          "maxBytes": 10000000,
          "minShortSide": 300,
          "minAspectRatio": 0.4,
          "maxAspectRatio": 2.5
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "values": [
              "kling-v2-5-turbo"
            ],
            "mapping": "model_name",
            "description": "精确2.5模型版本。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "原始提示词，不能截断。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "image/image_tail",
            "description": "按显式first_frame和last_frame角色取值。"
          },
          {
            "name": "duration",
            "type": "integer",
            "values": [
              "5",
              "10"
            ],
            "mapping": "duration",
            "description": "5或10秒。"
          },
          {
            "name": "resolution",
            "type": "string",
            "values": [
              "720p",
              "1080p"
            ],
            "mapping": "mode",
            "description": "与std/pro对应。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.kling-v25-video",
            "description": "仅本Provider命名空间mode。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "kling-v2-5-turbo"
              ]
            },
            "message": "此协议只接受实际Kling 2.5 Turbo模型，不能使用3.0或源平台别名"
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
            "message": "此入口只承接首帧或首尾帧图生视频"
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
            "message": "原始提示词必须完整且不超过2500字符"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.kling-v25-video.mode"
                },
                [
                  "std",
                  "pro"
                ]
              ]
            },
            "message": "2.5模式只支持std和pro"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$lower": {
                    "$coalesce": [
                      {
                        "$ref": "request.output.resolution"
                      },
                      {
                        "$ref": "request.resolution"
                      }
                    ]
                  }
                },
                {
                  "$if": {
                    "condition": {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.kling-v25-video.mode"
                        },
                        "pro"
                      ]
                    },
                    "then": "1080p",
                    "else": "720p"
                  }
                }
              ]
            },
            "message": "分辨率必须匹配2.5质量档位"
          },
          {
            "assert": {
              "$in": [
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
                [
                  5,
                  10
                ]
              ]
            },
            "message": "2.5只支持5或10秒"
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
                  "",
                  "auto",
                  "adaptive"
                ]
              ]
            },
            "message": "图生视频画幅由原图决定，不能忽略固定输出画幅"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.output.generateAudio"
                    },
                    {
                      "$ref": "request.generateAudio"
                    },
                    false
                  ]
                },
                false
              ]
            },
            "message": "2.5此入口不生成音频"
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
            "message": "2.5此入口不接收视频或音频参考"
          },
          {
            "assert": {
              "$and": [
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
                            "$eq": [
                              {
                                "$ref": "media.role"
                              },
                              "first_frame"
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
                            "$ref": "request.images"
                          },
                          "as": "media",
                          "where": {
                            "$eq": [
                              {
                                "$ref": "media.role"
                              },
                              "last_frame"
                            ]
                          }
                        }
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
                    {
                      "$add": [
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$ref": "request.images"
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "first_frame"
                                ]
                              }
                            }
                          }
                        },
                        {
                          "$len": {
                            "$filter": {
                              "from": {
                                "$ref": "request.images"
                              },
                              "as": "media",
                              "where": {
                                "$eq": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "last_frame"
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
            "message": "必须明确一个首帧和至多一个尾帧，不能用普通参考或重复角色代替"
          },
          {
            "assert": {
              "$or": [
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
                            "$eq": [
                              {
                                "$ref": "media.role"
                              },
                              "last_frame"
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
                      "$ref": "request.providerOptions.kling-v25-video.mode"
                    },
                    "pro"
                  ]
                }
              ]
            },
            "message": "2.5首尾帧只支持pro高品质"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.kling-v25-video.multiShot"
                    },
                    false
                  ]
                },
                false
              ]
            },
            "message": "2.5此入口不支持智能分镜"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v25-video.multiPrompt"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v25-video.elements"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v25-video.subjects"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v25-video.voices"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "2.5此入口不接收分镜、主体或音色ID"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v25-video.videoReferenceType"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v25-video.keepOriginalSound"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "2.5此入口不接收视频编辑控制"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/videos/image2video",
          "contentType": "application/json",
          "body": {
            "model_name": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "mode": {
              "$ref": "request.providerOptions.kling-v25-video.mode"
            },
            "duration": {
              "$toString": {
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
            },
            "image": {
              "$first": {
                "$map": {
                  "from": {
                    "$filter": {
                      "from": {
                        "$ref": "request.images"
                      },
                      "as": "media",
                      "where": {
                        "$eq": [
                          {
                            "$ref": "media.role"
                          },
                          "first_frame"
                        ]
                      }
                    }
                  },
                  "as": "media",
                  "in": {
                    "$dataPayload": {
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
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "where": {
                          "$eq": [
                            {
                              "$ref": "media.role"
                            },
                            "last_frame"
                          ]
                        }
                      }
                    },
                    "as": "media",
                    "in": {
                      "$dataPayload": {
                        "$ref": "media.value"
                      }
                    }
                  }
                }
              }
            },
            "watermark_info": {
              "enabled": {
                "$coalesce": [
                  {
                    "$ref": "request.output.watermark"
                  },
                  {
                    "$ref": "request.watermark"
                  },
                  false
                ]
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/videos/image2video/{{taskId}}"
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
                "$or": [
                  {
                    "$and": [
                      {
                        "$eq": [
                          {
                            "$ref": "response.data.task_status"
                          },
                          "succeed"
                        ]
                      },
                      {
                        "$eq": [
                          {
                            "$len": {
                              "$map": {
                                "from": {
                                  "$filter": {
                                    "from": {
                                      "$ref": "response.data.task_result.videos"
                                    },
                                    "as": "video",
                                    "where": {
                                      "$not": {
                                        "$eq": [
                                          {
                                            "$coalesce": [
                                              {
                                                "$ref": "video.url"
                                              },
                                              ""
                                            ]
                                          },
                                          ""
                                        ]
                                      }
                                    }
                                  }
                                },
                                "as": "video",
                                "in": {
                                  "$ref": "video.url"
                                }
                              }
                            }
                          },
                          0
                        ]
                      }
                    ]
                  },
                  {
                    "$and": [
                      {
                        "$not": {
                          "$ref": "response.data.task_id"
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
                    "$coalesce": [
                      {
                        "$ref": "response.data.task_status"
                      },
                      "pending"
                    ]
                  }
                }
              }
            }
          },
          "messagePaths": [
            "data.task_status_msg",
            "message"
          ],
          "errorPaths": [
            "code"
          ],
          "videos": {
            "$if": {
              "condition": {
                "$eq": [
                  {
                    "$ref": "response.data.task_status"
                  },
                  "succeed"
                ]
              },
              "then": {
                "$map": {
                  "from": {
                    "$filter": {
                      "from": {
                        "$ref": "response.data.task_result.videos"
                      },
                      "as": "video",
                      "where": {
                        "$not": {
                          "$eq": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "video.url"
                                },
                                ""
                              ]
                            },
                            ""
                          ]
                        }
                      }
                    }
                  },
                  "as": "video",
                  "in": {
                    "$ref": "video.url"
                  }
                }
              },
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
