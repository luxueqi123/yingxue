# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
p = os.path.join(REPO, "backend/internal/app/analytics.go")
raw = open(p,"rb").read(); crlf = b"\r\n" in raw
t = raw.decode("utf-8").replace("\r\n","\n")

start = t.index('\t\tif details, ok := usage["input_tokens_details"].(map[string]any); ok {')
end   = t.index('\t\tif log.CachedTokens == 0 {\n\t\t\tlog.CachedTokens = firstInt64(usage, "cached_tokens", "cache_read_input_tokens", "prompt_cache_hit_tokens")\n\t\t}\n')
end  += len('\t\tif log.CachedTokens == 0 {\n\t\t\tlog.CachedTokens = firstInt64(usage, "cached_tokens", "cache_read_input_tokens", "prompt_cache_hit_tokens")\n\t\t}\n')

new = '''		// 缓存写入用量只在同一份 usage 明细完整时才可用：映雪账单依赖 strictUsageInteger
		// 的严格整数判定，任何一项缺失都必须保持"不可用"，不能用 0 冒充已读到的 0。
		hasInputDetails := false
		if details, ok := usage["input_tokens_details"].(map[string]any); ok {
			hasInputDetails = true
			log.CachedTokens = firstInt64(details, "cached_tokens", "cache_read_input_tokens")
			log.CacheWriteTokens, log.CacheWriteTokensAvailable = strictUsageInteger(details["cache_write_tokens"])
			_, validInput := strictUsageInteger(usage["input_tokens"])
			_, validOutput := strictUsageInteger(usage["output_tokens"])
			_, validCached := strictUsageInteger(details["cached_tokens"])
			log.CacheWriteTokensAvailable = log.CacheWriteTokensAvailable && validInput && validOutput && validCached
		}
		if details, ok := usage["prompt_tokens_details"].(map[string]any); ok {
			if !hasInputDetails {
				log.CacheWriteTokens, log.CacheWriteTokensAvailable = strictUsageInteger(details["cache_write_tokens"])
				_, validInput := strictUsageInteger(usage["prompt_tokens"])
				_, validOutput := strictUsageInteger(usage["completion_tokens"])
				_, validCached := strictUsageInteger(details["cached_tokens"])
				log.CacheWriteTokensAvailable = log.CacheWriteTokensAvailable && validInput && validOutput && validCached
			}
			if log.CachedTokens == 0 {
				log.CachedTokens = firstInt64(details, "cached_tokens", "cache_read_input_tokens")
			}
		}
		if log.CachedTokens == 0 {
			log.CachedTokens = firstInt64(usage, "cached_tokens", "cache_read_input_tokens", "prompt_cache_hit_tokens")
		}
'''
t = t[:start] + new + t[end:]
d = t.encode("utf-8")
if crlf: d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge", p)
print("ok")
