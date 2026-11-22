# 火山字幕与文本擦除

本包按影策yingce.plugin/v2声明式Provider接入火山MediaKit精细化擦除。原视频与明确的Subtitle/Text模式原样提交，不增加Worker、页面、路由或数据库。

架构唯一依据：[《影策插件架构与接入说明》](https://my.feishu.cn/docx/HPePdtuGoosbKhxF950crh5fnpb)，revision20第6、7、8、12、13、14章。
线协议：[精细化擦除API](https://docs.volcengine.com/docs/6448/2372084)。标准版不支持mode，不能替代Text模式。

API Key仅从既有渠道读取；安装或本地测试不是实际生成、版权、全片或部署验收。

1.0.1保留原显式框选坐标；未框选时保持原模式默认，不擅自新增区域。
