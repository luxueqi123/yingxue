## yingce.payment/v1

已实现 `validate_config`、`create_order` 和 `verify_notification`。异步通知同时接受 GET 与 POST，验签成功且订单、交易号、商户、支付方式、状态和金额全部匹配后，才交由宿主的幂等入账流程处理。

`query_order`、`close_order` 和 `download_trade_bill` 当前显式返回不支持，因为尚无经过真实响应验证的云猫码合同。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v1",
  "id": "yingxue-payment-cloudcat-epay",
  "name": "云猫码支付",
  "version": "1.0.0",
  "author": "映雪",
  "description": "云猫码易支付兼容接口充值适配器。",
  "enabled": true,
  "installable": true,
  "runtime": {
    "backend": "rpc",
    "backendEntry": "backend/provider"
  },
  "surfaces": [
    "wallet",
    "settings"
  ],
  "permissions": [
    "payment.create",
    "payment.query",
    "payment.close",
    "payment.reconcile"
  ],
  "configuration": {
    "fields": [
      {
        "name": "publicBaseUrl",
        "type": "url",
        "label": "服务器公网地址",
        "required": true
      },
      {
        "name": "gateway",
        "type": "url",
        "label": "云猫码网关",
        "required": true,
        "default": "https://m.ooeao.com/xpay/epay/mapi.php"
      },
      {
        "name": "merchantId",
        "type": "string",
        "label": "商户 ID",
        "required": true
      },
      {
        "name": "merchantKey",
        "type": "password",
        "label": "商户密钥",
        "required": true,
        "secret": true
      },
      {
        "name": "paymentType",
        "type": "select",
        "label": "支付方式",
        "required": true,
        "default": "wxpay",
        "values": [
          "wxpay",
          "alipay",
          "qqpay"
        ]
      }
    ]
  },
  "contributes": {
    "paymentProviders": [
      {
        "id": "cloudcat-epay",
        "label": "云猫码支付",
        "icon": "brand:cloudcat-pay",
        "checkoutMode": "redirect",
        "identityFields": [
          "merchantId"
        ],
        "expiryPolicy": {
          "defaultMinutes": 30,
          "minMinutes": 5,
          "maxMinutes": 1440
        },
        "notificationSuccess": {
          "status": 200,
          "contentType": "text/plain; charset=utf-8",
          "body": "success"
        },
        "notificationFailure": {
          "status": 400,
          "contentType": "text/plain; charset=utf-8",
          "body": "failure"
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
