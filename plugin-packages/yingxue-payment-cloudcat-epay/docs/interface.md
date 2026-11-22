## yingce.payment/v1

已实现 `validate_config`、`create_order`、`query_order` 和 `verify_notification`。异步通知同时接受 GET 与 POST，验签成功且订单、交易号、商户、支付方式、状态和金额全部匹配后，才交由宿主的幂等入账流程处理。

`query_order` 固定 POST 到 `https://m.ooeao.com/xpay/epay/api.php`，表单为 `act=order`、`pid`、`key`、`out_trade_no`。官方单查文档为 `/docs/epay/api/order_one.md`；POST 表单已用未支付诊断订单实测成功，密钥不进入 URL，所有重定向均拒绝。响应上限 256 KiB；必须 HTTP 成功且 `code=1`，校验商户、商户订单号、平台交易号、支付方式及精确到分的正数金额。仅 `status=1` 表示支付成功，`status=0` 表示未支付；缺字段、未知状态或非法响应均拒绝。返回币种为 CNY，宿主继续核对原订单金额与支付方式并执行幂等入账。

2026-09-06 实测未创建成功的订单查单返回 HTTP 200、`{"code":0,"msg":"没有找到订单信息"}`。仅此精确 code 与 msg 组合映射 `ErrOrderNotFound`，供宿主重新创建支付收银台；认证失败、缺少 code、其他错误码或不同提示均保持错误，不当作未支付或订单不存在。

查单响应没有公开签名字段，真实性依赖固定官方 HTTPS 和禁止重定向；不会伪称响应已验签。真实已支付响应及入账仍需端到端验收。`close_order` 和 `download_trade_bill` 当前显式返回不支持，因为尚无经过真实响应验证的云猫码合同。

`create_order` 返回 `qr_code` 模式；官方 `payurl`、`redirect` 或 `img` 链接通过原有 HTTPS 与官方域名校验后原样作为二维码值。宿主在站内展示二维码，不自动打开桌面外部收银台。签名、通道、金额与通知校验不受展示模式影响。

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
        "label": "历史订单默认支付方式",
        "required": true,
        "default": "wxpay",
        "values": [
          "wxpay",
          "alipay",
          "qqpay"
        ]
      },
      {
        "name": "alipayChannelId",
        "type": "string",
        "label": "支付宝经营码通道 ID",
        "required": true
      },
      {
        "name": "wechatRewardChannelId",
        "type": "string",
        "label": "微信打赏码通道 ID",
        "required": true
      },
      {
        "name": "wechatPersonalChannelId",
        "type": "string",
        "label": "个人微信码通道 ID",
        "required": true
      }
    ]
  },
  "contributes": {
    "paymentProviders": [
      {
        "id": "cloudcat-epay",
        "label": "云猫码支付",
        "icon": "brand:cloudcat-pay",
        "checkoutMode": "qr_code",
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
