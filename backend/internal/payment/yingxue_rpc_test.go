package payment

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestRPCProviderPreservesMissingOrderIdentity(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Linux plugin executable")
	}
	for _, code := range []string{"payment_order_not_found", "cloudcat_query_rejected"} {
		t.Run(code, func(t *testing.T) {
			dir := t.TempDir()
			entry := filepath.Join(dir, "provider")
			program := "#!/bin/sh\nread request\nprintf '%s\\n' '{\"ok\":false,\"code\":\"" + code + "\",\"message\":\"not found\"}'\n"
			if err := os.WriteFile(entry, []byte(program), 0o700); err != nil {
				t.Fatal(err)
			}
			provider := &RPCProvider{command: entry, dir: dir}
			_, err := provider.QueryOrder(context.Background(), Config{}, QueryRequest{})
			if err == nil || errors.Is(err, ErrOrderNotFound) != (code == "payment_order_not_found") {
				t.Fatalf("RPC error identity: %v", err)
			}
		})
	}
}
