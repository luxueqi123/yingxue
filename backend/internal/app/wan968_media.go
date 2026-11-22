package app

import (
	"context"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Bill from the uploaded bytes, never from client-supplied duration metadata.
// Only owned resources are accepted, so ffprobe never opens an arbitrary URL.
func (s *Service) verifiedWan968Durations(userID string, references []map[string]any) ([]int64, error) {
	const maxBytes = int64(128 << 20)
	dir := filepath.Join(s.dataDir, "cache", "billing-media")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	durations := make([]int64, 0, len(references))
	for _, media := range references {
		key, _ := media["storageKey"].(string)
		if !strings.HasPrefix(key, "resource:") {
			return nil, BadAuthRequest("万相按秒参考视频请先上传至映雪素材库，以核验实际时长")
		}
		duration, err := func() (int64, error) {
			resource, stream, err := s.OpenResource(userID, strings.TrimPrefix(key, "resource:"))
			if err != nil {
				return 0, err
			}
			defer stream.Close()
			if resource.Size <= 0 || resource.Size > maxBytes {
				return 0, BadAuthRequest("参考视频大小无效或超过128MB")
			}
			file, err := os.CreateTemp(dir, "wan-*")
			if err != nil {
				return 0, err
			}
			defer os.Remove(file.Name())
			defer file.Close()
			written, err := io.Copy(file, io.LimitReader(stream, maxBytes+1))
			if err != nil {
				return 0, err
			}
			if written != resource.Size || written > maxBytes {
				return 0, BadAuthRequest("参考视频文件不完整")
			}
			if err := file.Close(); err != nil {
				return 0, err
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			output, err := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file.Name()).Output()
			if err != nil {
				return 0, BadAuthRequest("无法核验参考视频时长，请重新上传标准视频文件")
			}
			seconds, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
			if err != nil || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds <= 0 || seconds > 3600 {
				return 0, BadAuthRequest("参考视频时长无效")
			}
			return int64(math.Ceil(seconds * 1000)), nil
		}()
		if err != nil {
			return nil, fmt.Errorf("参考视频计费核验失败：%w", err)
		}
		durations = append(durations, duration)
	}
	return durations, nil
}
