# Topaz Image Enhance 接口字段

## 协议身份

- 插件 ID：`topaz-image-enhance`。
- Provider ID：`topaz-image-enhance`。
- 能力：`image`。
- 默认 Base URL：`https://api.topazlabs.com/image/v1`。
- 鉴权驱动：`header`。
- 创建：`POST /enhance/async`。
- 查询：`GET /status/{{taskId}}`。
- 取消：`DELETE /cancel/{{taskId}}`。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 原增强模型名称。 |
| `images` | media[] | 是 | `image` | 唯一待增强原图。 |
| `providerOptions` | object | 是 | `output_width/output_height` | topaz-image-enhance 命名空间中指定精确输出尺寸。 |

## 上游请求模板逐字段清单

下表由插件请求模板生成，覆盖 body、query、headers 和 multipart 文件声明中的每个字段。

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/enhance/async"` |
| `create.contentType` | `"multipart/form-data"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.output_width` | `{"$ref":"request.providerOptions.topaz-image-enhance.output_width"}` |
| `create.body.output_height` | `{"$ref":"request.providerOptions.topaz-image-enhance.output_height"}` |
| `create.body.output_format` | `"png"` |
| `create.body.crop_to_fill` | `false` |
| `create.files[0].name` | `"image"` |
| `create.files[0].source` | `{"$first":{"$ref":"request.images"}}` |
| `create.files[0].filename` | `"source-image.png"` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/status/{{taskId}}"` |
| `poll.contentType` | `"application/json"` |
| `cancel.method` | `"DELETE"` |
| `cancel.path` | `"/cancel/{{taskId}}"` |
| `cancel.contentType` | `"application/json"` |
| `result.method` | `"GET"` |
| `result.path` | `"/download/{{taskId}}"` |
| `result.contentType` | `"application/json"` |
| `result.headers.Accept` | `"image/*"` |

## Provider 扩展键

- `providerOptions.topaz-image-enhance.output_height`
- `providerOptions.topaz-image-enhance.output_width`

动态模型或工作流允许使用文档声明的完整 `parameters/input/extra_body` 对象；该对象是协议本身的开放 schema，不会被宿主裁剪。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `{"$coalesce":[{"$ref":"response.process_id"},{"$ref":"taskId"}]}` |
| `response.status` | `{"$lower":{"$coalesce":[{"$ref":"response.status"},"pending"]}}` |
| `response.message` | `{"$coalesce":[{"$ref":"response.message"},{"$ref":"response.error"}]}` |
| `response.resultKind` | `"image"` |

## 响应与错误

插件把上游 task/status/text/media/usage 映射为统一结果。临时媒体 URL 标记为 ephemeral，由宿主立即下载持久化。HTTP 错误、业务 code 和 error object 保持失败语义，不包装成成功。

## 兼容边界

依据官方 Image Quickstart 与 Gigapixel 各模型文档。提交 multipart 后按 process_id 查询，完成后由宿主带鉴权下载二进制，不能把私有下载地址当作公开图片。输出尺寸须由原图尺寸和原放大倍数计算，不裁剪。源模型保持 Standard V2/Low Resolution V2/CGI/High Fidelity V2/Text Refine。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "topaz-image-enhance",
  "name": "Topaz Image Enhance",
  "version": "2.0.0",
  "author": "Topaz Labs / 影策",
  "description": "Topaz Image Enhance 独立请求协议插件。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
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
        "id": "topaz-image-enhance",
        "label": "Topaz Image Enhance",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://api.topazlabs.com/image/v1",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "header",
          "field": "apiKey",
          "header": "X-API-Key"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "原增强模型名称。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": true,
            "mapping": "image",
            "description": "唯一待增强原图。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": true,
            "mapping": "output_width/output_height",
            "description": "topaz-image-enhance 命名空间中指定精确输出尺寸。"
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
                  "Standard V2",
                  "Low Resolution V2",
                  "CGI",
                  "High Fidelity V2",
                  "Text Refine"
                ]
              ]
            },
            "message": "请选择支持的 Topaz 精确增强模型"
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
                }
              ]
            },
            "message": "Topaz 图像增强需要且仅支持一张原图"
          },
          {
            "assert": {
              "$eq": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.imageCount"
                    },
                    1
                  ]
                },
                1
              ]
            },
            "message": "单次增强只返回一张图片"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gt": [
                    {
                      "$ref": "request.providerOptions.topaz-image-enhance.output_width"
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$toInt": {
                        "$ref": "request.providerOptions.topaz-image-enhance.output_width"
                      }
                    },
                    {
                      "$ref": "request.providerOptions.topaz-image-enhance.output_width"
                    }
                  ]
                }
              ]
            },
            "message": "Topaz 输出尺寸必须为正整数像素"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gt": [
                    {
                      "$ref": "request.providerOptions.topaz-image-enhance.output_height"
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$toInt": {
                        "$ref": "request.providerOptions.topaz-image-enhance.output_height"
                      }
                    },
                    {
                      "$ref": "request.providerOptions.topaz-image-enhance.output_height"
                    }
                  ]
                }
              ]
            },
            "message": "Topaz 输出尺寸必须为正整数像素"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/enhance/async",
          "contentType": "multipart/form-data",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "output_width": {
              "$ref": "request.providerOptions.topaz-image-enhance.output_width"
            },
            "output_height": {
              "$ref": "request.providerOptions.topaz-image-enhance.output_height"
            },
            "output_format": "png",
            "crop_to_fill": false
          },
          "files": [
            {
              "name": "image",
              "source": {
                "$first": {
                  "$ref": "request.images"
                }
              },
              "filename": "source-image.png"
            }
          ]
        },
        "poll": {
          "method": "GET",
          "path": "/status/{{taskId}}"
        },
        "cancel": {
          "method": "DELETE",
          "path": "/cancel/{{taskId}}"
        },
        "result": {
          "method": "GET",
          "path": "/download/{{taskId}}",
          "headers": {
            "Accept": "image/*"
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.process_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$lower": {
              "$coalesce": [
                {
                  "$ref": "response.status"
                },
                "pending"
              ]
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.error"
              }
            ]
          },
          "resultKind": "image"
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
