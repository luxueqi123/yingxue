# MiniMax Hailuo 2.3 V1

按影策统一声明式Provider合同接入MiniMax官方V1单图视频接口。Provider ID为`minimax-video-v1`，模型仅`MiniMax-Hailuo-2.3`、`MiniMax-Hailuo-2.3-Fast`。V2 H3、源站o2别名、首尾帧及文生视频不属于本包。

版本1.0.0；需宿主支持response.metadata、result.validations和result.response。包内不携带代码、账号、渠道配置或密钥。上传与当前运行服务加载、真实生成和完整案例验收是独立步骤。

架构依据：[影策插件架构与接入说明](https://my.feishu.cn/docx/HPePdtuGoosbKhxF950crh5fnpb)第6/7/12/13/14/15章。供应商线协议见包内接口合同；不通过更换模型、改时长或隐式重提任务兜底。
