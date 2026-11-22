package canvas

import (
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"net/http"
	"time"
)

type canvasMutationReceiptResult struct {
	Summary UserDataSummary `json:"summary"`
}

func decodeCanvasMutationReceipt(raw string, result *UserDataSummary) error {
	var stored canvasMutationReceiptResult
	if err := json.Unmarshal([]byte(raw), &stored); err == nil && stored.Summary.ID != "" {
		*result = stored.Summary
		return nil
	}
	return errors.New("画布操作回执缺少有效结果")
}

// ApplyUserCanvasOperations applies only the objects changed by the caller to the
// latest server document. The request is idempotent by mutation ID and commits
// the canvas row plus its receipt in one database transaction.
func (s *Service) ApplyUserCanvasOperations(userID, canvasID string, req CanvasOperationsRequest) (UserDataSummary, error) {
	if canvasID == "" || len(canvasID) > 80 || req.MutationID == "" || len(req.MutationID) > 160 || len(req.Operations) == 0 || len(req.Operations) > 500 {
		return UserDataSummary{}, kernel.BadAuthRequest("画布操作请求 ID、操作内容或批次大小无效")
	}
	if req.BaseRevision != nil && (*req.BaseRevision < 0 || *req.BaseRevision >= 9007199254740991) {
		return UserDataSummary{}, kernel.BadAuthRequest("画布基线版本无效")
	}
	if len(req.EditProofs) > 500 {
		return UserDataSummary{}, kernel.BadAuthRequest("画布编辑凭据数量超出限制")
	}
	seenProofs := make(map[string]bool, len(req.EditProofs))
	for _, proof := range req.EditProofs {
		if proof.NodeID == "" || len(proof.NodeID) > 160 || proof.SessionID == "" || len(proof.SessionID) > 160 || proof.Token == "" || len(proof.Token) > 80 || seenProofs[proof.NodeID] {
			return UserDataSummary{}, kernel.BadAuthRequest("画布编辑凭据无效或重复")
		}
		seenProofs[proof.NodeID] = true
	}
	quota, err := s.host.CanvasQuotaCheck(userID)
	if err != nil {
		return UserDataSummary{}, err
	}
	digest := CanvasOperationsDigest(req)
	var result UserDataSummary
	err = s.host.WithStorageLock(func() error {
		return s.repo.Transaction(func(tx *repository.Repository) error {
			tx = tx.WithCanvasEditProofs(req.EditProofs)
			if err := tx.LockCanvasMutation(userID, canvasID); err != nil {
				return err
			}
			candidate := &model.CanvasMutationReceipt{ID: kernel.NewID(), UserID: userID, CanvasID: canvasID, MutationID: req.MutationID, PayloadDigest: digest}
			created, err := tx.TryCreateCanvasMutationReceipt(candidate)
			if err != nil {
				return err
			}
			if !created {
				receipt, err := tx.CanvasMutationReceiptForUser(userID, canvasID, req.MutationID)
				if err != nil {
					return err
				}
				if receipt.PayloadDigest != digest {
					return canvasMutationError("canvas_mutation_id_reused", "同一画布请求 ID 对应的操作内容不一致")
				}
				if _, err := tx.CanvasProjectMetadata(userID, canvasID); errors.Is(err, gorm.ErrRecordNotFound) {
					return kernel.NotFound("画布不存在或已删除")
				} else if err != nil {
					return err
				}
				return decodeCanvasMutationReceipt(receipt.ResultJSON, &result)
			}
			existing, err := tx.CanvasProjectForUser(userID, canvasID)
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if errors.Is(err, gorm.ErrRecordNotFound) {
				existing = nil
			}
			isCreate := existing == nil
			if isCreate && (len(req.Operations) == 0 || req.Operations[0].Type != "create_canvas") {
				return kernel.NotFound("画布不存在或已删除")
			}
			if !isCreate {
				for _, operation := range req.Operations {
					if operation.Type == "create_canvas" {
						return canvasOperationConflict("画布 %q 已存在，不能重复创建", canvasID)
					}
				}
			}
			if req.BaseRevision != nil && *req.BaseRevision > 0 && isCreate {
				return canvasMutationError("canvas_invalid_base", "新画布不能使用已有版本作为基线")
			}
			now := time.Now().UTC()
			var payload map[string]json.RawMessage
			var operations []CanvasOperation
			if isCreate {
				create := req.Operations[0]
				if create.ID != "" && create.ID != canvasID {
					return kernel.BadAuthRequest("画布创建操作的 ID 与请求路径不一致")
				}
				payload = map[string]json.RawMessage{
					"id":           jsonRawValue(canvasID),
					"nodes":        json.RawMessage(`[]`),
					"connections":  json.RawMessage(`[]`),
					"chatSessions": json.RawMessage(`[]`),
				}
				for field, value := range create.Patch {
					if !allowedCanvasOperationField(field) {
						return kernel.BadAuthRequest(fmt.Sprintf("不支持的新画布字段: 字段 %q", field))
					}
					payload[field] = append(json.RawMessage(nil), value...)
				}
				operations = req.Operations[1:]
			} else {
				// 客户端的 beforeValue 来自 GET 返回的投影（title/projectId 等以数据库列为准），
				// 字段基线校验必须对同一份投影进行，否则 projectId 列为 "" 而 payload 缺省时会误判冲突。
				base, err := canvasProjectPayload(*existing)
				if err != nil {
					return err
				}
				if err := json.Unmarshal(base, &payload); err != nil {
					return err
				}
				operations = req.Operations
			}
			if err := applyCanvasOperations(payload, operations); err != nil {
				if errors.Is(err, ErrCanvasObjectMissing) || errors.Is(err, ErrCanvasOperationConflict) {
					return err
				}
				return kernel.BadAuthRequest(err.Error())
			}
			delete(payload, "revision")
			delete(payload, "remoteContentHash")
			payload["id"] = jsonRawValue(canvasID)
			payload["updatedAt"] = jsonRawValue(now)
			raw, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			if !req.TrustedServerMutation {
				if existing != nil {
					raw, err = New(tx, nil).repairPurgedCanvasMediaReferences(userID, json.RawMessage(existing.PayloadJSON), raw)
					if err != nil {
						return err
					}
				}
				guard := New(tx, nil)
				if err := guard.validateNewWorkspaceBindings(userID, existing, raw); err != nil {
					return err
				}
				if err := guard.ValidateCanvasMediaAssets(userID, raw); err != nil {
					return err
				}
			}
			project, err := canvasProjectFromJSONWithValidation(userID, raw, !req.TrustedServerMutation)
			if err != nil {
				return err
			}
			if project.ID != canvasID {
				return kernel.BadAuthRequest("画布 ID 与请求路径不一致")
			}
			if existing != nil {
				project.ID, project.CreatedAt, project.Revision, project.UpdatedAt = existing.ID, existing.CreatedAt, existing.Revision, now
			} else {
				project.CreatedAt, project.Revision, project.UpdatedAt = now, 0, now
			}
			var existingPayload string
			if existing != nil {
				existingPayload = existing.PayloadJSON
			}
			if err := quota(tx, existing == nil, int64(len(project.PayloadJSON)-len(existingPayload))); err != nil {
				return err
			}
			if err := SaveDocumentWithHistory(tx, existing, &project, "automatic"); err != nil {
				return err
			}
			result = UserDataSummary{ID: project.ID, Title: project.Title, CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt, Revision: project.Revision,
				SaveAudit: &CanvasSaveAudit{NodesBefore: canvasNodeCount(existingPayload), NodesAfter: canvasNodeCount(project.PayloadJSON)}}
			encoded, err := json.Marshal(canvasMutationReceiptResult{Summary: result})
			if err != nil {
				return err
			}
			candidate.ResultJSON, candidate.Revision = string(encoded), project.Revision
			return tx.FinalizeCanvasMutationReceipt(candidate)
		})
	})
	if errors.Is(err, ErrCanvasObjectMissing) {
		return UserDataSummary{}, canvasMutationError("canvas_object_missing", err.Error())
	}
	if errors.Is(err, ErrCanvasOperationConflict) {
		return UserDataSummary{}, canvasMutationError("canvas_field_conflict", err.Error())
	}
	if errors.Is(err, repository.ErrCanvasRevisionConflict) {
		retry := canvasMutationError("canvas_concurrent_write", "画布正在更新，将自动重放原请求")
		retry.Retryable = true
		return UserDataSummary{}, retry
	}
	if errors.Is(err, repository.ErrCanvasEditLease) {
		return UserDataSummary{}, canvasMutationError("canvas_edit_lease_conflict", err.Error())
	}
	return result, err
}

func canvasMutationError(reason kernel.ErrorReason, message string) *kernel.AppError {
	err := kernel.NewAppError(http.StatusConflict, message)
	err.Reason = reason
	return err
}
