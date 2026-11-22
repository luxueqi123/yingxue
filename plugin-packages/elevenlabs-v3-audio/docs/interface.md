# ElevenLabs V3 Speech接口合同

默认Base URL为https://api.elevenlabs.io；apiKey使用xi-api-key请求头。POST /v1/text-to-speech/{voice_id}，originPath=true，返回同步音频。
源vocal-v3目录显示名为Eleven V3，只映射eleven_v3，不选V4或multilingual_v2。voice_id保留标准extra.audioVoice中的原ID，拒绝路径／查询／控制字符；不使用音色显示名或历史音色预览替换ID。
正文完整传text，最多5000字符，不截断标签或文本引用。providerOptions.elevenlabs-v3-audio.stability原值0/0.5/1进入voice_settings.stability。原count=1，不接受参考媒体、语速、格式或额外指令替换。
不覆写源未声明的similarity_boost、style、use_speaker_boost、seed和output_format；官方默认mp3_44100_128不代表原私有服务未覆写默认值，原声音和音色账号权限仍待实测。

## 响应与错误

同步音频由宿主binaryPayload处理和归档，HTTP失败及伪音频JSON／HTML由宿主拒绝。没有轮询、取消或第二次结果下载，不把音色列表和登录成功当成真实配音验收。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "elevenlabs-v3-audio",
  "name": "ElevenLabs V3 Speech",
  "version": "1.0.0",
  "author": "影策",
  "description": "原Eleven V3配音，保留音色和稳定性，不升级为V4。",
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
        "id": "elevenlabs-v3-audio",
        "label": "ElevenLabs V3 Speech",
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
        "baseUrl": "https://api.elevenlabs.io",
        "auth": {
          "type": "header",
          "field": "apiKey",
          "header": "xi-api-key"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model_id",
            "description": "固定eleven_v3"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "text",
            "description": "原文最多5000字符"
          },
          {
            "name": "extra",
            "type": "object",
            "mapping": "audioVoice",
            "description": "原voice_id进入受控相对路径"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.elevenlabs-v3-audio",
            "description": "stability原值"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "eleven_v3"
              ]
            },
            "message": "必须选择原Eleven V3模型"
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
                    5000
                  ]
                }
              ]
            },
            "message": "原文必须非空且不超过5000字符，不截断"
          },
          {
            "assert": {
              "$and": [
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.extra.audioVoice"
                      }
                    },
                    20
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "/"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\\"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "?"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "#"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "%"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "."
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          " "
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          ":"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "@"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "["
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "]"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          ";"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "&"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "="
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0000"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0001"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0002"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0003"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0004"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0005"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0006"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0007"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\b"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\t"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\n"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u000b"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\f"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\r"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u000e"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u000f"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0010"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0011"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0012"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0013"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0014"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0015"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0016"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0017"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0018"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u0019"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u001a"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u001b"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u001c"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u001d"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u001e"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          "\u001f"
                        ]
                      }
                    },
                    1
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$split": [
                          {
                            "$ref": "request.extra.audioVoice"
                          },
                          ""
                        ]
                      }
                    },
                    1
                  ]
                }
              ]
            },
            "message": "需要原音色ID，不能包含路径、查询或控制字符"
          },
          {
            "assert": {
              "$in": [
                {
                  "$ref": "request.providerOptions.elevenlabs-v3-audio.stability"
                },
                [
                  0,
                  0.5,
                  1
                ]
              ]
            },
            "message": "稳定性必须为0、0.5或1"
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
            "message": "原配音一次一份"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$toFloat": {
                    "$coalesce": [
                      {
                        "$ref": "request.extra.audioSpeed"
                      },
                      1
                    ]
                  }
                },
                1
              ]
            },
            "message": "原Eleven V3入口未声明语速覆盖"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.extra.audioFormat"
                    },
                    "mp3"
                  ]
                },
                "mp3"
              ]
            },
            "message": "保留原mp3格式"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$len": {
                    "$trim": {
                      "$coalesce": [
                        {
                          "$ref": "request.extra.audioInstructions"
                        },
                        ""
                      ]
                    }
                  }
                },
                0
              ]
            },
            "message": "不能追加源合同未声明的配音指令"
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
            "message": "原入口只接受文本，不能忽略参考媒体"
          }
        ],
        "create": {
          "method": "POST",
          "pathTemplate": {
            "$concat": [
              "/v1/text-to-speech/",
              {
                "$ref": "request.extra.audioVoice"
              }
            ]
          },
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "text": {
              "$ref": "request.prompt"
            },
            "model_id": {
              "$ref": "request.model"
            },
            "voice_settings": {
              "stability": {
                "$ref": "request.providerOptions.elevenlabs-v3-audio.stability"
              }
            }
          }
        },
        "response": {
          "binaryPayload": true,
          "resultKind": "audio",
          "status": "succeeded"
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
