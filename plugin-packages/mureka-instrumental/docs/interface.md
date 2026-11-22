# Mureka 8 Instrumental接口合同

Bearer鉴权，Base URL为https://api.mureka.ai。POST /v1/instrumental/generate创建；GET /v1/instrumental/query/{taskId}轮询，均originPath=true。
只接受mureka-8、明确forceInstrumental=true的一份文本音乐；n=1显式覆盖上游默认2，stream=false。完整prompt最多1024字符，不截断或将歌词、参考媒体、指定曲长静默丢弃。不接入其他版本、auto、歌曲或音色克隆。
## 响应与错误

preparing/queued映射pending，running/streaming映射running；只有succeeded且恰好一份choices中的HTTP(S) url才成功。failed/timeouted/未知或缺失状态均失败，cancelled保持取消；处理中即使携带结果也不下载，不使用stream_url替代成品。
结果URL有效期30天，resultEphemeral=true交宿主下载持久化。原私有服务是否覆写默认值及模型效果仍待真实验收，协议测试不能代替听审。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "mureka-instrumental",
  "name": "Mureka 8 Instrumental",
  "version": "1.0.0",
  "author": "影策",
  "description": "原mureka-8纯音乐独立协议，保留原模型和一次一份。",
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
        "id": "mureka-instrumental",
        "label": "Mureka 8 Instrumental",
        "capabilities": [
          "audio"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.mureka.ai",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "严格mureka-8"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "完整纯音乐描述，最多1024字符"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.mureka-instrumental",
            "description": "forceInstrumental必须true"
          },
          {
            "name": "extra",
            "type": "object",
            "mapping": "count",
            "description": "原count=1显式映射n=1"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/instrumental/generate",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "n": 1,
            "stream": false
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/instrumental/query/{{taskId}}",
          "originPath": true
        },
        "response": {
          "taskIdPaths": [
            "id"
          ],
          "status": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "succeeded"
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "response.choices"
                            },
                            []
                          ]
                        }
                      },
                      1
                    ]
                  },
                  {
                    "$in": [
                      {
                        "$first": {
                          "$split": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "response.choices.0.url"
                                },
                                ""
                              ]
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
                    "$gt": [
                      {
                        "$len": {
                          "$ref": "response.choices.0.url"
                        }
                      },
                      8
                    ]
                  }
                ]
              },
              "then": "succeeded",
              "else": {
                "$if": {
                  "condition": {
                    "$in": [
                      {
                        "$ref": "response.status"
                      },
                      [
                        "preparing",
                        "queued"
                      ]
                    ]
                  },
                  "then": "pending",
                  "else": {
                    "$if": {
                      "condition": {
                        "$in": [
                          {
                            "$ref": "response.status"
                          },
                          [
                            "running",
                            "streaming"
                          ]
                        ]
                      },
                      "then": "running",
                      "else": {
                        "$if": {
                          "condition": {
                            "$eq": [
                              {
                                "$ref": "response.status"
                              },
                              "cancelled"
                            ]
                          },
                          "then": "cancelled",
                          "else": "failed"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.failed_reason"
              },
              "原音乐任务状态或结果无效"
            ]
          },
          "audios": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$ref": "response.status"
                      },
                      "succeeded"
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$len": {
                          "$coalesce": [
                            {
                              "$ref": "response.choices"
                            },
                            []
                          ]
                        }
                      },
                      1
                    ]
                  },
                  {
                    "$in": [
                      {
                        "$first": {
                          "$split": [
                            {
                              "$coalesce": [
                                {
                                  "$ref": "response.choices.0.url"
                                },
                                ""
                              ]
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
                    "$gt": [
                      {
                        "$len": {
                          "$ref": "response.choices.0.url"
                        }
                      },
                      8
                    ]
                  }
                ]
              },
              "then": [
                {
                  "$ref": "response.choices.0.url"
                }
              ],
              "else": []
            }
          },
          "resultEphemeral": true
        },
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "mureka-8"
              ]
            },
            "message": "必须选择原mureka-8模型，不自动升级"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gt": [
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
                {
                  "$lte": [
                    {
                      "$len": {
                        "$ref": "request.prompt"
                      }
                    },
                    1024
                  ]
                }
              ]
            },
            "message": "纯音乐描述必须非空且不超过1024字符，不截断"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.extra.count"
                    },
                    1
                  ]
                },
                [
                  1,
                  "1"
                ]
              ]
            },
            "message": "此入口一次生成一份原音乐"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.providerOptions.mureka-instrumental.forceInstrumental"
                },
                true
              ]
            },
            "message": "必须明确选择纯音乐，不以配音或歌曲替代"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.providerOptions.mureka-instrumental.durationMs"
                },
                null
              ]
            },
            "message": "此接口没有指定曲长字段，不丢弃曲长"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$coalesce": [
                          {
                            "$ref": "request.images"
                          },
                          []
                        ]
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$coalesce": [
                          {
                            "$ref": "request.videos"
                          },
                          []
                        ]
                      }
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$coalesce": [
                          {
                            "$ref": "request.audios"
                          },
                          []
                        ]
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "本入口只接收文本，不忽略参考媒体"
          }
        ]
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
