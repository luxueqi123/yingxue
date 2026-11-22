# Vidu Q2 Pro 接口合同

## 请求

官方：https://platform.vidu.com/docs/image-to-video 、https://platform.vidu.com/docs/start-end-to-video 、https://platform.vidu.com/docs/get-generation 。
宿主从渠道apiKey读取密钥，Authorization: Token，非Bearer。POST /ent/v2/img2video为单图，/ent/v2/start-end2video为首尾帧；originPath=true，baseUrl=https://api.vidu.com。
model必须viduq2-pro；images按明确first_frame/last_frame角色排列，首帧必须唯一。单图时长1至10秒、首尾1至8秒；resolution为540p/720p/1080p，prompt最多5000字符。源工具当前保存范围仅720p/1080p及1至8秒，导入不扩大原参数。
is_rec=false保留原文，bgm=false保留源默认关闭背景音乐，off_peak=false。单图audio=false；首尾帧Q2不支持audio字段，省略该字段，不能把Q3音画合同用在Q2。此入口不承接声音、水印、种子或其他providerOptions覆盖。
图片支持PNG/JPEG/JPG/WebP、公网URL或DataURL，单文件最多50MB、HTTP请求体不超过20MB。单图比例在1:4至4:1范围内；首尾帧的宽高比之比需0.8至1.25。上述实际字节、尺寸及可达性需在真实素材验收中另验；角色检查不代表素材已通过。

## 响应

GET /ent/v2/tasks/{taskId}/creations。created/queueing待处理、processing进行中、success仍须恰好一个creations结果和url、failed失败，err_code或未知状态失败。创建必须有task_id；官方查询不回显task_id，使用原查询ID，若返回了不同ID则拒绝。未完成状态带URL不得下载。结果URL有效24小时，resultEphemeral=true由宿主回收归档。
本机HTTP夹具通过不代表真实模型、源私有默认效果、全片质量、版权或完整案例验收。原viduq2参考模型、Q3以及混合模式不由此包替代。

## Manifest 完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "vidu-q2-pro-video",
  "name": "Vidu Q2 Pro Native",
  "version": "1.0.0",
  "author": "Yingxue",
  "description": "Vidu Q2 Pro原生单图与首尾帧声明式协议，Token鉴权，保留原版本和帧角色。",
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
        "id": "vidu-q2-pro-video",
        "label": "Vidu Q2 Pro Native",
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
        "baseUrl": "https://api.vidu.com",
        "auth": {
          "type": "header",
          "field": "apiKey",
          "header": "Authorization",
          "prefix": "Token "
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "仅viduq2-pro"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "prompt",
            "description": "完整原始正文"
          },
          {
            "name": "images",
            "type": "array",
            "mapping": "images",
            "description": "唯一first_frame及可选唯一last_frame"
          },
          {
            "name": "duration",
            "type": "integer",
            "mapping": "duration",
            "description": "单图1..10，首尾1..8秒"
          },
          {
            "name": "resolution",
            "type": "string",
            "mapping": "resolution",
            "description": "540p/720p/1080p"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "viduq2-pro"
              ]
            },
            "message": "必须使用viduq2-pro，不能替换版本"
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
            "message": "此入口只接单图和首尾帧"
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
            "message": "必须保留唯一首帧，双图还须唯一末帧；不丢弃音视频"
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
                        }
                      ]
                    },
                    1
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
                        }
                      ]
                    },
                    {
                      "$if": {
                        "condition": {
                          "$eq": [
                            {
                              "$len": {
                                "$ref": "request.images"
                              }
                            },
                            1
                          ]
                        },
                        "then": 10,
                        "else": 8
                      }
                    }
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
                    {
                      "$toInt": {
                        "$coalesce": [
                          {
                            "$ref": "request.output.duration"
                          },
                          {
                            "$ref": "request.duration"
                          }
                        ]
                      }
                    }
                  ]
                }
              ]
            },
            "message": "单图1至10秒、首尾帧1至8秒整数"
          },
          {
            "assert": {
              "$in": [
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
                [
                  "540p",
                  "720p",
                  "1080p"
                ]
              ]
            },
            "message": "不支持此分辨率"
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
                    "auto"
                  ]
                },
                [
                  "auto",
                  "adaptive",
                  ""
                ]
              ]
            },
            "message": "画幅由原图决定，不能忽略指定固定比例"
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
            "message": "此源接入仅保留无声、无额外水印要求"
          },
          {
            "assert": {
              "$lte": [
                {
                  "$len": {
                    "$ref": "request.prompt"
                  }
                },
                5000
              ]
            },
            "message": "原文不能超过5000字符或自动截断"
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
            "message": "每次只能生成一个结果"
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
            "message": "此源合同未开放供应商覆盖选项"
          }
        ],
        "create": {
          "method": "POST",
          "pathTemplate": {
            "$if": {
              "condition": {
                "$eq": [
                  {
                    "$len": {
                      "$ref": "request.images"
                    }
                  },
                  1
                ]
              },
              "then": "/ent/v2/img2video",
              "else": "/ent/v2/start-end2video"
            }
          },
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "images": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    1
                  ]
                },
                "then": [
                  {
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
                  }
                ],
                "else": [
                  {
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
                  {
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
                }
              ]
            },
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
            "is_rec": false,
            "bgm": false,
            "off_peak": false,
            "audio": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$len": {
                          "$ref": "request.images"
                        }
                      },
                      1
                    ]
                  },
                  "then": false,
                  "else": null
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/ent/v2/tasks/{{taskId}}/creations",
          "originPath": true
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$not": {
                  "$and": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "response.task_id"
                        },
                        {
                          "$ref": "taskId"
                        }
                      ]
                    },
                    {
                      "$not": {
                        "$ref": "response.err_code"
                      }
                    },
                    {
                      "$in": [
                        {
                          "$lower": {
                            "$ref": "response.state"
                          }
                        },
                        [
                          "created",
                          "queueing",
                          "processing",
                          "success",
                          "failed"
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
                          "$not": {
                            "$ref": "response.task_id"
                          }
                        },
                        {
                          "$eq": [
                            {
                              "$ref": "taskId"
                            },
                            {
                              "$ref": "response.task_id"
                            }
                          ]
                        }
                      ]
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
                          "$ref": "response.state"
                        }
                      },
                      "success"
                    ]
                  },
                  "then": {
                    "$if": {
                      "condition": {
                        "$and": [
                          {
                            "$and": [
                              {
                                "$coalesce": [
                                  {
                                    "$ref": "response.task_id"
                                  },
                                  {
                                    "$ref": "taskId"
                                  }
                                ]
                              },
                              {
                                "$not": {
                                  "$ref": "response.err_code"
                                }
                              },
                              {
                                "$in": [
                                  {
                                    "$lower": {
                                      "$ref": "response.state"
                                    }
                                  },
                                  [
                                    "created",
                                    "queueing",
                                    "processing",
                                    "success",
                                    "failed"
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
                                    "$not": {
                                      "$ref": "response.task_id"
                                    }
                                  },
                                  {
                                    "$eq": [
                                      {
                                        "$ref": "taskId"
                                      },
                                      {
                                        "$ref": "response.task_id"
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "$eq": [
                              {
                                "$lower": {
                                  "$ref": "response.state"
                                }
                              },
                              "success"
                            ]
                          },
                          {
                            "$eq": [
                              {
                                "$len": {
                                  "$ref": "response.creations"
                                }
                              },
                              1
                            ]
                          },
                          {
                            "$ref": "response.creations.0.url"
                          }
                        ]
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
                              "$ref": "response.state"
                            }
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
                                "$lower": {
                                  "$ref": "response.state"
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
          "videos": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$and": [
                      {
                        "$coalesce": [
                          {
                            "$ref": "response.task_id"
                          },
                          {
                            "$ref": "taskId"
                          }
                        ]
                      },
                      {
                        "$not": {
                          "$ref": "response.err_code"
                        }
                      },
                      {
                        "$in": [
                          {
                            "$lower": {
                              "$ref": "response.state"
                            }
                          },
                          [
                            "created",
                            "queueing",
                            "processing",
                            "success",
                            "failed"
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
                            "$not": {
                              "$ref": "response.task_id"
                            }
                          },
                          {
                            "$eq": [
                              {
                                "$ref": "taskId"
                              },
                              {
                                "$ref": "response.task_id"
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$lower": {
                          "$ref": "response.state"
                        }
                      },
                      "success"
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$ref": "response.creations"
                        }
                      },
                      1
                    ]
                  },
                  {
                    "$ref": "response.creations.0.url"
                  }
                ]
              },
              "then": [
                {
                  "$ref": "response.creations.0.url"
                }
              ],
              "else": []
            }
          },
          "messagePaths": [
            "err_code",
            "message"
          ],
          "resultEphemeral": true
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
