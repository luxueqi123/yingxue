# HappyHorse 1.0 / 1.1 参考生视频

本包通过影策 `yingce.plugin/v2` 声明式 Provider 接入 `happyhorse-1.0-r2v`与`happyhorse-1.1-r2v`，不包含页面、Worker 或新服务。

架构依据：[《影策插件架构与接入说明》](https://my.feishu.cn/docx/HPePdtuGoosbKhxF950crh5fnpb) revision 20，第 6、12、13、14 章。线协议依据：[阿里云 HappyHorse reference-to-video](https://help.aliyun.com/en/model-studio/happyhorse-reference-to-video-api-reference)。

API Key 仅由既有渠道配置提供。默认 Base URL 是官方仍支持的北京公共域；使用工作空间专属域时须保持模型、API Key 与端点地区一致。1.0.3包需要支持受控`$hasHan`表达式及`inputImages`声明的更新宿主；宿主检查实际参考图字节／尺寸，再提交同一原字节，不信任自报大小和尺寸，也不改图。正文按Unicode字符检查上限并拒绝自动截断；运行版本与包SHA须另行核验，真实生成和生产仍待验收。

请求参数、参考图限制、状态与未验收范围见 [接口说明](docs/interface.md)。


原1.0源节点必须选择1.0模型，原1.1源节点必须选择1.1模型；本包不证明原私有服务默认值或生成效果等价。地域入口优先使用官方业务空间专属域。
