# AutoDL H3 多图参考生视频

此插件接入 AutoDL ComfyUI 工作流市场中的 `minimax_h3_lightx2v_v5`，即“H3多图参考生视频”。它不是 MiniMax 官方 `/v2/video_generation` 协议，也不是普通 ComfyUI 本机 `/prompt` 接口；创建和查询都必须走 AutoDL 的托管工作流 API。

现有 H3 系统模型使用的 `autodl-h3-video` 由宿主内置适配器执行。插件注册表在启动和重载时均保留该适配器，不需要重新安装插件、切换渠道或填写密钥。下文以多图参考工作流为例；其他已接入工作流的图片、音频、时长和分辨率边界以 `AutoDLH3Workflows` 的逐项声明为准。

## 接口与鉴权

{{OPERATIONS}}

```http
POST {channel_base_url}/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v_v5
GET  {channel_base_url}/api/v1/comfyui/comfyui_workflow/result/{task_id}
Authorization: <AUTODL_COMFYUI_TOKEN>
Content-Type: application/json
```

Base URL 填写 `https://autodl.art`。AutoDL 明确要求 `Authorization` 的值直接等于 ComfyUI 分组令牌，不能添加 `Bearer ` 前缀。令牌应在 AutoDL 的令牌管理页创建并选择 `ComfyUI` 分组；映雪只在后端出网请求中使用令牌，不把它写入浏览器 URL、任务正文、日志或插件文档。

## 模型与工作流约束

渠道模型标识必须填写 `minimax_h3_lightx2v_v5`。该工作流要求 1–9 张参考图片，第一张映射为必填的 `ref_image_0`，其余图片依次映射到可选的 `ref_image_1` 至 `ref_image_8`。参考图必须是 AutoDL 能直接下载的 HTTP(S) 公网 URL；本地路径、需要 Cookie 的地址、裸 Base64 和只有当前浏览器能访问的 Blob URL 都不能提交。

内置适配器声明 `RequiresPublicMediaURLs`，由宿主在校验素材归属后，把资源引用转换为临时签名的公开读取地址，再传入工作流；任务和原始素材记录继续保留资源 ID，不持久化临时签名 URL。启动与插件重载共用此准备流程，图片和音频都适用。

视频时长为 1–10 秒整数，默认 5 秒。分辨率支持 480p、768p、1080p，并结合画幅转换为 AutoDL 的九个枚举值：竖屏、横屏和 1:1。当前映雪能力面板只展示 `9:16`、`16:9`、`1:1`，避免把上游没有声明的比例误传给工作流。

内置 `autodl-h3-video` 适配器按所选工作流的 `Resolutions` 和 `Ratios` 校验后才组装请求；不同工作流不共用最大规格。明确传入的 `adaptive`、`3:4`、`4:3` 或未声明分辨率会返回错误，不再近似为横屏／竖屏或降为 768p。仅省略分辨率／画幅时保留 768p／16:9 默认值。此规则属于内置适配器，不代表独立声明式 `autodl-comfyui` 插件已完成同样校验，也不证明原案例 H3 模型与该工作流效果等价。

AutoDL 公共工作流详情会返回 480p、768p、1080p 的实时计费配置，其中低谷优惠属于 AutoDL 活动，不是映雪站内定价。映雪不会把“一分钱一秒”写成渠道单价或用户余额规则；最终扣费、优惠时段和活动有效性必须以 AutoDL 任务提交时的账户账单为准。

## 参数与字段映射

{{PARAMETERS}}

示例请求：

```json
{
  "prompt": "保持人物外观一致，缓慢转身看向镜头",
  "duration": 5,
  "resolution": "768p竖",
  "ref_image_0": "https://example.com/character-front.png",
  "ref_image_1": "https://example.com/character-side.png"
}
```

未连接的可选参考图字段不会以 `null` 发送。当前站内视频面板没有独立 Seed 控件，因此插件默认不发送 `seed`；若以后增加经过校验的 Seed 参数，应限制在工作流公开范围内并补请求测试。

## 查询、文件与结果

创建响应从 `data.task_id` 读取任务 ID，`QUEUED` 和 `RUNNING` 分别归一化为等待和处理中。查询成功后从 `data.results[]` 提取 `type=video` 的 URL。AutoDL 返回的媒体 URL 可能过期，映雪在任务成功后立即下载，再通过既有 GenerationTask 素材流程保存，不能只把临时链接当作永久资产。

如果 HTTP 状态失败、顶层 `code` 不是 `Success`、响应缺少 `data`、创建未返回任务 ID，或完成状态没有视频 URL，任务会按真实错误结束，不伪造成功结果。内置适配器还按各自合同支持文生视频、首尾帧、15 秒多图及音频参考工作流，不将它们映射为同一个通用多图请求。当前不支持上游取消和回调。

## 官方资料

- [AutoDL ComfyUI 工作流 API](https://www.autodl.art/docs/comfyui_api/)
- [AutoDL ComfyUI API 在线调用](https://www.autodl.art/docs/comfyui_online/)
- [AutoDL ComfyUI 令牌管理](https://autodl.art/large-model/tokens)
- [H3 多图参考生视频工作流详情](https://autodl.art/api/v1/comfyui/workflows/minimax_h3_lightx2v_v5)

{{CONTRACT}}
