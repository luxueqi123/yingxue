package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"strings"

	"infinite-canvas/backend/internal/protocol"

	_ "golang.org/x/image/webp"
)

type providerResponseByteLimitContext struct{}

// Prepare immutable bytes in the host so a URL cannot change after inspection.
// Only providers explicitly declaring inputImages use this path.
func prepareProtocolInputImages(ctx context.Context, config providerConfig, request protocol.GenerationRequest, requirements *protocol.ImageInputRequirements) (protocol.GenerationRequest, error) {
	prepared := request
	prepared.Images = append([]protocol.MediaReference(nil), request.Images...)
	for i, ref := range request.Images {
		var raw []byte
		var declared string
		var err error
		if ref.DataURL != "" {
			header, encoded, ok := strings.Cut(ref.DataURL, ",")
			if !ok || !strings.HasPrefix(header, "data:") || !strings.HasSuffix(header, ";base64") {
				return request, fmt.Errorf("参考图%d的内嵌数据格式无效", i+1)
			}
			if len(encoded) > base64.StdEncoding.EncodedLen(int(requirements.MaxBytes)) {
				return request, fmt.Errorf("参考图%d超过%d字节限制", i+1, requirements.MaxBytes)
			}
			declared, raw, err = decodeProviderDataURL(ref.DataURL)
		} else {
			bounded := context.WithValue(ctx, providerResponseByteLimitContext{}, requirements.MaxBytes)
			raw, declared, err = getProviderExternalBinary(withProviderRequestKind(bounded, "download"), config, ref.URL)
		}
		if err != nil {
			if ctx.Err() != nil {
				return request, ctx.Err()
			}
			// External read errors can contain signed addresses; do not return them.
			return request, fmt.Errorf("参考图%d读取失败，请检查数据、地址和出站策略", i+1)
		}
		if len(raw) == 0 || int64(len(raw)) > requirements.MaxBytes {
			return request, fmt.Errorf("参考图%d为空或超过%d字节限制", i+1, requirements.MaxBytes)
		}
		info, format, err := image.DecodeConfig(bytes.NewReader(raw))
		if err != nil {
			return request, fmt.Errorf("参考图%d无法解析实际图片格式和尺寸", i+1)
		}
		allowed := false
		for _, candidate := range requirements.Formats {
			allowed = allowed || candidate == format
		}
		if !allowed {
			return request, fmt.Errorf("参考图%d实际格式不受当前协议支持", i+1)
		}
		mimeType := "image/" + format
		declared = strings.ToLower(strings.TrimSpace(strings.Split(declared, ";")[0]))
		if declared != "" && declared != "application/octet-stream" && declared != mimeType {
			return request, fmt.Errorf("参考图%d的MIME与实际格式不一致", i+1)
		}
		if info.Width <= 0 || info.Height <= 0 || min(info.Width, info.Height) < requirements.MinShortSide {
			return request, fmt.Errorf("参考图%d实际短边小于%d像素", i+1, requirements.MinShortSide)
		}
		aspectRatio := float64(info.Width) / float64(info.Height)
		if requirements.MinAspectRatio > 0 && (aspectRatio < requirements.MinAspectRatio || aspectRatio > requirements.MaxAspectRatio) {
			return request, fmt.Errorf("参考图%d实际宽高比需在%g至%g之间", i+1, requirements.MinAspectRatio, requirements.MaxAspectRatio)
		}
		metadata := make(map[string]any, len(ref.Metadata)+3)
		for key, value := range ref.Metadata {
			metadata[key] = value
		}
		metadata["bytes"], metadata["width"], metadata["height"] = len(raw), info.Width, info.Height
		ref.DataURL, ref.URL, ref.MIMEType, ref.Metadata = dataURL(mimeType, raw), "", mimeType, metadata
		prepared.Images[i] = ref
	}
	prepared.Inputs = append([]protocol.MediaReference(nil), prepared.Images...)
	prepared.Inputs = append(prepared.Inputs, request.Videos...)
	prepared.Inputs = append(prepared.Inputs, request.Audios...)
	return prepared, nil
}
