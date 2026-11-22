package canvas

import (
	"bytes"
	"encoding/json"
	"fmt"

	"infinite-canvas/backend/internal/kernel"
)

// Validate the editor's collection boundaries without synthesizing missing data.
func validateCanvasCollections(raw json.RawMessage) error {
	var document map[string]json.RawMessage
	if err := json.Unmarshal(raw, &document); err != nil || document == nil {
		return kernel.BadAuthRequest("画布数据结构无效：project 必须是对象")
	}
	for _, field := range []string{"nodes", "connections", "chatSessions"} {
		rows, err := canvasObjectArray(document[field], field)
		if err != nil {
			return err
		}
		if field == "chatSessions" {
			for index, row := range rows {
				if _, err := canvasObjectArray(row["messages"], fmt.Sprintf("chatSessions[%d].messages", index)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func canvasObjectArray(raw json.RawMessage, field string) ([]map[string]json.RawMessage, error) {
	invalid := func() error {
		return kernel.BadAuthRequest("画布数据结构无效：" + field + " 必须是对象数组，请保留原文件并修正数据")
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '[' {
		return nil, invalid()
	}
	var rows []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, invalid()
	}
	for _, row := range rows {
		if row == nil {
			return nil, invalid()
		}
	}
	return rows, nil
}
