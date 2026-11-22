package paymentplugins

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	paymentsdk "infinite-canvas/backend/payment-sdk"
)

type missingRPCProvider struct{ Provider }

func (missingRPCProvider) QueryOrder(context.Context, Config, QueryRequest) (Result, error) {
	return Result{}, fmt.Errorf("wrapped: %w", ErrOrderNotFound)
}

func TestRPCPreservesMissingOrderCode(t *testing.T) {
	var output bytes.Buffer
	err := RunRPC(missingRPCProvider{}, strings.NewReader(`{"version":"yingce.payment/v1","operation":"query_order","request":{}}`), &output)
	if err != nil {
		t.Fatal(err)
	}
	var response rpcResponse
	if err := json.Unmarshal(output.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.OK || response.Code != paymentsdk.RPCCodeOrderNotFound {
		t.Fatalf("missing order RPC = %#v", response)
	}
}
