package hostupdate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

func (m *Manager) migrateForRollout(composePath, version string, images deploymentImages, command string, output io.Writer) error {
	return m.composeWithImages(composePath, version, images, m.config.StepTimeout, output,
		"run", "--rm", "--no-deps", "-T", "migrate", command)
}

func (m *Manager) checkRollingSchema(composePath string, release Release, images deploymentImages) (bool, error) {
	verifyErr := m.migrateForRollout(composePath, release.Version, images, "verify", nil)
	if verifyErr == nil {
		return false, nil
	}
	manifest := release.Manifest
	const backendDigest = "sha256:498273b9e1cc8b63b04883926211055a776febc9ad1e3dda3e41037cbc4d4553"
	// This exception is limited to the exact candidate exercised against the production snapshot.
	if release.Version != "v2026.11.25-yingxue.278" || manifest == nil ||
		manifest.Revision != "674acdf7fb44b2f559fc25f2ba478eab615f5e3a" ||
		manifest.BackendDigest != backendDigest || !strings.HasSuffix(images.backend, "@"+backendDigest) {
		return false, verifyErr
	}
	var output bytes.Buffer
	if err := m.migrateForRollout(composePath, release.Version, images, "status", &output); err != nil {
		return false, errors.Join(verifyErr, err)
	}
	var schema struct {
		Current        int  `json:"current"`
		Expected       int  `json:"expected"`
		YingceCurrent  int  `json:"yingceCurrent"`
		YingceExpected int  `json:"yingceExpected"`
		Ready          bool `json:"ready"`
	}
	if err := json.Unmarshal(output.Bytes(), &schema); err != nil {
		return false, fmt.Errorf("读取目标数据库迁移状态：%w", err)
	}
	if schema.Current != 118 || schema.Expected != 119 || schema.YingceCurrent != 4 || schema.YingceExpected != 4 || schema.Ready {
		return false, verifyErr
	}
	return true, nil
}

// Keep the additive DDL and concurrent application writes when recovering the old slot.
const restoreArchiveSchemaSQL = `
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(73123910420260830);
DO $rollback$
DECLARE
  schema_version integer;
BEGIN
  SELECT max(version) INTO schema_version FROM yingxue_upstream_schema_migrations;
  IF schema_version = 118 THEN
    RETURN;
  END IF;
  IF schema_version IS DISTINCT FROM 119 THEN
    RAISE EXCEPTION 'Unexpected database schema, refusing rollback';
  END IF;
  LOCK TABLE cloud_agent_executions, cloud_agent_history_archives IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM cloud_agent_history_archives)
     OR EXISTS (SELECT 1 FROM cloud_agent_executions WHERE history_compacted OR compacted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Agent history has been archived, refusing rollback';
  END IF;
  DELETE FROM yingxue_upstream_schema_migrations
  WHERE version = 119 AND name = 'cloud_agent_history_archives'
    AND checksum = 'sha256:cloud-agent-history-archives-v110-20261123';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unexpected migration record, refusing rollback';
  END IF;
END
$rollback$;
COMMIT;
`

func (m *Manager) restoreArchiveSchema(version string) error {
	values, err := readEnvFile(m.envPath())
	if err != nil {
		return err
	}
	err = m.compose(m.composePath(), version, m.config.StepTimeout, nil, "exec", "-T", "postgres", "psql",
		"-X", "-v", "ON_ERROR_STOP=1", "-U", firstNonEmpty(values["POSTGRES_USER"], "open_ai_canvas"),
		"-d", firstNonEmpty(values["POSTGRES_DB"], "open_ai_canvas"), "-c", restoreArchiveSchemaSQL)
	if err != nil {
		return fmt.Errorf("恢复归档迁移记录：%w", err)
	}
	return nil
}
