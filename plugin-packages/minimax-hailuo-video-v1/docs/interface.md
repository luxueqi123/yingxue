# MiniMax V1 单图视频接口合同

创建`POST /v1/video_generation`，Bearer认证由宿主从渠道秘密字段读取。统一输入model/prompt/images/duration/resolution映射为同名字段和first_frame_image；单张参考图允许first_frame或reference_image角色，media.value由宿主提供。不得使用本地文件路径。仅768P的6/10秒或1080P的6秒；画幅取原图，固定画幅要求不准入。提示词完整保留且不超过2000字符，prompt_optimizer为false。共用图片quality不进入视频正文。

图片支持JPG/JPEG/PNG/WebP、公网URL或Base64 DataURL，小于20MB、短边大于300像素、比例2:5至5:2。这些字节和尺寸约束须在实际资源验收中独立核对；Manifest数量/角色通过不等于素材通过。无音频生成和水印参数，要求这些开关时拒绝，不丢弃。

查询`GET /v1/query/video_generation?task_id=...`。响应Preparing/Queueing为等待，Processing为处理中，Success必须含非空file_id，Fail或未知状态为失败。原task_id保持；不以它替代file_id。只有查询的成功响应提供临时metadata.file_id。

获取文件`GET /v1/files/retrieve?file_id=...`返回JSON，响应file.file_id须与查询文件ID一致，file.download_url为视频地址；base_resp.status_code非零即失败。宿主随后经现有出站安全与资源下载/归档路径保存媒体，JSON本身不作为视频。缺文件ID、空视频、错误/非JSON或过期下载均失败。没有取消API或收费重提兜底。

官方线协议：[单图创建](https://platform.minimax.io/docs/api-reference/video-generation-i2v)、[任务查询](https://platform.minimax.io/docs/api-reference/video-generation-query)、[文件获取](https://platform.minimax.io/docs/api-reference/video-generation-download)。源站cameraMovement独立字段、o2别名及首尾帧仍缺消费映射，不在此包推断。真实生成、重启恢复、完整视听、权利/元数据和生产尚待验收。

## Manifest 完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "minimax-hailuo-video-v1",
  "name": "MiniMax Hailuo 2.3 V1",
  "version": "1.0.0",
  "author": "Yingxue",
  "description": "海螺2.3及2.3-Fast单图视频声明式Provider；保留旧版本，按查询文件ID获取结果。",
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
        "id": "minimax-video-v1",
        "label": "MiniMax Hailuo 2.3 V1",
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
        "baseUrl": "https://api.minimax.io",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "values": [
              "MiniMax-Hailuo-2.3",
              "MiniMax-Hailuo-2.3-Fast"
            ],
            "mapping": "model",
            "description": "原生MiniMax海螺2.3或2.3-Fast模型ID，不替换版本。"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt",
            "description": "完整创作正文，最多2000字符，不截断。"
          },
          {
            "name": "images",
            "type": "array",
            "required": true,
            "mapping": "images",
            "description": "唯一原始首帧，按媒体角色读取宿主准备的URL或DataURL。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": true,
            "values": [
              "6",
              "10"
            ],
            "mapping": "duration",
            "description": "768P支持6或10秒，1080P仅支持6秒。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": true,
            "values": [
              "768P",
              "1080P"
            ],
            "mapping": "resolution",
            "description": "原始像素档位768P或1080P，不能改成其他清晰度。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.model"
                },
                [
                  "MiniMax-Hailuo-2.3",
                  "MiniMax-Hailuo-2.3-Fast"
                ]
              ]
            },
            "message": "MiniMax V1单图Provider只接海螺2.3或2.3-Fast，不能替换版本。"
          },
          {
            "assert": {
              "$and": [
                {
                  "$in": [
                    {
                      "$upper": {
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
                    [
                      "768P",
                      "1080P"
                    ]
                  ]
                },
                {
                  "$in": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.output.duration"
                        },
                        {
                          "$ref": "request.duration"
                        }
                      ]
                    },
                    [
                      6,
                      10
                    ]
                  ]
                },
                {
                  "$or": [
                    {
                      "$eq": [
                        {
                          "$upper": {
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
                        "768P"
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
                            }
                          ]
                        },
                        6
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "海螺V1仅支持768P的6/10秒和1080P的6秒，不能自动修改规格。"
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
                },
                {
                  "$in": [
                    {
                      "$ref": "request.images.0.role"
                    },
                    [
                      "first_frame",
                      "reference_image",
                      ""
                    ]
                  ]
                }
              ]
            },
            "message": "海螺V1单图接口需要一张首帧或普通参考图，不接首尾帧、视频或音频。"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.operation"
                },
                [
                  "",
                  "image_to_video"
                ]
              ]
            },
            "message": "该海螺V1 Provider仅接单图生视频。"
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
                    ""
                  ]
                },
                [
                  "",
                  "auto",
                  "adaptive"
                ]
              ]
            },
            "message": "海螺单图接口以原图决定比例，不能忽略固定画幅要求。"
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
                },
                {
                  "$not": {
                    "$ref": "request.watermark"
                  }
                },
                {
                  "$not": {
                    "$ref": "request.output.watermark"
                  }
                }
              ]
            },
            "message": "此海螺V1接口没有同步声音和水印开关，不能丢弃要求。"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.prompt"
                  }
                },
                2000
              ]
            },
            "message": "海螺提示词上限2000字符，不能截断原文。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/video_generation",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "first_frame_image": {
              "$ref": "request.images.0.value"
            },
            "duration": {
              "$coalesce": [
                {
                  "$ref": "request.output.duration"
                },
                {
                  "$ref": "request.duration"
                }
              ]
            },
            "resolution": {
              "$upper": {
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
            "prompt_optimizer": false
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/query/video_generation",
          "query": {
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskIdPaths": [
            "task_id"
          ],
          "status": {
            "$if": {
              "condition": {
                "$or": [
                  {
                    "$not": {
                      "$coalesce": [
                        {
                          "$ref": "response.task_id"
                        },
                        {
                          "$ref": "taskId"
                        }
                      ]
                    }
                  },
                  {
                    "$and": [
                      {
                        "$eq": [
                          {
                            "$lower": {
                              "$ref": "response.status"
                            }
                          },
                          "success"
                        ]
                      },
                      {
                        "$not": {
                          "$ref": "response.file_id"
                        }
                      }
                    ]
                  },
                  {
                    "$and": [
                      {
                        "$ref": "taskId"
                      },
                      {
                        "$not": {
                          "$eq": [
                            {
                              "$ref": "taskId"
                            },
                            {
                              "$ref": "response.task_id"
                            }
                          ]
                        }
                      }
                    ]
                  },
                  {
                    "$and": [
                      {
                        "$ref": "response.status"
                      },
                      {
                        "$not": {
                          "$in": [
                            {
                              "$lower": {
                                "$ref": "response.status"
                              }
                            },
                            [
                              "preparing",
                              "queueing",
                              "processing",
                              "success",
                              "fail"
                            ]
                          ]
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
                        "$lower": {
                          "$ref": "response.status"
                        }
                      },
                      "success"
                    ]
                  },
                  "then": "succeeded",
                  "else": {
                    "$if": {
                      "condition": {
                        "$eq": [
                          {
                            "$lower": {
                              "$ref": "response.status"
                            }
                          },
                          "fail"
                        ]
                      },
                      "then": "failed",
                      "else": {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$ref": "response.status"
                                }
                              },
                              "processing"
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
          "errorPaths": [
            "base_resp.status_code"
          ],
          "messagePaths": [
            "base_resp.status_msg"
          ],
          "metadata": {
            "file_id": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$lower": {
                        "$ref": "response.status"
                      }
                    },
                    "success"
                  ]
                },
                "then": {
                  "$ref": "response.file_id"
                },
                "else": null
              }
            }
          }
        },
        "result": {
          "method": "GET",
          "path": "/v1/files/retrieve",
          "query": {
            "file_id": {
              "$ref": "metadata.file_id"
            }
          },
          "validations": [
            {
              "assert": {
                "$ref": "metadata.file_id"
              },
              "message": "成功任务未返回文件ID，不能用任务ID替代。"
            }
          ],
          "response": {
            "status": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "response.file.file_id"
                    },
                    {
                      "$ref": "metadata.file_id"
                    }
                  ]
                },
                "then": "succeeded",
                "else": "failed"
              }
            },
            "errorPaths": [
              "base_resp.status_code"
            ],
            "messagePaths": [
              "base_resp.status_msg"
            ],
            "resultPaths": [
              "file.download_url"
            ],
            "resultKind": "video",
            "resultEphemeral": true
          }
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
