import pathlib
p = pathlib.Path(r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912\backend\internal\model\models_task.go")
s = p.read_text(encoding="utf-8")
assert "\r\n" not in s
# 1) Task: 在 RequestID 之后重新插入 SessionID
old = "\tRequestID                    string                   `json:\"-\" gorm:\"index;size:96\"`\n\tProjectID                    string"
new = "\tRequestID                    string                   `json:\"-\" gorm:\"index;size:96\"`\n\tSessionID                    string                   `json:\"sessionId\" gorm:\"index;size:36\"`\n\tProjectID                    string"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
# 2) 在 TaskLog 之前插入 Session / Message / SessionFile
anchor = "type TaskLog struct {"
block = """type Session struct {
	ID                 string        `json:"id" gorm:"primaryKey;size:36"`
	UserID             string        `json:"userId" gorm:"index;size:36"`
	ProjectID          string        `json:"projectId" gorm:"index;size:80"`
	Status             SessionStatus `json:"status" gorm:"index;size:24"`
	Prompt             string        `json:"prompt"`
	CanvasSnapshotJSON string        `json:"canvasSnapshotJson" gorm:"type:text"`
	CanvasOpsJSON      string        `json:"canvasOpsJson" gorm:"type:text"`
	CreatedAt          time.Time     `json:"createdAt"`
	UpdatedAt          time.Time     `json:"updatedAt"`
}

type Message struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	SessionID string    `json:"sessionId" gorm:"index;size:36"`
	Role      string    `json:"role" gorm:"size:24"`
	Content   string    `json:"content"`
	Payload   string    `json:"payload" gorm:"type:text"`
	CreatedAt time.Time `json:"createdAt"`
}

"""
assert s.count(anchor) == 1
s = s.replace(anchor, block + anchor)
# 3) Result: 加回 SessionID
old2 = "\tTaskID    string    `json:\"taskId\" gorm:\"index;size:36\"`\n\tKind      string"
new2 = "\tTaskID    string    `json:\"taskId\" gorm:\"index;size:36\"`\n\tSessionID string    `json:\"sessionId\" gorm:\"index;size:36\"`\n\tKind      string"
assert s.count(old2) == 1
s = s.replace(old2, new2)
# 4) 在 Result 之前插入 SessionFile
anchor2 = "type Result struct {"
block2 = """type SessionFile struct {
	ID        string    `json:"id" gorm:"primaryKey;size:36"`
	UserID    string    `json:"userId" gorm:"index;size:36"`
	SessionID string    `json:"sessionId" gorm:"index;size:36"`
	FileName  string    `json:"fileName"`
	MimeType  string    `json:"mimeType"`
	Path      string    `json:"-"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
}

"""
assert s.count(anchor2) == 1
s = s.replace(anchor2, block2 + anchor2)
p.write_text(s, encoding="utf-8", newline="\n")
print("ok")
