# 968 万相视频

## 官方资料

接口合同核对自渠道公告提供的魔方画布：https://mf.968968968.xyz/ 。目录接口已验证，成功成片尚未验证。

## 接口

创建：`POST /v1/videos/generations`；查询：`GET /v1/videos/generations/{request_id}`。使用Bearer鉴权和JSON正文。

## 参数

请求字段为model、prompt、duration、resolution、aspect_ratio、face_split=false、videoGenerateAudio。单图使用image.url，多图使用images对象数组；视频使用video_refs URL数组，音频使用audio_refs URL数组。素材需要公网可访问URL。

创建响应读取request_id；查询done读取video.url，failed/expired结束任务，其他状态继续查询原任务，不重复提交。

## 模型与计费

按秒渠道仅wan3.0-video；按次目录另有wan3.0-image，名称不代表它是图片生成模型。按秒输出4至15秒，按次最多30秒（渠道经用户确认）。具体能力由后台模型配置约束，不把30秒开放到按秒线路。

计费实现状态：普通按次、参考视频双倍、按秒生成加参考时长、缺失时长拒绝已有专项测试并已发布。按秒实际任务读取当前用户已上传的资源文件，通过服务端 ffprobe 测量时长；前端元数据仅用于预估报价。外部直链参考视频需先上传至映雪，无法核验则不扣费、不提交。生产容器已包含 ffprobe，参考素材探测只允许本地文件协议。

前台已开放按秒、按次两个逻辑模型，各有480P/720P/1080P三个价格档。已验证12组报价、4组越界时长拒绝和浏览器选择器。成功成片、播放下载及真实参考素材效果仍未验收。

{{OPERATIONS}}

{{PARAMETERS}}

{{CONTRACT}}
