package app

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"

	"infinite-canvas/backend/internal/protocol"
)

type signedMediaUploadKey struct{}

// Signed storage uploads authenticate through the URL, never through model-channel credentials.
// The normal outbound client still enforces destination, redirect, cancellation and response limits.
func putProtocolMediaUpload(ctx context.Context, config providerConfig, uploadURL string, reference protocol.MediaReference) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	ctx = context.WithValue(ctx, signedMediaUploadKey{}, true)
	req, err := http.NewRequestWithContext(withProviderRequestKind(ctx, "upload"), http.MethodPut, uploadURL, nil)
	if err != nil {
		return errors.New("上传地址无效")
	}
	if req.URL.User != nil || req.URL.Fragment != "" {
		return errors.New("上传地址不能包含用户凭据或片段")
	}
	policy, loopback := providerLoopbackPolicyForRequest(req)
	if loopback {
		_, err = validateOutboundURLWithPolicy(uploadURL, policy)
	} else {
		_, err = ValidateOutboundURL(uploadURL)
	}
	if err != nil {
		return fmt.Errorf("上传目标不可用：%s", safeProviderLogError(err))
	}
	data, mimeType, err := protocolMediaBytes(ctx, config, reference)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return context.Canceled
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return context.DeadlineExceeded
		}
		return fmt.Errorf("读取待上传原片失败：%s", safeProviderLogError(err))
	}
	if len(data) == 0 {
		return errors.New("待上传原片为空")
	}
	req.Body = io.NopCloser(bytes.NewReader(data))
	req.ContentLength = int64(len(data))
	req.Header.Set("Content-Type", firstNonEmpty(mimeType, "application/octet-stream"))
	// No GetBody: a redirect must not replay media to another destination automatically.
	_, _, err = doBinary(req)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return context.Canceled
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return context.DeadlineExceeded
		}
		return fmt.Errorf("原片上传失败：%s", safeProviderLogError(err))
	}
	return nil
}
