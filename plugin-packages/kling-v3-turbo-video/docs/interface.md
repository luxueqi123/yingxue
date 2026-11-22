# Turbo图生视频接口合同

POST `/image-to-video/kling-3.0-turbo`，GET `/tasks?task_ids={id}`，使用originPath同源根路径，不能追加/v1。apiKey由宿主渠道提供Bearer鉴权。
model固定为kling-3.0-turbo，源kling-v3-turbo是同版本源标识。prompt原文放入contents；images恰好一个显式first_frame，不接受尾帧、其他图片或视频/音频参考。
JPEG/PNG最多50000000字节，短边300，宽高比0.4至2.5；宿主保持原字节，Base64去掉data URL前缀，不重新编码。尺寸头检查不代表完整像素解码。
settings仅发送resolution和duration：720p/1080p、3至15秒整数。providerOptions.kling-v3-turbo-video.mode的std/pro映射720p/1080p；原站默认720p按标准档保留。
generateAudio只允许true：原站121个冻结节点均为enableSound=on，官方文生和图生音画同出列均有支持标记，现行接口没有音频切换字段，因此使用原生音画能力，不发明sound/audio字段。真实输出是否含有符合原要求的音轨仍待模型验收；不能据此声称off可用。
原multi_shot=false原样保持语义；若用户要求多镜头、主体、固定画幅、关闭声音或其他未接字段，提交前失败，不能删除字段后继续。
响应映射：创建data.id，轮询data数组按taskId唯一匹配；submitted/processing等待，succeeded且outputs中非空video.url才成功；其他任务、重复匹配、未知状态、空结果及上游非零code保持失败。只有成功结果暴露给宿主，临时视频由resultEphemeral归档。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "kling-v3-turbo-video",
  "name": "Kling 3.0 Turbo Video",
  "version": "1.0.0",
  "author": "影策",
  "description": "原版本Kling 3.0 Turbo单首帧音画同出声明式协议。",
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
        "id": "kling-v3-turbo-video",
        "label": "Kling 3.0 Turbo Video",
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
            "description": "kling-3.0-turbo，保持Turbo原版本。"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "contents.prompt.text",
            "description": "完整原文，不拼接分镜。"
          },
          {
            "name": "images",
            "type": "media[]",
            "mapping": "contents.first_frame.url",
            "description": "唯一显式首帧，保留原字节。"
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "settings.duration",
            "description": "3至15秒整数。"
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
            "mapping": "native audiovisual capability",
            "description": "仅承接true；官方能力表声明音画同出，端点没有声音切换字段。实际输出音轨仍须真实验收。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.kling-v3-turbo-video",
            "description": "只读取独立命名空间mode，拒绝未接入字段。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "kling-3.0-turbo"
              ]
            },
            "message": "必须选择真实Kling 3.0 Turbo版本，不能替代为普通3.0"
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
            "message": "Turbo此入口仅接入原站单首帧图生视频"
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
                  "$ref": "request.providerOptions.kling-v3-turbo-video.mode"
                },
                [
                  "std",
                  "pro"
                ]
              ]
            },
            "message": "Turbo只支持标准和高品质"
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
                          "$ref": "request.providerOptions.kling-v3-turbo-video.mode"
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
            "message": "清晰度必须匹配原站std/pro档位"
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
                  15
                ]
              ]
            },
            "message": "Turbo视频时长必须为3至15秒整数"
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
            "message": "Turbo首帧决定画幅，不能丢弃固定画幅要求"
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
                true
              ]
            },
            "message": "此入口承接原站音画同出；关闭声音的合同尚未验证"
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
            "message": "仅支持一个显式首帧，不支持尾帧和其他参考"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.kling-v3-turbo-video.multiShot"
                    },
                    false
                  ]
                },
                false
              ]
            },
            "message": "原站分镜字段不能隐式转换为提示词"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v3-turbo-video.multiPrompt"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v3-turbo-video.elements"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v3-turbo-video.subjects"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v3-turbo-video.voices"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v3-turbo-video.videoReferenceType"
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.providerOptions.kling-v3-turbo-video.keepOriginalSound"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "主体、分镜或视频编辑字段尚未接入"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/image-to-video/kling-3.0-turbo",
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
              "then": "Turbo响应缺少唯一匹配任务、有效状态或视频结果",
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
