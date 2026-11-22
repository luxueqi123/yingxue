package app

// 声明式协议插件宿主与接口类型校验。

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/protocol"
)

// runDeclarativeProtocolTask 是 JSON manifest 插件的宿主运行时。
// manifest 只能描述请求/响应映射；凭证、出站安全策略、轮询和结果下载必须由宿主统一掌握，
// 这样插件不能绕过服务端的鉴权、超时和 SSRF 防护边界。
func runDeclarativeProtocolTask(ctx context.Context, input canvasGenerationInput) (map[string]interface{}, error) {
	adapter, ok := declarativeProtocolAdapterForContext(ctx, input.Config.InterfaceType)
	if !ok {
		return nil, fmt.Errorf("接口类型 %s 未安装声明式适配器", input.Config.InterfaceType)
	}
	if input.Mode == "audio" && (input.Config.AudioMode == "unified_edit" || input.Config.AudioMode != "tts" && len(input.ReferenceAudios) > 0) && len(input.ReferenceAudios) == 0 {
		return nil, errors.New("全能配音需要连接参考音频；请检查音频是否已连接，或切换为文本朗读")
	}
	return runProtocolAdapterTask(ctx, input, adapter)
}

func runProtocolAdapterTask(ctx context.Context, input canvasGenerationInput, adapter protocol.Adapter) (map[string]interface{}, error) {
	return runProtocolAdapterTaskWithPolicy(ctx, input, adapter, declarativeProtocolPollPolicy(input.Mode))
}

func declarativeProtocolPollPolicy(mode string) videoPollPolicy {
	if mode == "video" {
		return defaultVideoPollPolicy()
	}
	return videoPollPolicy{
		Interval:            2500 * time.Millisecond,
		MaxNotFoundMisses:   1,
		MaxDownloadTries:    3,
		TransientRetryLimit: asyncPollTransientRetries(),
		Sleep:               sleepContext,
	}
}

func runProtocolAdapterTaskWithPolicy(ctx context.Context, input canvasGenerationInput, adapter protocol.Adapter, policy videoPollPolicy) (map[string]interface{}, error) {
	// create、poll、download 是同一个外部任务的三个阶段：任一阶段失败都向上返回真实错误，
	// 不把“已提交但结果未知”伪装成成功，也不把下载失败降级成空结果。
	request := protocolRequestFromInput(input)
	taskID := resumedProviderRequestID(ctx)
	detached := protocolDetachedPolling(adapter, input.Mode)
	createdStage := ""
	createdProviderTask := false
	uploader, needsUpload := adapter.(protocol.UploadAdapter)
	var uploadTask *model.Task
	var uploadState *providerUploadCheckpoint
	var uploadService *Service
	uploadDigest := ""
	if needsUpload {
		metadata, _ := ctx.Value(providerAnalyticsKey{}).(providerAnalyticsContext)
		if metadata.Service == nil || metadata.TaskID == "" || metadata.UserID == "" {
			return nil, errors.New("原片上传需要持久任务上下文")
		}
		uploadService = metadata.Service
		var err error
		uploadTask, err = uploadService.repo.Task(metadata.TaskID)
		if err != nil {
			return nil, err
		}
		if uploadTask.UserID != metadata.UserID || uploadTask.LeaseOwner != metadata.LeaseOwner || uploadTask.Status != model.TaskStatusRunning {
			return nil, errors.New("原片上传任务归属或租约不匹配")
		}
		if uploadTask.LeaseOwner != "" && (uploadTask.LeaseExpiresAt == nil || !uploadTask.LeaseExpiresAt.After(time.Now())) {
			return nil, errors.New("原片上传任务租约已过期")
		}
		if uploadTask.ProviderRequestID == "" {
			receiptID, err := uploadService.repo.ProviderUploadReceipt(uploadTask)
			if err != nil {
				return nil, err
			}
			uploadTask.ProviderRequestID = receiptID
		}
		taskID = uploadTask.ProviderRequestID
		digestBody, err := json.Marshal(struct {
			BaseURL string
			Request protocol.GenerationRequest
		}{input.Config.BaseURL, request})
		if err != nil {
			return nil, err
		}
		digest := sha256.Sum256(digestBody)
		uploadDigest = hex.EncodeToString(digest[:])
		uploadState, err = uploadService.loadProviderUploadCheckpoint(uploadTask, input.Config.InterfaceType, uploadDigest)
		if err != nil {
			return nil, err
		}
		if uploadState != nil {
			taskID = uploadState.ProviderID
		}
		if taskID != "" && uploadState == nil {
			recoverer, ok := adapter.(protocol.UploadRecoveryAdapter)
			if !ok {
				return nil, errors.New("已创建的视频任务缺少上传恢复状态，不能直接轮询或重复创建")
			}
			poll := protocol.PollContext{BaseURL: input.Config.BaseURL, Model: request.Model, Request: request, TaskID: taskID}
			spec, err := adapter.BuildPoll(ctx, poll)
			if err != nil {
				return nil, err
			}
			body, err := executeProtocolRequest(withProviderRequestKind(ctx, "poll"), input.Config, spec)
			if err != nil {
				return nil, err
			}
			targets, err := recoverer.RecoverUploads(ctx, poll, body)
			if err != nil {
				return nil, err
			}
			accepted, err := uploader.ParseUploadedVideos(ctx, poll, body)
			if err != nil {
				return nil, err
			}
			uploadState = &providerUploadCheckpoint{TaskID: uploadTask.ID, UserID: uploadTask.UserID, ProviderID: taskID, InterfaceType: input.Config.InterfaceType, InputDigest: uploadDigest, Next: accepted}
			for _, target := range targets {
				uploadState.Targets = append(uploadState.Targets, providerUploadTarget{URL: target.URL, VideoIndex: target.VideoIndex})
			}
			if err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
				return nil, err
			}
		}
	}
	var created protocol.CreateResult
	if taskID == "" {
		plan, err := prepareDramaReferencePlan(input, request, adapter.Metadata())
		if err != nil {
			return nil, err
		}
		// 幂等键只存在于宿主请求元数据中，声明式插件可以把它映射到 Header，
		// 但不能把宿主控制字段泄漏到供应商 JSON body。恢复已有 taskID 时不会进入 create 分支。
		key, _ := ctx.Value(providerSubmissionKeyContext{}).(string)
		if key == "" {
			key = uuid.NewString()
		}
		request.Extra["idempotencyKey"] = key
		if err := uploadProtocolMedia(ctx, input, adapter, &request); err != nil {
			return nil, err
		}
		spec, err := adapter.BuildCreate(ctx, protocol.RequestContext{BaseURL: input.Config.BaseURL, Request: request})
		if err != nil {
			return nil, err
		}
		if requirements := adapter.Metadata().InputImages; requirements != nil {
			request, err = prepareProtocolInputImages(ctx, input.Config, request, requirements)
			if err != nil {
				return nil, err
			}
			spec, err = adapter.BuildCreate(ctx, protocol.RequestContext{BaseURL: input.Config.BaseURL, Request: request})
			if err != nil {
				return nil, err
			}
		}
		if err := plan.compile(request, &spec, input.VideoCapability); err != nil {
			return nil, err
		}
		if err := validateMediaTransportRequest(spec, input); err != nil {
			return nil, err
		}
		// 文本任务的创建与结果在同一次请求完成。宿主已知线格式（Chat Completions /
		// Responses / Messages）交给 executeProtocolCreateRequest：它负责流式 SSE 解析与
		// 增量推送，非流式走普通请求；否则下游 ParseCreate 会把 SSE 原始字节当 JSON 解析。
		if input.Mode == "text" {
			return finishDeclarativeTextCreate(ctx, input, adapter, request, spec, policy)
		}
		var body []byte
		created, body, err = submitProtocolMediaTask(ctx, input, adapter, request, spec)
		if err != nil {
			return nil, err
		}
		taskID = created.TaskID
		if created.Status == protocol.StatusFailed || created.Status == protocol.StatusCancelled {
			return nil, protocolTaskFailure(ctx, created.Status, created.Message, taskID)
		}
		stage := created.Stage
		if created.Status == protocol.StatusSucceeded {
			// 已完成但还没有媒体：能按任务 ID 回查时转入轮询，在宽限期内等媒体地址。
			canPoll := taskID != "" && strings.TrimSpace(adapter.Metadata().Poll) != ""
			if protocolResultReady(input.Mode, created.Result, adapter) || !canPoll {
				result, err := finishProtocolAdapterResult(ctx, input, adapter, request, taskID, created.Result, policy)
				if !canPoll || !errors.Is(err, errProtocolResultNotReady) {
					return result, err
				}
			}
			stage = firstNonEmpty(stage, protocolLateResultStage)
		}
		if taskID == "" {
			return nil, errors.New("声明式协议创建请求没有返回任务 ID")
		}
		if needsUpload {
			targets, err := uploader.BuildUploads(ctx, protocol.RequestContext{BaseURL: input.Config.BaseURL, Request: request}, body)
			if err != nil {
				return nil, err
			}
			uploadState = &providerUploadCheckpoint{TaskID: uploadTask.ID, UserID: uploadTask.UserID, ProviderID: taskID, InterfaceType: input.Config.InterfaceType, InputDigest: uploadDigest}
			for _, target := range targets {
				if target.VideoIndex < 0 || target.VideoIndex >= len(request.Videos) {
					return nil, errors.New("上传视频引用不存在")
				}
				uploadState.Targets = append(uploadState.Targets, providerUploadTarget{URL: target.URL, VideoIndex: target.VideoIndex})
			}
			if err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
				return nil, err
			}
		}
		createdStage = stage
		createdProviderTask = true
	}
	// 原片上传与轮询是同一个外部任务的两段：恢复时既不重建任务，也不重复上传已接收的分片。
	// 上传完成前不进轮询循环，避免上游在素材未就绪时把任务判失败。
	if needsUpload {
		if !createdProviderTask && uploadState.Next < len(uploadState.Targets) {
			poll := protocol.PollContext{BaseURL: input.Config.BaseURL, Model: request.Model, Request: request, TaskID: taskID}
			spec, err := adapter.BuildPoll(ctx, poll)
			if err != nil {
				return nil, err
			}
			body, err := executeProtocolRequest(withProviderRequestKind(ctx, "poll"), input.Config, spec)
			if err != nil {
				return nil, err
			}
			accepted, err := uploader.ParseUploadedVideos(ctx, poll, body)
			if err != nil {
				return nil, err
			}
			if accepted < uploadState.Next || accepted > len(uploadState.Targets) {
				return nil, errors.New("供应商上传进度与本地记录冲突")
			}
			if recovery, ok := adapter.(protocol.UploadRecoveryAdapter); ok {
				targets, err := recovery.RecoverUploads(ctx, poll, body)
				if err != nil {
					return nil, err
				}
				if len(targets) != len(uploadState.Targets) {
					return nil, errors.New("供应商恢复上传数量与原片不匹配")
				}
				uploadState.Targets = make([]providerUploadTarget, len(targets))
				for index, target := range targets {
					uploadState.Targets[index] = providerUploadTarget{URL: target.URL, VideoIndex: target.VideoIndex}
				}
				uploadState.Next = accepted
				if err := uploadService.persistProviderUploadCheckpoint(uploadTask, *uploadState, true); err != nil {
					return nil, err
				}
			} else if accepted > uploadState.Next {
				uploadState.Next = accepted
				if err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
					return nil, err
				}
			}
		}
		for uploadState.Next < len(uploadState.Targets) {
			target := uploadState.Targets[uploadState.Next]
			if target.VideoIndex < 0 || target.VideoIndex >= len(request.Videos) {
				return nil, errors.New("恢复上传的视频引用不存在")
			}
			if err := putProtocolMediaUpload(ctx, input.Config, target.URL, request.Videos[target.VideoIndex]); err != nil {
				return nil, err
			}
			uploadState.Next++
			if err := uploadService.saveProviderUploadCheckpoint(uploadTask, *uploadState); err != nil {
				return nil, err
			}
		}
	}

	if detached {
		if createdProviderTask {
			if err := recordProtocolProviderTask(ctx, taskID); err != nil {
				return nil, fmt.Errorf("上游已接收任务，但保存任务 ID 失败：%w", err)
			}
			return nil, detachedProtocolPending(taskID, createdStage, created.QueueAhead)
		}
		policy.InitialDelay = 0
	}
	var lateResult protocolLateResultWait
	return runVideoPollLoop(ctx, taskID, policy, func(ctx context.Context) (videoPollOutcome, error) {
		state, err := pollProtocolTask(ctx, input.Config, adapter, request, taskID)
		if err != nil {
			return videoPollOutcome{}, err
		}
		switch state.Status {
		case protocol.StatusSucceeded:
			// 分离式任务也留在本 worker 内等：退回调度后每次回查都会重新计时，宽限期永远用不完。
			if !protocolResultReady(input.Mode, state.Result, adapter) && lateResult.keepWaiting(time.Now()) {
				return videoPollOutcome{}, nil
			}
			result, err := finishProtocolAdapterResult(ctx, input, adapter, request, taskID, state.Result, policy)
			if errors.Is(err, errProtocolResultNotReady) && lateResult.keepWaiting(time.Now()) {
				return videoPollOutcome{}, nil
			}
			return videoPollOutcome{Done: err == nil, Result: result}, err
		case protocol.StatusFailed, protocol.StatusCancelled:
			return videoPollOutcome{}, protocolTaskFailure(ctx, state.Status, state.Message, taskID)
		}
		if detached {
			return videoPollOutcome{}, detachedProtocolPending(taskID, state.Stage, state.QueueAhead)
		}
		return videoPollOutcome{}, nil
	})
}

func extractProviderTaskID(body []byte) (string, error) {
	var payload map[string]interface{}
	if json.Unmarshal(body, &payload) != nil {
		return "", nil
	}
	id, err := firstJSONString(payload, "id", "task_id", "taskId", "request_id", "requestId", "name")
	if id != "" {
		return id, nil
	}
	if data, ok := payload["data"].(map[string]interface{}); ok {
		nested, nestedErr := firstJSONString(data, "id", "task_id", "taskId", "request_id", "requestId")
		if nested != "" {
			return nested, nil
		}
		if nestedErr != nil {
			return "", nestedErr
		}
	}
	return "", err
}

// queryProtocolAdapterVideoTask 只读取一次已有的声明式 Provider 任务。
// 人工恢复走此路径，因此检查本地失败任务时绝不会创建第二个计费任务。
func queryProtocolAdapterVideoTask(ctx context.Context, input canvasGenerationInput, adapter protocol.Adapter, taskID string) (map[string]interface{}, string, error) {
	request := protocolRequestFromInput(input)
	state, err := pollProtocolTask(ctx, input.Config, adapter, request, taskID)
	if err != nil {
		return nil, "", err
	}
	providerStatus := string(state.Status)
	switch state.Status {
	case protocol.StatusSucceeded:
		result, err := finishProtocolAdapterResult(ctx, input, adapter, request, taskID, state.Result, defaultVideoPollPolicy())
		return result, providerStatus, err
	case protocol.StatusFailed, protocol.StatusCancelled:
		return nil, providerStatus, protocolTaskFailure(ctx, state.Status, state.Message, taskID)
	case protocol.StatusPending, protocol.StatusProcessing:
		return nil, providerStatus, nil
	default:
		return nil, providerStatus, fmt.Errorf("声明式协议任务 %s 返回未知状态：%s", taskID, providerStatus)
	}
}

func pollProtocolTask(ctx context.Context, config providerConfig, adapter protocol.Adapter, request protocol.GenerationRequest, taskID string) (protocol.PollResult, error) {
	poll := protocol.PollContext{BaseURL: config.BaseURL, Model: request.Model, Request: request, TaskID: taskID}
	spec, err := adapter.BuildPoll(ctx, poll)
	if err != nil {
		return protocol.PollResult{}, err
	}
	receipt := protocolHTTPReceipt{parse: func(body []byte) (protocol.CreateResult, error) {
		state, err := adapter.ParsePoll(ctx, poll, body)
		if err == nil && state.TaskID != "" && state.TaskID != taskID {
			return protocol.CreateResult{}, errors.New("上游回查返回了不匹配的任务 ID，请核对原任务")
		}
		return protocol.CreateResult(state), err
	}}
	body, err := executeProtocolRequest(withProtocolHTTPReceipt(withProviderRequestKind(ctx, "poll"), &receipt), config, spec)
	if err != nil {
		return protocol.PollResult{}, err
	}
	state, err := receipt.decode(body)
	return protocol.PollResult(state), err
}

func validateGenerationInterface(mode string, interfaceType string) error {
	// Standalone callers (including legacy tests and migration tools) may not
	// have a Service/plugin runtime. Use the shipped declarative catalog first;
	// fall back to host builtins only when the package catalog is unavailable.
	registry := loadOfficialFallbackRegistry()
	if registry == nil {
		registry = protocol.Builtins()
	} else if _, ok := registry.Resolve(strings.TrimSpace(interfaceType)); !ok {
		// A deployment may ship only a subset of the optional plugin catalog.
		// Preserve the host-backed builtins for standalone validation instead of
		// reporting a false "not installed" error for those interfaces.
		if _, builtinOK := protocol.Builtins().Resolve(strings.TrimSpace(interfaceType)); builtinOK {
			registry = protocol.Builtins()
		}
	}
	return validateGenerationInterfaceWithRegistry(registry, mode, interfaceType)
}

func (s *Service) validateGenerationInterface(mode string, interfaceType string) error {
	return validateGenerationInterfaceWithRegistry(s.protocolRegistry(), mode, interfaceType)
}

func validateGenerationInterfaceWithRegistry(registry *protocol.Registry, mode string, interfaceType string) error {
	interfaceType = strings.TrimSpace(interfaceType)
	if interfaceType == "" {
		return nil
	}
	adapter, ok := registry.Resolve(interfaceType)
	if !ok {
		return fmt.Errorf("接口类型 %s 未安装", interfaceType)
	}
	metadata := adapter.Metadata()
	if !metadata.Enabled || metadata.UnavailableReason != "" {
		return fmt.Errorf("接口类型 %s 当前不可用：%s", interfaceType, metadata.UnavailableReason)
	}
	if mode != "" && !protocolCapabilityMatches(metadata, protocol.Capability(mode)) {
		return fmt.Errorf("接口类型 %s 不支持%s生成", interfaceType, mode)
	}
	return nil
}

func protocolCapabilityMatches(metadata protocol.Metadata, capability protocol.Capability) bool {
	for _, item := range metadata.Categories {
		if item == capability {
			return true
		}
	}
	return false
}

// finishDeclarativeTextCreate 执行声明式文本协议的创建请求并归一结果。
// 文本任务的创建与最终结果在同一次请求完成：流式走 SSE 解析（executeProtocolCreateRequest
// 内部处理），非流式走普通请求后按插件 response 映射解析。SSE 原始字节不能交给
// ParseCreate 当 JSON 解析（上游如 DeepSeek /anthropic 的 thinking 流只在宿主解析器里
// 才能还原出正文）。
func finishDeclarativeTextCreate(ctx context.Context, input canvasGenerationInput, adapter protocol.Adapter, request protocol.GenerationRequest, spec protocol.RequestSpec, policy videoPollPolicy) (map[string]interface{}, error) {
	data, streamedResult, err := executeProtocolCreateRequest(ctx, input, spec)
	if err != nil {
		return nil, err
	}
	// 流式由宿主解析器直接给出文本结果；创建即完成，立即归一。
	if streamedResult != nil {
		return finishProtocolResult(ctx, input.Config, input.Mode, "", streamedResult, policy)
	}
	var created protocol.CreateResult
	if parser, ok := adapter.(protocol.RequestAwareCreateParser); ok {
		created, err = parser.ParseCreateWithRequest(ctx, request, data)
	} else {
		created, err = adapter.ParseCreate(ctx, data)
	}
	if err != nil {
		return nil, err
	}
	taskID := created.TaskID
	if taskID == "" {
		extracted, extractErr := extractProviderTaskID(data)
		if extractErr != nil {
			return nil, extractErr
		}
		taskID = extracted
	}
	if created.Status == protocol.StatusFailed || created.Status == protocol.StatusCancelled {
		return nil, protocolTaskFailure(ctx, created.Status, created.Message, taskID)
	}
	// 文本任务创建即完成：Succeeded、或状态未识别但已解析出正文，直接归一结果。
	if created.Status == protocol.StatusSucceeded || (created.Result != nil && strings.TrimSpace(created.Result.Text) != "") {
		return finishProtocolResult(ctx, input.Config, input.Mode, taskID, created.Result, policy)
	}
	if taskID == "" {
		return nil, errors.New("声明式协议创建请求没有返回任务 ID")
	}
	// 创建已接受但正文未就绪：转入轮询等待结果。
	return nil, detachedProtocolPending(taskID, created.Stage, created.QueueAhead)
}
