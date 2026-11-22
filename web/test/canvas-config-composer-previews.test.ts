import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("workflow composer resolves stored media and project-scoped drawings without rewriting prompts", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-config-composer-previews.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 60000 });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(result.exitCode, output).toBe(0);
}, 65000);
