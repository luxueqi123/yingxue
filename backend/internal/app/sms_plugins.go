package app

import (
	"infinite-canvas/backend/internal/protocol"
	"infinite-canvas/backend/internal/sms"
)

var systemSMSPolicies = map[string]PluginManagementView{
	sms.PluginAliyun:  {Origin: PluginOriginSystem, Kind: "sms", ActivationScope: PluginScopeSystem, ConfigurationScope: PluginConfigurationSystem},
	sms.PluginTencent: {Origin: PluginOriginSystem, Kind: "sms", ActivationScope: PluginScopeSystem, ConfigurationScope: PluginConfigurationSystem},
}

func bundledSMSPluginManifests() []protocol.Manifest {
	result := make([]protocol.Manifest, 0, 2)
	for _, p := range []struct{ ID, Provider, Name string }{{sms.PluginAliyun, sms.Aliyun, "阿里云短信"}, {sms.PluginTencent, sms.Tencent, "腾讯云短信"}} {
		providers := []protocol.ManifestSMSProvider{{ID: p.Provider, Label: p.Name}}
		version := "1.0.0"
		documentation := "使用 go-sms-sender v0.25.0 聚合库及受控传输扩展。发送受理不等于送达，不自动重试。"
		if p.Provider == sms.Aliyun {
			version = "1.0.1"
			providers = append(providers, protocol.ManifestSMSProvider{ID: sms.AliyunPNS, Label: "阿里云短信认证"})
			documentation += "\n\n短信认证使用号码认证服务 SendSmsVerifyCode 接口及系统赠送签名、模板。验证码由宿主生成并核验，仅保存 HMAC；不调用阿里云一键登录。"
		}
		result = append(result, protocol.Manifest{
			APIVersion: "yingce.plugin/v1",
			Metadata:   protocol.Metadata{ID: p.ID, Version: version, Name: p.Name, Vendor: p.Name, Enabled: false, Installable: true, Description: "系统短信插件；支持多渠道、场景模板和发送记录。凭据在短信渠道管理中配置。", Documentation: "# " + p.Name + "\n\n" + documentation},
			Surfaces:   []string{"settings"}, Runtime: protocol.ManifestRuntime{Backend: "host:sms-" + p.Provider, Web: "host"},
			Permissions: []string{"sms.send"}, Contributes: protocol.ManifestContributions{SMSProviders: providers},
		})
	}
	return result
}

func isSystemSMSPluginID(id string) bool { _, ok := systemSMSPolicies[id]; return ok }
