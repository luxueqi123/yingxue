# O1接口合同

POST `/omni-video/kling-o1`，GET `/tasks?task_ids={id}`，均声明originPath使用同源根路径，不能自动插入/v1。Bearer配置字段apiKey由宿主提供。
model固定为kling-video-o1，身份由专用路径表达；prompt原文放入contents的prompt.text。图片按role和order映射first_frame、last_frame、refer_image，提交原字节Base64或URL，不重编码。
输入JPEG/PNG，最多50000000字节、短边300、比例0.4至2.5；尺寸头校验不等于完整像素解码。
duration仅接入源站5/10秒，resolution严格对应providerOptions.kling-o1-video.mode的std/pro→720p/1080p。aspectRatio为16:9、9:16或1:1；有首帧可省略自适应画幅。audio固定off，拒绝生成声音、视频编辑、主体和分镜控制。
文生视频不接收图片；图生视频必须有一个显式首帧和至多一个尾帧；多图参考接受1至7张reference_image。此包未定义提示词引用ID语法转换，原站引用标记须由接入层先验证，不能隐式改写。
响应映射：创建data.id保存任务ID；轮询data数组按当前taskId唯一匹配，不能取另一任务结果。submitted/processing等待，succeeded必须有outputs中type=video且url非空的结果；failed、非零code、缺ID、不匹配、多匹配、未知状态和空成功均失败。resultEphemeral由宿主归档临时视频，HTTP夹具不代表真实生成。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "kling-o1-video",
  "name": "Kling O1 Video",
  "version": "1.0.0",
  "author": "影策",
  "description": "保持Kling O1原版本的独立声明式协议。",
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
        "id": "kling-o1-video",
        "label": "Kling O1 Video",
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
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "inputImages": {
          "formats": [
            "jpeg",
            "png"
          ],
          "maxBytes": 50000000,
          "minShortSide": 300,
          "minAspectRatio": 0.4,
          "maxAspectRatio": 2.5
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "endpoint identity",
            "description": "仅kling-video-o1。"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "contents.prompt.text",
            "description": "保留完整原始正文，不截断。"
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "contents",
            "description": "按role保持首尾帧和参考图语义，按order排序。"
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "settings.duration",
            "description": "原站5或10秒。"
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "settings.resolution",
            "description": "720p或1080p。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "mapping": "settings.aspect_ratio",
            "description": "无首帧须明确画幅。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.kling-o1-video",
            "description": "mode为std/pro；不读取其他Provider命名空间。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "kling-video-o1"
              ]
            },
            "message": "O1入口必须使用原始O1版本"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.operation"
                },
                [
                  "text_to_video",
                  "image_to_video",
                  "reference_to_video"
                ]
              ]
            },
            "message": "O1此包尚未接入视频编辑"
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
            "message": "原始提示词须为1至2500字符"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.kling-o1-video.mode"
                },
                [
                  "std",
                  "pro"
                ]
              ]
            },
            "message": "O1仅支持标准和高品质"
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
                          "$ref": "request.providerOptions.kling-o1-video.mode"
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
            "message": "O1清晰度必须匹配源品质档位"
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
            "message": "此O1源接入只接受原站5或10秒"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "request.operation"
                    },
                    "image_to_video"
                  ]
                },
                "then": {
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
                      "adaptive",
                      "16:9",
                      "9:16",
                      "1:1"
                    ]
                  ]
                },
                "else": {
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
                      "16:9",
                      "9:16",
                      "1:1"
                    ]
                  ]
                }
              }
            },
            "message": "无首帧的O1请求必须明确支持的画幅"
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
            "message": "O1此入口不生成音频"
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
            "message": "O1每次只生成一个视频"
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
            "message": "O1视频编辑与声音参考尚待独立验收"
          },
          {
            "assert": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "request.operation"
                    },
                    "text_to_video"
                  ]
                },
                "then": {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    0
                  ]
                },
                "else": {
                  "$if": {
                    "condition": {
                      "$eq": [
                        {
                          "$ref": "request.operation"
                        },
                        "image_to_video"
                      ]
                    },
                    "then": {
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
                    "else": {
                      "$and": [
                        {
                          "$gte": [
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
                                      "reference_image"
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
                                      "reference_image"
                                    ]
                                  }
                                }
                              }
                            },
                            7
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
                                      "reference_image"
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
                        }
                      ]
                    }
                  }
                }
              }
            },
            "message": "O1图片角色必须匹配操作，不能猜测帧顺序"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.kling-o1-video.multiShot"
                    },
                    false
                  ]
                },
                false
              ]
            },
            "message": "O1不采用3.0分镜字段"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-o1-video.multiPrompt"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-o1-video.elements"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-o1-video.subjects"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-o1-video.voices"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-o1-video.videoReferenceType"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-o1-video.keepOriginalSound"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "未接入的主体、分镜和视频编辑字段不能丢弃"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/omni-video/kling-o1",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "contents": {
              "$concatArrays": [
                [
                  {
                    "type": "prompt",
                    "text": {
                      "$ref": "request.prompt"
                    }
                  }
                ],
                {
                  "$map": {
                    "from": {
                      "$sortByOrder": {
                        "$ref": "request.images"
                      }
                    },
                    "as": "media",
                    "in": {
                      "type": {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$ref": "media.role"
                              },
                              "reference_image"
                            ]
                          },
                          "then": "refer_image",
                          "else": {
                            "$ref": "media.role"
                          }
                        }
                      },
                      "url": {
                        "$dataPayload": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  }
                }
              ]
            },
            "settings": {
              "audio": "off",
              "resolution": {
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
              "aspect_ratio": {
                "$omitEmpty": {
                  "$if": {
                    "condition": {
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
                          "16:9",
                          "9:16",
                          "1:1"
                        ]
                      ]
                    },
                    "then": {
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
                    "else": ""
                  }
                }
              }
            },
            "options": {
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
          }
        },
        "poll": {
          "method": "GET",
          "path": "/tasks",
          "originPath": true,
          "query": {
            "task_ids": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$if": {
              "condition": {
                "$gt": [
                  {
                    "$len": {
                      "$ref": "taskId"
                    }
                  },
                  0
                ]
              },
              "then": {
                "$first": {
                  "$map": {
                    "from": {
                      "$filter": {
                        "from": {
                          "$ref": "response.data"
                        },
                        "as": "row",
                        "where": {
                          "$eq": [
                            {
                              "$ref": "row.id"
                            },
                            {
                              "$ref": "taskId"
                            }
                          ]
                        }
                      }
                    },
                    "as": "row",
                    "in": {
                      "$ref": "row.id"
                    }
                  }
                }
              },
              "else": {
                "$ref": "response.data.id"
              }
            }
          },
          "status": {
            "$if": {
              "condition": {
                "$or": [
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$if": {
                            "condition": {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "taskId"
                                  }
                                },
                                0
                              ]
                            },
                            "then": {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$ref": "response.data"
                                      },
                                      "as": "row",
                                      "where": {
                                        "$eq": [
                                          {
                                            "$ref": "row.id"
                                          },
                                          {
                                            "$ref": "taskId"
                                          }
                                        ]
                                      }
                                    }
                                  },
                                  "as": "row",
                                  "in": {
                                    "$ref": "row.id"
                                  }
                                }
                              }
                            },
                            "else": {
                              "$ref": "response.data.id"
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
                              "$ref": "taskId"
                            }
                          },
                          0
                        ]
                      },
                      {
                        "$ne": [
                          {
                            "$len": {
                              "$filter": {
                                "from": {
                                  "$ref": "response.data"
                                },
                                "as": "row",
                                "where": {
                                  "$eq": [
                                    {
                                      "$ref": "row.id"
                                    },
                                    {
                                      "$ref": "taskId"
                                    }
                                  ]
                                }
                              }
                            }
                          },
                          1
                        ]
                      }
                    ]
                  },
                  {
                    "$not": {
                      "$in": [
                        {
                          "$if": {
                            "condition": {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "taskId"
                                  }
                                },
                                0
                              ]
                            },
                            "then": {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$ref": "response.data"
                                      },
                                      "as": "row",
                                      "where": {
                                        "$eq": [
                                          {
                                            "$ref": "row.id"
                                          },
                                          {
                                            "$ref": "taskId"
                                          }
                                        ]
                                      }
                                    }
                                  },
                                  "as": "row",
                                  "in": {
                                    "$ref": "row.status"
                                  }
                                }
                              }
                            },
                            "else": {
                              "$ref": "response.data.status"
                            }
                          }
                        },
                        [
                          "submitted",
                          "processing",
                          "succeeded",
                          "failed"
                        ]
                      ]
                    }
                  },
                  {
                    "$and": [
                      {
                        "$eq": [
                          {
                            "$if": {
                              "condition": {
                                "$gt": [
                                  {
                                    "$len": {
                                      "$ref": "taskId"
                                    }
                                  },
                                  0
                                ]
                              },
                              "then": {
                                "$first": {
                                  "$map": {
                                    "from": {
                                      "$filter": {
                                        "from": {
                                          "$ref": "response.data"
                                        },
                                        "as": "row",
                                        "where": {
                                          "$eq": [
                                            {
                                              "$ref": "row.id"
                                            },
                                            {
                                              "$ref": "taskId"
                                            }
                                          ]
                                        }
                                      }
                                    },
                                    "as": "row",
                                    "in": {
                                      "$ref": "row.status"
                                    }
                                  }
                                }
                              },
                              "else": {
                                "$ref": "response.data.status"
                              }
                            }
                          },
                          "succeeded"
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
                                      "$first": {
                                        "$map": {
                                          "from": {
                                            "$filter": {
                                              "from": {
                                                "$ref": "response.data"
                                              },
                                              "as": "row",
                                              "where": {
                                                "$eq": [
                                                  {
                                                    "$ref": "row.id"
                                                  },
                                                  {
                                                    "$ref": "taskId"
                                                  }
                                                ]
                                              }
                                            }
                                          },
                                          "as": "row",
                                          "in": {
                                            "$ref": "row.outputs"
                                          }
                                        }
                                      }
                                    },
                                    "as": "result",
                                    "where": {
                                      "$and": [
                                        {
                                          "$eq": [
                                            {
                                              "$ref": "result.type"
                                            },
                                            "video"
                                          ]
                                        },
                                        {
                                          "$gt": [
                                            {
                                              "$len": {
                                                "$trim": {
                                                  "$ref": "result.url"
                                                }
                                              }
                                            },
                                            0
                                          ]
                                        }
                                      ]
                                    }
                                  }
                                },
                                "as": "result",
                                "in": {
                                  "$ref": "result.url"
                                }
                              }
                            }
                          },
                          0
                        ]
                      }
                    ]
                  }
                ]
              },
              "then": "failed",
              "else": {
                "$if": {
                  "condition": {
                    "$gt": [
                      {
                        "$len": {
                          "$ref": "taskId"
                        }
                      },
                      0
                    ]
                  },
                  "then": {
                    "$first": {
                      "$map": {
                        "from": {
                          "$filter": {
                            "from": {
                              "$ref": "response.data"
                            },
                            "as": "row",
                            "where": {
                              "$eq": [
                                {
                                  "$ref": "row.id"
                                },
                                {
                                  "$ref": "taskId"
                                }
                              ]
                            }
                          }
                        },
                        "as": "row",
                        "in": {
                          "$ref": "row.status"
                        }
                      }
                    }
                  },
                  "else": {
                    "$ref": "response.data.status"
                  }
                }
              }
            }
          },
          "message": {
            "$if": {
              "condition": {
                "$or": [
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$if": {
                            "condition": {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "taskId"
                                  }
                                },
                                0
                              ]
                            },
                            "then": {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$ref": "response.data"
                                      },
                                      "as": "row",
                                      "where": {
                                        "$eq": [
                                          {
                                            "$ref": "row.id"
                                          },
                                          {
                                            "$ref": "taskId"
                                          }
                                        ]
                                      }
                                    }
                                  },
                                  "as": "row",
                                  "in": {
                                    "$ref": "row.id"
                                  }
                                }
                              }
                            },
                            "else": {
                              "$ref": "response.data.id"
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
                              "$ref": "taskId"
                            }
                          },
                          0
                        ]
                      },
                      {
                        "$ne": [
                          {
                            "$len": {
                              "$filter": {
                                "from": {
                                  "$ref": "response.data"
                                },
                                "as": "row",
                                "where": {
                                  "$eq": [
                                    {
                                      "$ref": "row.id"
                                    },
                                    {
                                      "$ref": "taskId"
                                    }
                                  ]
                                }
                              }
                            }
                          },
                          1
                        ]
                      }
                    ]
                  },
                  {
                    "$not": {
                      "$in": [
                        {
                          "$if": {
                            "condition": {
                              "$gt": [
                                {
                                  "$len": {
                                    "$ref": "taskId"
                                  }
                                },
                                0
                              ]
                            },
                            "then": {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$filter": {
                                      "from": {
                                        "$ref": "response.data"
                                      },
                                      "as": "row",
                                      "where": {
                                        "$eq": [
                                          {
                                            "$ref": "row.id"
                                          },
                                          {
                                            "$ref": "taskId"
                                          }
                                        ]
                                      }
                                    }
                                  },
                                  "as": "row",
                                  "in": {
                                    "$ref": "row.status"
                                  }
                                }
                              }
                            },
                            "else": {
                              "$ref": "response.data.status"
                            }
                          }
                        },
                        [
                          "submitted",
                          "processing",
                          "succeeded",
                          "failed"
                        ]
                      ]
                    }
                  },
                  {
                    "$and": [
                      {
                        "$eq": [
                          {
                            "$if": {
                              "condition": {
                                "$gt": [
                                  {
                                    "$len": {
                                      "$ref": "taskId"
                                    }
                                  },
                                  0
                                ]
                              },
                              "then": {
                                "$first": {
                                  "$map": {
                                    "from": {
                                      "$filter": {
                                        "from": {
                                          "$ref": "response.data"
                                        },
                                        "as": "row",
                                        "where": {
                                          "$eq": [
                                            {
                                              "$ref": "row.id"
                                            },
                                            {
                                              "$ref": "taskId"
                                            }
                                          ]
                                        }
                                      }
                                    },
                                    "as": "row",
                                    "in": {
                                      "$ref": "row.status"
                                    }
                                  }
                                }
                              },
                              "else": {
                                "$ref": "response.data.status"
                              }
                            }
                          },
                          "succeeded"
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
                                      "$first": {
                                        "$map": {
                                          "from": {
                                            "$filter": {
                                              "from": {
                                                "$ref": "response.data"
                                              },
                                              "as": "row",
                                              "where": {
                                                "$eq": [
                                                  {
                                                    "$ref": "row.id"
                                                  },
                                                  {
                                                    "$ref": "taskId"
                                                  }
                                                ]
                                              }
                                            }
                                          },
                                          "as": "row",
                                          "in": {
                                            "$ref": "row.outputs"
                                          }
                                        }
                                      }
                                    },
                                    "as": "result",
                                    "where": {
                                      "$and": [
                                        {
                                          "$eq": [
                                            {
                                              "$ref": "result.type"
                                            },
                                            "video"
                                          ]
                                        },
                                        {
                                          "$gt": [
                                            {
                                              "$len": {
                                                "$trim": {
                                                  "$ref": "result.url"
                                                }
                                              }
                                            },
                                            0
                                          ]
                                        }
                                      ]
                                    }
                                  }
                                },
                                "as": "result",
                                "in": {
                                  "$ref": "result.url"
                                }
                              }
                            }
                          },
                          0
                        ]
                      }
                    ]
                  }
                ]
              },
              "then": "O1响应缺少唯一匹配任务、有效状态或视频结果",
              "else": {
                "$coalesce": [
                  {
                    "$first": {
                      "$map": {
                        "from": {
                          "$filter": {
                            "from": {
                              "$ref": "response.data"
                            },
                            "as": "row",
                            "where": {
                              "$eq": [
                                {
                                  "$ref": "row.id"
                                },
                                {
                                  "$ref": "taskId"
                                }
                              ]
                            }
                          }
                        },
                        "as": "row",
                        "in": {
                          "$ref": "row.message"
                        }
                      }
                    }
                  },
                  {
                    "$ref": "response.message"
                  }
                ]
              }
            }
          },
          "errorPaths": [
            "code"
          ],
          "videos": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$if": {
                          "condition": {
                            "$gt": [
                              {
                                "$len": {
                                  "$ref": "taskId"
                                }
                              },
                              0
                            ]
                          },
                          "then": {
                            "$first": {
                              "$map": {
                                "from": {
                                  "$filter": {
                                    "from": {
                                      "$ref": "response.data"
                                    },
                                    "as": "row",
                                    "where": {
                                      "$eq": [
                                        {
                                          "$ref": "row.id"
                                        },
                                        {
                                          "$ref": "taskId"
                                        }
                                      ]
                                    }
                                  }
                                },
                                "as": "row",
                                "in": {
                                  "$ref": "row.status"
                                }
                              }
                            }
                          },
                          "else": {
                            "$ref": "response.data.status"
                          }
                        }
                      },
                      "succeeded"
                    ]
                  },
                  {
                    "$not": {
                      "$or": [
                        {
                          "$eq": [
                            {
                              "$len": {
                                "$if": {
                                  "condition": {
                                    "$gt": [
                                      {
                                        "$len": {
                                          "$ref": "taskId"
                                        }
                                      },
                                      0
                                    ]
                                  },
                                  "then": {
                                    "$first": {
                                      "$map": {
                                        "from": {
                                          "$filter": {
                                            "from": {
                                              "$ref": "response.data"
                                            },
                                            "as": "row",
                                            "where": {
                                              "$eq": [
                                                {
                                                  "$ref": "row.id"
                                                },
                                                {
                                                  "$ref": "taskId"
                                                }
                                              ]
                                            }
                                          }
                                        },
                                        "as": "row",
                                        "in": {
                                          "$ref": "row.id"
                                        }
                                      }
                                    }
                                  },
                                  "else": {
                                    "$ref": "response.data.id"
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
                                    "$ref": "taskId"
                                  }
                                },
                                0
                              ]
                            },
                            {
                              "$ne": [
                                {
                                  "$len": {
                                    "$filter": {
                                      "from": {
                                        "$ref": "response.data"
                                      },
                                      "as": "row",
                                      "where": {
                                        "$eq": [
                                          {
                                            "$ref": "row.id"
                                          },
                                          {
                                            "$ref": "taskId"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                1
                              ]
                            }
                          ]
                        },
                        {
                          "$not": {
                            "$in": [
                              {
                                "$if": {
                                  "condition": {
                                    "$gt": [
                                      {
                                        "$len": {
                                          "$ref": "taskId"
                                        }
                                      },
                                      0
                                    ]
                                  },
                                  "then": {
                                    "$first": {
                                      "$map": {
                                        "from": {
                                          "$filter": {
                                            "from": {
                                              "$ref": "response.data"
                                            },
                                            "as": "row",
                                            "where": {
                                              "$eq": [
                                                {
                                                  "$ref": "row.id"
                                                },
                                                {
                                                  "$ref": "taskId"
                                                }
                                              ]
                                            }
                                          }
                                        },
                                        "as": "row",
                                        "in": {
                                          "$ref": "row.status"
                                        }
                                      }
                                    }
                                  },
                                  "else": {
                                    "$ref": "response.data.status"
                                  }
                                }
                              },
                              [
                                "submitted",
                                "processing",
                                "succeeded",
                                "failed"
                              ]
                            ]
                          }
                        },
                        {
                          "$and": [
                            {
                              "$eq": [
                                {
                                  "$if": {
                                    "condition": {
                                      "$gt": [
                                        {
                                          "$len": {
                                            "$ref": "taskId"
                                          }
                                        },
                                        0
                                      ]
                                    },
                                    "then": {
                                      "$first": {
                                        "$map": {
                                          "from": {
                                            "$filter": {
                                              "from": {
                                                "$ref": "response.data"
                                              },
                                              "as": "row",
                                              "where": {
                                                "$eq": [
                                                  {
                                                    "$ref": "row.id"
                                                  },
                                                  {
                                                    "$ref": "taskId"
                                                  }
                                                ]
                                              }
                                            }
                                          },
                                          "as": "row",
                                          "in": {
                                            "$ref": "row.status"
                                          }
                                        }
                                      }
                                    },
                                    "else": {
                                      "$ref": "response.data.status"
                                    }
                                  }
                                },
                                "succeeded"
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
                                            "$first": {
                                              "$map": {
                                                "from": {
                                                  "$filter": {
                                                    "from": {
                                                      "$ref": "response.data"
                                                    },
                                                    "as": "row",
                                                    "where": {
                                                      "$eq": [
                                                        {
                                                          "$ref": "row.id"
                                                        },
                                                        {
                                                          "$ref": "taskId"
                                                        }
                                                      ]
                                                    }
                                                  }
                                                },
                                                "as": "row",
                                                "in": {
                                                  "$ref": "row.outputs"
                                                }
                                              }
                                            }
                                          },
                                          "as": "result",
                                          "where": {
                                            "$and": [
                                              {
                                                "$eq": [
                                                  {
                                                    "$ref": "result.type"
                                                  },
                                                  "video"
                                                ]
                                              },
                                              {
                                                "$gt": [
                                                  {
                                                    "$len": {
                                                      "$trim": {
                                                        "$ref": "result.url"
                                                      }
                                                    }
                                                  },
                                                  0
                                                ]
                                              }
                                            ]
                                          }
                                        }
                                      },
                                      "as": "result",
                                      "in": {
                                        "$ref": "result.url"
                                      }
                                    }
                                  }
                                },
                                0
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                ]
              },
              "then": {
                "$map": {
                  "from": {
                    "$filter": {
                      "from": {
                        "$first": {
                          "$map": {
                            "from": {
                              "$filter": {
                                "from": {
                                  "$ref": "response.data"
                                },
                                "as": "row",
                                "where": {
                                  "$eq": [
                                    {
                                      "$ref": "row.id"
                                    },
                                    {
                                      "$ref": "taskId"
                                    }
                                  ]
                                }
                              }
                            },
                            "as": "row",
                            "in": {
                              "$ref": "row.outputs"
                            }
                          }
                        }
                      },
                      "as": "result",
                      "where": {
                        "$and": [
                          {
                            "$eq": [
                              {
                                "$ref": "result.type"
                              },
                              "video"
                            ]
                          },
                          {
                            "$gt": [
                              {
                                "$len": {
                                  "$trim": {
                                    "$ref": "result.url"
                                  }
                                }
                              },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  },
                  "as": "result",
                  "in": {
                    "$ref": "result.url"
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
