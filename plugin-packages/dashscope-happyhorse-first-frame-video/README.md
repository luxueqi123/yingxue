# HappyHorse 1.0 / 1.1 首帧生视频

通过影策`yingce.plugin/v2`声明式Provider接入官方`happyhorse-1.0-i2v`与`happyhorse-1.1-i2v`。这是首帧单图接口，与多参考包相互独立；不包含脚本、Worker、页面或数据库迁移。

架构依据：[《影策插件架构与接入说明》](https://my.feishu.cn/docx/HPePdtuGoosbKhxF950crh5fnpb)，revision20，第6、7、8、12、13、14、15章。线协议依据：[阿里云HappyHorse首帧接口](https://help.aliyun.com/en/model-studio/happyhorse-image-to-video-api-reference)。

需要支持受控`$hasHan`与`inputImages`宽高比例检查的更新宿主。安装成功不能证明旧宿主执行了新增约束，必须核对宿主版本、包SHA及真实运行证据。API Key仅从既有渠道配置读取，端点、模型和Key必须在同一地区。默认北京公共域仍由官方支持。

本地合同测试、源码打包、当前运行安装、真实生成、完整案例和生产分别验收；未有回执的项目保持待验。

原1.0源节点必须选择1.0模型，原1.1源节点必须选择1.1模型；本包不证明原私有服务默认值或生成效果等价。地域入口优先使用官方业务空间专属域。
