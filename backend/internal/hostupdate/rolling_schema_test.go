package hostupdate

import (
	"context"
	"errors"
	"io"
	"reflect"
	"testing"
)

func TestRollingSchemaAllowsOnlyRehearsedCandidate(t *testing.T) {
	const digest = "sha256:498273b9e1cc8b63b04883926211055a776febc9ad1e3dda3e41037cbc4d4553"
	release := Release{Version: "v2026.11.25-yingxue.278", Manifest: &releaseManifest{
		Revision: "674acdf7fb44b2f559fc25f2ba478eab615f5e3a", BackendDigest: digest,
	}}
	images := deploymentImages{backend: "ghcr.io/luxueqi123/open-ai-canvas-backend@" + digest}
	for _, c := range []struct {
		name         string
		status       string
		pinned       bool
		wantMigrate  bool
		wantCommands []string
	}{
		{"rehearsed", `{"current":118,"expected":119,"yingceCurrent":4,"yingceExpected":4,"ready":false}`, true, true, []string{"verify", "status"}},
		{"wrong schema", `{"current":117,"expected":119,"yingceCurrent":4,"yingceExpected":4,"ready":false}`, true, false, []string{"verify", "status"}},
		{"wrong image", "", false, false, []string{"verify"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			manager := sourceManager(t)
			var commands []string
			manager.runner = sourceRunner(func(_ context.Context, _ string, args, _ []string, output, _ io.Writer) error {
				command := args[len(args)-1]
				commands = append(commands, command)
				if command == "verify" {
					return errors.New("schema mismatch")
				}
				_, err := io.WriteString(output, c.status)
				return err
			})
			selected := images
			if !c.pinned {
				selected.backend = "ghcr.io/luxueqi123/open-ai-canvas-backend:test"
			}
			migrate, err := manager.checkRollingSchema(manager.composePath(), release, selected)
			if migrate != c.wantMigrate || (err == nil) != c.wantMigrate || !reflect.DeepEqual(commands, c.wantCommands) {
				t.Fatalf("migration=%v error=%v commands=%v", migrate, err, commands)
			}
		})
	}
}
