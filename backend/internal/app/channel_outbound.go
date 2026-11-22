package app

import (
	"net/http"
	"net/url"
	"time"
)

// Desktop loopback still requires the explicit runtime and per-channel grants.
func (s *Service) ValidateChannelOutboundURL(rawURL string, localPolicy ...bool) (*url.URL, error) {
	requested, customRelay := false, false
	if len(localPolicy) > 0 {
		requested = localPolicy[0]
	}
	if len(localPolicy) > 1 {
		customRelay = localPolicy[1]
	}
	return s.validateChannelOutboundURL(rawURL, requested, customRelay)
}

// OutboundHTTPClientForChannel 返回渠道专用的出站 HTTP 客户端。
// proxyURL 非空时使用渠道级代理（socks5/socks5h/http/https），否则回退到全局客户端。
func (s *Service) OutboundHTTPClientForChannel(timeout time.Duration, target *url.URL, proxyURL string, allowLocal ...bool) *http.Client {
	if len(allowLocal) > 0 && s.effectiveAllowLocalChannel(allowLocal[0]) && target != nil && isExactDesktopLoopbackHost(target.Hostname()) {
		return outboundHTTPClientWithPolicy(timeout, desktopLoopbackOutboundPolicy(nil))
	}
	return OutboundHTTPClientWithProxy(timeout, proxyURL)
}
