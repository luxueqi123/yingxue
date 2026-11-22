# 可灵2.6接口合同

POST `/image-to-video/kling-2.6`，GET `/tasks?task_ids={id}`，originPath同源根路径，不追加/v1。Bearer鉴权由宿主读取渠道apiKey。
模型固定kling-2.6；源别名kling-v2-6保持同版本。此包仅一个明确first_frame，contents保持原文和原图字节，不接受尾帧或其他参考。
JPEG/PNG最多50000000字节，短边至少300，宽高比0.4至2.5，宿主校验尺寸头不代表完整像素验收。
settings.duration为5/10，resolution为720p/1080p，audio为native/off。generateAudio=true只允许1080p，false允许两档；不静默升档。
源singleImage2video必须有明确enableSound=on/off。frames2video未保存声音开关且源schema未提供该控件，消费默认尚待核实，本次不猜测或接入。
固定画幅、分镜、主体、音色、视频编辑等未接控制拒绝。providerOptions仅使用kling-v26-video命名空间。
响应映射：创建data.id，轮询data按taskId唯一匹配；submitted/processing保持等待，只有succeeded且有非空video.url才暴露媒体；失败、缺失/重复任务、未知状态、空成功和非零code拒绝。resultEphemeral交由宿主归档。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "kling-v26-video",
  "name": "Kling 2.6 Video",
  "version": "1.0.0",
  "author": "影策",
  "description": "Kling 2.6原版本单首帧音频控制声明式协议。",
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
        "id": "kling-v26-video",
        "label": "Kling 2.6 Video",
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
            "description": "kling-2.6原版本。"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "contents.prompt.text",
            "description": "原始提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "contents.first_frame.url",
            "description": "单一明确首帧，原字节。"
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "settings.duration",
            "description": "5或10秒。"
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "settings.resolution",
            "description": "720p或1080p。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "mapping": "settings.audio",
            "description": "true为native，false为off；native仅1080p。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.kling-v26-video",
            "description": "独立命名空间mode，未支持控制拒绝。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "kling-2.6"
              ]
            },
            "message": "必须选择真实2.6版本，不能用其他模型代替"
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
            "message": "此入口仅接入单首帧图生视频"
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
            "message": "保留1至2500字符原文"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.kling-v26-video.mode"
                },
                [
                  "std",
                  "pro"
                ]
              ]
            },
            "message": "仅支持标准和高品质"
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
                          "$ref": "request.providerOptions.kling-v26-video.mode"
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
            "message": "清晰度必须匹配原档位"
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
            "message": "2.6仅支持5或10秒"
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
            "message": "首帧决定画幅，不能丢弃固定画幅"
          },
          {
            "assert": {
              "$or": [
                {
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
                {
                  "$and": [
                    {
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
                        true
                      ]
                    },
                    {
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
                        "1080p"
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "有声视频仅1080p，不能自动升级"
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
                        "$ref": "request.images"
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.images.0.role"
                    },
                    "first_frame"
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
            "message": "此入口只支持单首帧；首尾帧源默认声音尚未确认"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.kling-v26-video.multiShot"
                    },
                    false
                  ]
                },
                false
              ]
            },
            "message": "不支持分镜转换"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v26-video.multiPrompt"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v26-video.elements"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v26-video.subjects"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v26-video.voices"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v26-video.videoReferenceType"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v26-video.keepOriginalSound"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "未接入主体、音色、分镜和视频编辑"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/image-to-video/kling-2.6",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "contents": [
              {
                "type": "prompt",
                "text": {
                  "$ref": "request.prompt"
                }
              },
              {
                "type": "first_frame",
                "url": {
                  "$dataPayload": {
                    "$ref": "request.images.0.value"
                  }
                }
              }
            ],
            "settings": {
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
              "audio": {
                "$if": {
                  "condition": {
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
                      true
                    ]
                  },
                  "then": "native",
                  "else": "off"
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
              "then": "2.6响应缺少唯一匹配任务、有效状态或视频结果",
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
