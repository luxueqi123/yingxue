# MiniMax Speech 2.8 HD接口合同

POST /v1/t2a_v2，Bearer，originPath=true。仅speech-2.8-hd；不能替换为其他配音版本。原文少于10000字符，一份文本，不接收图片、视频或音频参考。
标准extra.audioVoice/audioSpeed/audioFormat映射voice_setting.voice_id/speed和mp3格式。命名空间minimax-speech28-audio保留volume/pitch/modifyPitch/intensity/timbre/soundEffects；零值保留，空音效省略。
speed为0.5..2，volume为(0,10]，pitch为-12..12整数，三个modify控制为-100..100整数。音效仅spacious_echo/auditorium_echo/lofi_telephone/robotic。不接收额外audioInstructions。
非流式，output_format=url。只有base_resp.status_code=0且data.status=2并包含HTTP(S)音频地址才成功；错误或处理中响应即使带URL也不暴露。24小时短期URL由宿主resultEphemeral及时下载，hex不作为地址。
没有声明源采样率、编码码率、声道、language_boost等覆盖；按上游默认，原私有服务是否覆写仍待核验。账号音色可用性、真实声音和完整案例必须实测，不以协议夹具替代。

## Manifest完整接口定义

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "minimax-speech28-audio",
  "name": "MiniMax Speech 2.8 HD",
  "version": "1.0.0",
  "author": "影策",
  "description": "原版本文本配音，保留音色、语速、音量、声调及音效。",
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
        "id": "minimax-speech28-audio",
        "label": "MiniMax Speech 2.8 HD",
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
        "baseUrl": "https://api.minimax.cn",
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "mapping": "model",
            "description": "固定speech-2.8-hd"
          },
          {
            "name": "prompt",
            "type": "string",
            "mapping": "text",
            "description": "原文，不截断"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "mapping": "providerOptions.minimax-speech28-audio",
            "description": "音量、声调与音效"
          },
          {
            "name": "extra",
            "type": "object",
            "mapping": "audioVoice/audioSpeed/audioFormat",
            "description": "宿主标准音色、语速与音频格式"
          }
        ],
        "validations": [
          {
            "assert": {
              "$eq": [
                {
                  "$ref": "request.model"
                },
                "speech-2.8-hd"
              ]
            },
            "message": "必须选择原Speech 2.8 HD模型"
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
                  "$lt": [
                    {
                      "$len": {
                        "$ref": "request.prompt"
                      }
                    },
                    10000
                  ]
                }
              ]
            },
            "message": "同步文本必须非空且少于10000字符，不截断"
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
                    0
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
            "message": "此配音只接收文本，不接受参考媒体"
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
            "message": "每次只合成一段配音"
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
                              "$ref": "request.extra.audioVoice"
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
                        "$trim": {
                          "$coalesce": [
                            {
                              "$ref": "request.extra.audioVoice"
                            },
                            ""
                          ]
                        }
                      }
                    },
                    256
                  ]
                }
              ]
            },
            "message": "必须提供有效音色ID"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
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
                    0.5
                  ]
                },
                {
                  "$lte": [
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
                    2
                  ]
                }
              ]
            },
            "message": "语速范围0.5至2"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gt": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.volume"
                        },
                        1
                      ]
                    },
                    0
                  ]
                },
                {
                  "$lte": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.volume"
                        },
                        1
                      ]
                    },
                    10
                  ]
                }
              ]
            },
            "message": "音量范围大于0至10"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.minimax-speech28-audio.pitch"
                    },
                    0
                  ]
                },
                [
                  -12,
                  -11,
                  -10,
                  -9,
                  -8,
                  -7,
                  -6,
                  -5,
                  -4,
                  -3,
                  -2,
                  -1,
                  0,
                  1,
                  2,
                  3,
                  4,
                  5,
                  6,
                  7,
                  8,
                  9,
                  10,
                  11,
                  12
                ]
              ]
            },
            "message": "声调必须为-12至12整数"
          },
          {
            "assert": {
              "$and": [
                {
                  "$in": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.modifyPitch"
                        },
                        0
                      ]
                    },
                    [
                      -100,
                      -99,
                      -98,
                      -97,
                      -96,
                      -95,
                      -94,
                      -93,
                      -92,
                      -91,
                      -90,
                      -89,
                      -88,
                      -87,
                      -86,
                      -85,
                      -84,
                      -83,
                      -82,
                      -81,
                      -80,
                      -79,
                      -78,
                      -77,
                      -76,
                      -75,
                      -74,
                      -73,
                      -72,
                      -71,
                      -70,
                      -69,
                      -68,
                      -67,
                      -66,
                      -65,
                      -64,
                      -63,
                      -62,
                      -61,
                      -60,
                      -59,
                      -58,
                      -57,
                      -56,
                      -55,
                      -54,
                      -53,
                      -52,
                      -51,
                      -50,
                      -49,
                      -48,
                      -47,
                      -46,
                      -45,
                      -44,
                      -43,
                      -42,
                      -41,
                      -40,
                      -39,
                      -38,
                      -37,
                      -36,
                      -35,
                      -34,
                      -33,
                      -32,
                      -31,
                      -30,
                      -29,
                      -28,
                      -27,
                      -26,
                      -25,
                      -24,
                      -23,
                      -22,
                      -21,
                      -20,
                      -19,
                      -18,
                      -17,
                      -16,
                      -15,
                      -14,
                      -13,
                      -12,
                      -11,
                      -10,
                      -9,
                      -8,
                      -7,
                      -6,
                      -5,
                      -4,
                      -3,
                      -2,
                      -1,
                      0,
                      1,
                      2,
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
                      15,
                      16,
                      17,
                      18,
                      19,
                      20,
                      21,
                      22,
                      23,
                      24,
                      25,
                      26,
                      27,
                      28,
                      29,
                      30,
                      31,
                      32,
                      33,
                      34,
                      35,
                      36,
                      37,
                      38,
                      39,
                      40,
                      41,
                      42,
                      43,
                      44,
                      45,
                      46,
                      47,
                      48,
                      49,
                      50,
                      51,
                      52,
                      53,
                      54,
                      55,
                      56,
                      57,
                      58,
                      59,
                      60,
                      61,
                      62,
                      63,
                      64,
                      65,
                      66,
                      67,
                      68,
                      69,
                      70,
                      71,
                      72,
                      73,
                      74,
                      75,
                      76,
                      77,
                      78,
                      79,
                      80,
                      81,
                      82,
                      83,
                      84,
                      85,
                      86,
                      87,
                      88,
                      89,
                      90,
                      91,
                      92,
                      93,
                      94,
                      95,
                      96,
                      97,
                      98,
                      99,
                      100
                    ]
                  ]
                },
                {
                  "$in": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.intensity"
                        },
                        0
                      ]
                    },
                    [
                      -100,
                      -99,
                      -98,
                      -97,
                      -96,
                      -95,
                      -94,
                      -93,
                      -92,
                      -91,
                      -90,
                      -89,
                      -88,
                      -87,
                      -86,
                      -85,
                      -84,
                      -83,
                      -82,
                      -81,
                      -80,
                      -79,
                      -78,
                      -77,
                      -76,
                      -75,
                      -74,
                      -73,
                      -72,
                      -71,
                      -70,
                      -69,
                      -68,
                      -67,
                      -66,
                      -65,
                      -64,
                      -63,
                      -62,
                      -61,
                      -60,
                      -59,
                      -58,
                      -57,
                      -56,
                      -55,
                      -54,
                      -53,
                      -52,
                      -51,
                      -50,
                      -49,
                      -48,
                      -47,
                      -46,
                      -45,
                      -44,
                      -43,
                      -42,
                      -41,
                      -40,
                      -39,
                      -38,
                      -37,
                      -36,
                      -35,
                      -34,
                      -33,
                      -32,
                      -31,
                      -30,
                      -29,
                      -28,
                      -27,
                      -26,
                      -25,
                      -24,
                      -23,
                      -22,
                      -21,
                      -20,
                      -19,
                      -18,
                      -17,
                      -16,
                      -15,
                      -14,
                      -13,
                      -12,
                      -11,
                      -10,
                      -9,
                      -8,
                      -7,
                      -6,
                      -5,
                      -4,
                      -3,
                      -2,
                      -1,
                      0,
                      1,
                      2,
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
                      15,
                      16,
                      17,
                      18,
                      19,
                      20,
                      21,
                      22,
                      23,
                      24,
                      25,
                      26,
                      27,
                      28,
                      29,
                      30,
                      31,
                      32,
                      33,
                      34,
                      35,
                      36,
                      37,
                      38,
                      39,
                      40,
                      41,
                      42,
                      43,
                      44,
                      45,
                      46,
                      47,
                      48,
                      49,
                      50,
                      51,
                      52,
                      53,
                      54,
                      55,
                      56,
                      57,
                      58,
                      59,
                      60,
                      61,
                      62,
                      63,
                      64,
                      65,
                      66,
                      67,
                      68,
                      69,
                      70,
                      71,
                      72,
                      73,
                      74,
                      75,
                      76,
                      77,
                      78,
                      79,
                      80,
                      81,
                      82,
                      83,
                      84,
                      85,
                      86,
                      87,
                      88,
                      89,
                      90,
                      91,
                      92,
                      93,
                      94,
                      95,
                      96,
                      97,
                      98,
                      99,
                      100
                    ]
                  ]
                },
                {
                  "$in": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.timbre"
                        },
                        0
                      ]
                    },
                    [
                      -100,
                      -99,
                      -98,
                      -97,
                      -96,
                      -95,
                      -94,
                      -93,
                      -92,
                      -91,
                      -90,
                      -89,
                      -88,
                      -87,
                      -86,
                      -85,
                      -84,
                      -83,
                      -82,
                      -81,
                      -80,
                      -79,
                      -78,
                      -77,
                      -76,
                      -75,
                      -74,
                      -73,
                      -72,
                      -71,
                      -70,
                      -69,
                      -68,
                      -67,
                      -66,
                      -65,
                      -64,
                      -63,
                      -62,
                      -61,
                      -60,
                      -59,
                      -58,
                      -57,
                      -56,
                      -55,
                      -54,
                      -53,
                      -52,
                      -51,
                      -50,
                      -49,
                      -48,
                      -47,
                      -46,
                      -45,
                      -44,
                      -43,
                      -42,
                      -41,
                      -40,
                      -39,
                      -38,
                      -37,
                      -36,
                      -35,
                      -34,
                      -33,
                      -32,
                      -31,
                      -30,
                      -29,
                      -28,
                      -27,
                      -26,
                      -25,
                      -24,
                      -23,
                      -22,
                      -21,
                      -20,
                      -19,
                      -18,
                      -17,
                      -16,
                      -15,
                      -14,
                      -13,
                      -12,
                      -11,
                      -10,
                      -9,
                      -8,
                      -7,
                      -6,
                      -5,
                      -4,
                      -3,
                      -2,
                      -1,
                      0,
                      1,
                      2,
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
                      15,
                      16,
                      17,
                      18,
                      19,
                      20,
                      21,
                      22,
                      23,
                      24,
                      25,
                      26,
                      27,
                      28,
                      29,
                      30,
                      31,
                      32,
                      33,
                      34,
                      35,
                      36,
                      37,
                      38,
                      39,
                      40,
                      41,
                      42,
                      43,
                      44,
                      45,
                      46,
                      47,
                      48,
                      49,
                      50,
                      51,
                      52,
                      53,
                      54,
                      55,
                      56,
                      57,
                      58,
                      59,
                      60,
                      61,
                      62,
                      63,
                      64,
                      65,
                      66,
                      67,
                      68,
                      69,
                      70,
                      71,
                      72,
                      73,
                      74,
                      75,
                      76,
                      77,
                      78,
                      79,
                      80,
                      81,
                      82,
                      83,
                      84,
                      85,
                      86,
                      87,
                      88,
                      89,
                      90,
                      91,
                      92,
                      93,
                      94,
                      95,
                      96,
                      97,
                      98,
                      99,
                      100
                    ]
                  ]
                }
              ]
            },
            "message": "音效参数必须为-100至100整数"
          },
          {
            "assert": {
              "$in": [
                {
                  "$if": {
                    "condition": {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.soundEffects"
                        },
                        null
                      ]
                    },
                    "then": "",
                    "else": {
                      "$ref": "request.providerOptions.minimax-speech28-audio.soundEffects"
                    }
                  }
                },
                [
                  "",
                  "spacious_echo",
                  "auditorium_echo",
                  "lofi_telephone",
                  "robotic"
                ]
              ]
            },
            "message": "不支持此音效"
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
            "message": "原配音入口保持mp3格式"
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
            "message": "不能附加原合同未声明的配音指令"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/t2a_v2",
          "originPath": true,
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "text": {
              "$ref": "request.prompt"
            },
            "stream": false,
            "output_format": "url",
            "voice_setting": {
              "voice_id": {
                "$trim": {
                  "$coalesce": [
                    {
                      "$ref": "request.extra.audioVoice"
                    },
                    ""
                  ]
                }
              },
              "speed": {
                "$toFloat": {
                  "$coalesce": [
                    {
                      "$ref": "request.extra.audioSpeed"
                    },
                    1
                  ]
                }
              },
              "vol": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-speech28-audio.volume"
                  },
                  1
                ]
              },
              "pitch": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-speech28-audio.pitch"
                  },
                  0
                ]
              }
            },
            "voice_modify": {
              "pitch": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-speech28-audio.modifyPitch"
                  },
                  0
                ]
              },
              "intensity": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-speech28-audio.intensity"
                  },
                  0
                ]
              },
              "timbre": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-speech28-audio.timbre"
                  },
                  0
                ]
              },
              "sound_effects": {
                "$omitEmpty": {
                  "$if": {
                    "condition": {
                      "$eq": [
                        {
                          "$ref": "request.providerOptions.minimax-speech28-audio.soundEffects"
                        },
                        null
                      ]
                    },
                    "then": "",
                    "else": {
                      "$ref": "request.providerOptions.minimax-speech28-audio.soundEffects"
                    }
                  }
                }
              }
            },
            "audio_setting": {
              "format": "mp3"
            }
          }
        },
        "response": {
          "status": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$ref": "response.base_resp.status_code"
                      },
                      0
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$ref": "response.data.status"
                      },
                      2
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
                                  "$ref": "response.data.audio"
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
                          "$ref": "response.data.audio"
                        }
                      },
                      8
                    ]
                  }
                ]
              },
              "then": "succeeded",
              "else": "failed"
            }
          },
          "audios": {
            "$if": {
              "condition": {
                "$and": [
                  {
                    "$eq": [
                      {
                        "$ref": "response.base_resp.status_code"
                      },
                      0
                    ]
                  },
                  {
                    "$eq": [
                      {
                        "$ref": "response.data.status"
                      },
                      2
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
                                  "$ref": "response.data.audio"
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
                          "$ref": "response.data.audio"
                        }
                      },
                      8
                    ]
                  }
                ]
              },
              "then": [
                {
                  "$ref": "response.data.audio"
                }
              ],
              "else": []
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.base_resp.status_msg"
              },
              "配音状态或音频地址无效"
            ]
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
