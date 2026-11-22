package app

import (
	"encoding/json"
	"errors"
	"strings"

	"infinite-canvas/backend/internal/model"
)

// Only source indexes are stored; original media remains in the task input.
type providerUploadTarget struct {
	URL        string `json:"url"`
	VideoIndex int    `json:"videoIndex"`
}

type providerUploadCheckpoint struct {
	TaskID        string                 `json:"taskId"`
	UserID        string                 `json:"userId"`
	ProviderID    string                 `json:"providerId"`
	InterfaceType string                 `json:"interfaceType"`
	InputDigest   string                 `json:"inputDigest"`
	Next          int                    `json:"next"`
	Targets       []providerUploadTarget `json:"targets"`
}

func (s *Service) saveProviderUploadCheckpoint(task *model.Task, state providerUploadCheckpoint) error {
	return s.persistProviderUploadCheckpoint(task, state, false)
}

// Refresh is reserved for targets returned by the authenticated status request
// for this same provider task. Task, source indexes and progress remain bound.
func (s *Service) persistProviderUploadCheckpoint(task *model.Task, state providerUploadCheckpoint, refreshURLs bool) error {
	if state.TaskID != task.ID || state.UserID != task.UserID || state.ProviderID == "" || state.InterfaceType == "" || state.InputDigest == "" {
		return errors.New("上传恢复状态与任务不匹配")
	}
	if len(state.Targets) == 0 || len(state.Targets) > 16 || state.Next < 0 || state.Next > len(state.Targets) {
		return errors.New("上传恢复进度无效")
	}
	previous, err := s.loadProviderUploadCheckpoint(task, state.InterfaceType, state.InputDigest)
	if err != nil {
		return err
	}
	if previous != nil {
		if previous.ProviderID != state.ProviderID || previous.Next > state.Next || len(previous.Targets) != len(state.Targets) {
			return errors.New("上传恢复状态不能回退或更换任务")
		}
		for index, target := range previous.Targets {
			if target.VideoIndex != state.Targets[index].VideoIndex || (!refreshURLs && index >= previous.Next && target.URL != state.Targets[index].URL) {
				return errors.New("上传恢复目标不能中途替换")
			}
		}
	}
	state.Targets = append([]providerUploadTarget(nil), state.Targets...)
	for index := range state.Targets {
		if state.Targets[index].VideoIndex < 0 || (index >= state.Next && state.Targets[index].URL == "") {
			return errors.New("上传恢复来源无效")
		}
		if index < state.Next {
			state.Targets[index].URL = ""
		}
	}
	body, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if len(body) > 128*1024 {
		return errors.New("上传恢复状态超过限制")
	}
	encrypted, err := s.encryptSettingSecret(string(body))
	if err != nil {
		return err
	}
	stage := "upload"
	if state.Next == len(state.Targets) {
		stage = "poll"
	}
	if err := s.repo.UpdateTaskUploadCheckpoint(task, encrypted, state.ProviderID, stage); err != nil {
		return err
	}
	task.ProviderUploadState = encrypted
	task.ProviderRequestID = state.ProviderID
	task.PollStage = stage
	return nil
}

func (s *Service) loadProviderUploadCheckpoint(task *model.Task, interfaceType string, inputDigest string) (*providerUploadCheckpoint, error) {
	if task.ProviderUploadState == "" {
		return nil, nil
	}
	if !strings.HasPrefix(task.ProviderUploadState, encryptedSettingPrefix) {
		return nil, errors.New("上传恢复状态未加密")
	}
	plain, err := s.decryptSettingSecret(task.ProviderUploadState)
	if err != nil {
		return nil, errors.New("上传恢复状态解密失败")
	}
	var state providerUploadCheckpoint
	if json.Unmarshal([]byte(plain), &state) != nil || state.TaskID != task.ID || state.UserID != task.UserID || state.ProviderID != task.ProviderRequestID || state.InterfaceType != interfaceType || state.InputDigest != inputDigest {
		return nil, errors.New("上传恢复状态与当前任务不匹配")
	}
	if len(state.Targets) == 0 || len(state.Targets) > 16 || state.Next < 0 || state.Next > len(state.Targets) {
		return nil, errors.New("上传恢复进度无效")
	}
	return &state, nil
}
