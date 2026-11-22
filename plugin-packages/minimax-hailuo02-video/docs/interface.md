# 海螺02接口合同

## 请求

官方单图：https://platform.minimax.io/docs/api-reference/video-generation-i2v
官方首尾帧：https://platform.minimax.io/docs/api-reference/video-generation-fl2v
POST https://api.minimax.io/v1/video_generation；宿主从渠道读取apiKey作Bearer鉴权。
model必须MiniMax-Hailuo-02（数字0），不是源工具键MiniMax-Hailuo-o2。源工具displayName Hailuo 02与官方版本相符，私有中转内部实现及默认效果未证明等价。
images必须有唯一first_frame；首尾模式还须唯一last_frame。请求按角色读取first_frame_image、last_frame_image，保留原文prompt；prompt_optimizer=false明确关闭改写，源私有默认尚未证明。
单图512P/768P可6或10秒、1080P仅6秒；首尾帧768P可6或10秒、1080P仅6秒，不支持512P。不承接视频、音频、同步生成声音、固定画幅或额外providerOptions。
媒体要求JPG/JPEG/PNG/WebP、低于20MB、短边大于300px、比例2:5到5:2；调用前需核实实际媒体，包不能由URL证明文件合规。末帧尺寸与首帧不同，厂商会裁切末帧匹配首帧。每次仅一个结果，提示词不超过2000字符。

## 响应

创建必须返回task_id。GET /v1/query/video_generation?task_id=...；Preparing/Queueing待处理、Processing进行中、Success成功且必须有file_id、Fail失败，未知状态或任务ID不符拒绝。
GET /v1/files/retrieve?file_id=...读取file.download_url，响应file.file_id必须匹配查询file_id，不能拿task_id替代。base_resp.status_code非0拒绝；成功缺媒体地址拒绝。resultEphemeral=true由宿主回收归档。
本包本机夹具和页面验收不代表真实模型生成、版权、源私有行为或完整案例验收。

## Manifest 完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "minimax-hailuo02-video",
  "name": "MiniMax Hailuo 02",
  "version": "1.0.0",
  "author": "Yingxue",
  "description": "海螺02单图及首尾帧声明式协议，保留原模型版本与参考图角色。",
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
        "id": "minimax-hailuo02-video",
        "label": "MiniMax Hailuo 02",
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
              "MiniMax-Hailuo-02"
            ],
            "mapping": "model",
            "description": "仅MiniMax-Hailuo-02，数字0；源工具o2以displayName Hailuo 02核对。"
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
            "description": "单图须first_frame；首尾两图须唯一first_frame与last_frame，按角色取值。"
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
              "512P",
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
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "MiniMax-Hailuo-02"
              ]
            },
            "message": "仅支持原版本MiniMax-Hailuo-02，不能替换模型。"
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
                      "512P",
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
                      "$not": {
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
                          "1080P"
                        ]
                      }
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
                },
                {
                  "$or": [
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
                      "$not": {
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
                          "512P"
                        ]
                      }
                    }
                  ]
                }
              ]
            },
            "message": "海螺02仅512P/768P的6或10秒、1080P的6秒；首尾帧不支持512P。"
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
                  "$or": [
                    {
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
                        }
                      ]
                    },
                    {
                      "$and": [
                        {
                          "$eq": [
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
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "必须有唯一首帧；两图必须明确首尾角色，不能丢图或按数组位置猜测。"
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
            "message": "该海螺02 Provider仅接单图或首尾帧生视频。"
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
            "message": "此海螺02合同未开放额外供应商选项，不能静默丢弃。"
          },
          {
            "assert": {
              "$or": [
                {
                  "$not": {
                    "$ref": "request.output.count"
                  }
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.output.count"
                    },
                    1
                  ]
                }
              ]
            },
            "message": "海螺02每次仅生成一个结果。"
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
                    "$ref": "media.value"
                  }
                }
              }
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
            "prompt_optimizer": false,
            "last_frame_image": {
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
                      "$ref": "media.value"
                    }
                  }
                }
              }
            }
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
