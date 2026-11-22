import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values } = parseArgs({ options: {
    nginx: { type: "string" }, receipt: { type: "string" },
    "work-dir": { type: "string" }, inventory: { type: "string" },
} });
assert(values.nginx && values.receipt, "Use --nginx <executable> --receipt <new receipt.json>");
const executable = resolve(values.nginx);
const receiptPath = resolve(values.receipt);
const cache = resolve(values["work-dir"] || resolve(workspace, ".local/cache"));
await mkdir(cache, { recursive: true });
const work = await mkdtemp(resolve(cache, "case-media-gateway-"));
const slash = path => path.replaceAll("\\", "/");
const quote = path => `"${slash(path)}"`;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const route = "/production-library/case-media/";
const filename = `${"a".repeat(32)}.mp4`;
const extraFilename = `${"b".repeat(32)}-${"c".repeat(64)}.mov`;
const nestedFilename = `case-${"d".repeat(32)}/${"e".repeat(64)}.png`;
const primaryBytes = Buffer.from("primary-media-0123456789");
const extraBytes = Buffer.from("supplementary-media-0123456789");
const nestedBytes = Buffer.from("nested-media-0123456789");
const roots = [resolve(work, "primary/media"), resolve(work, "extra")];
const manifest = Buffer.from('{"version":1,"kind":"ltv-case-media","entries":[]}');
for (const directory of [...roots, resolve(work, "site"), resolve(work, "logs"), resolve(work, "temp")]) await mkdir(directory, { recursive: true });
await writeFile(resolve(roots[0], filename), primaryBytes);
await writeFile(resolve(roots[1], filename), Buffer.from("lower-priority-copy"));
await writeFile(resolve(roots[1], extraFilename), extraBytes);
await mkdir(dirname(resolve(roots[1], nestedFilename)), { recursive: true });
await writeFile(resolve(roots[1], nestedFilename), nestedBytes);
await writeFile(resolve(work, "primary/manifest.json"), manifest);
await writeFile(resolve(work, "site/index.html"), "<html>fixture-spa</html>");
const outsideMarker = "outside-media-root-must-not-be-served";
await writeFile(resolve(work, "private.txt"), outsideMarker);

const inventory = values.inventory ? JSON.parse(await readFile(resolve(values.inventory), "utf8")) : undefined;
if (inventory) {
    assert.equal(inventory.roots.length, 2);
    assert(inventory.rows.length > 0);
    assert(inventory.rows.every(row => /^[a-f0-9]{32}(?:-[a-f0-9]{64})?\.(?:mp4|mov)$/.test(row.filename)
        || /^case-[a-f0-9]{32}\/[a-f0-9]{64}\.(?:png|jpg|webp|bmp|mp4|mov|webm|mp3|wav|m4a|ogg|glb)$/.test(row.filename)));
}

const receipt = {
    passed: false, startedAt: new Date().toISOString(), workDirectory: work,
    nginxExecutable: executable, nginxSHA256: sha(await readFile(executable)),
    sourceConfigSHA256: undefined, checks: [], failures: [],
    inventory: { requested: inventory?.rows.length || 0, checked: 0, rangeBytesRead: 0 },
    boundary: "Real loopback Nginx with source configuration; no Docker, deployment, model, visual or full-file hash acceptance.",
    productionWrites: 0, sourceMediaWrites: 0, sourceMediaCopies: 0,
};
const source = await readFile(resolve(workspace, "nginx.conf"), "utf8");
receipt.sourceConfigSHA256 = sha(Buffer.from(source));
const originalConfig = (newRoots) => source
    .replace("listen 3000;", "listen 127.0.0.1:PORT;")
    .replace("root /usr/share/nginx/html;", `root ${quote(resolve(work, "site"))};`)
    .replace("access_log /var/log/nginx/access.log canvas_no_query;", "access_log off;")
    .replaceAll("http://backend:8080", "http://127.0.0.1:9")
    .replaceAll("/data/ltv-case-library/manifest.json", quote(resolve(work, "primary/manifest.json")))
    .replaceAll("/data/ltv-case-library/media/", quote(slash(newRoots[0]) + "/"))
    .replaceAll("/data/ltv-case-library-extra", quote(newRoots[1]));

let agent;
function request(port, path, { method = "GET", headers = {} } = {}) {
    return new Promise((resolveResponse, reject) => {
        const req = http.request({ host: "127.0.0.1", port, path, method, headers, agent }, res => {
            const chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => resolveResponse({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.setTimeout(10000, () => req.destroy(new Error("Request timed out")));
        req.on("error", reject);
        req.end();
    });
}
async function check(name, action) {
    try { await action(); receipt.checks.push({ name, passed: true }); }
    catch (error) { receipt.checks.push({ name, passed: false, error: String(error) }); receipt.failures.push(name); }
}
async function withNginx(label, newRoots, action) {
    const reservation = net.createServer();
    await new Promise((ready, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", ready); });
    const port = reservation.address().port;
    await new Promise(done => reservation.close(done));
    const configPath = resolve(work, `${label}.conf`);
    const pidPath = resolve(work, `${label}.pid`);
    const config = `worker_processes 1;\npid ${quote(pidPath)};\nerror_log ${quote(resolve(work, `${label}-error.log`))} notice;\nevents { worker_connections 128; }\nhttp {\ninclude ${quote(resolve(dirname(executable), "conf/mime.types"))};\n${originalConfig(newRoots).replace("127.0.0.1:PORT", `127.0.0.1:${port}`)}\n}\n`;
    await writeFile(configPath, config);
    // Windows Nginx accepts UTF-8 config paths, but its CLI argv uses the active code page.
    const args = ["-p", "./", "-c", `${label}.conf`];
    const validation = spawnSync(executable, [...args, "-t"], { cwd: work, windowsHide: true, encoding: "utf8" });
    assert.equal(validation.status, 0, `${label} nginx -t: ${validation.stderr}`);
    receipt[`${label}ConfigSHA256`] = sha(Buffer.from(config));
    agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const child = spawn(executable, args, { cwd: work, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let diagnostics = "";
    child.stdout.on("data", chunk => { diagnostics += chunk; });
    child.stderr.on("data", chunk => { diagnostics += chunk; });
    let spawnError;
    child.on("error", error => { spawnError = error; });
    const exited = new Promise(done => child.once("exit", (code, signal) => done({ code, signal })));
    let started = false;
    try {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            if (spawnError || child.exitCode !== null) throw spawnError || new Error(diagnostics || "Nginx exited before ready");
            try { if ((await request(port, "/")).status === 200) { started = true; break; } } catch { /* Probe only this finite test listener. */ }
            await new Promise(done => setTimeout(done, 40));
        }
        assert(started, `Nginx did not become ready: ${diagnostics}`);
        receipt[`${label}Port`] = port;
        await action(port);
    } finally {
        agent.destroy();
        const stop = spawnSync(executable, [...args, "-s", "quit"], { cwd: work, windowsHide: true, encoding: "utf8" });
        receipt[`${label}StopExit`] = stop.status;
        if (stop.status !== 0) child.kill();
        let deadlineTimer;
        const terminal = await Promise.race([exited, new Promise(done => { deadlineTimer = setTimeout(() => done(undefined), 8000); })]);
        clearTimeout(deadlineTimer);
        receipt[`${label}Terminal`] = terminal || { unknown: true };
        assert(terminal && stop.status === 0, `Finite Nginx did not stop cleanly: ${stop.stderr}`);
    }
}

try {
    await withNginx("fixture", roots, async port => {
        for (const [name, path, expected] of [["primary has priority", filename, primaryBytes], ["supplementary final film", extraFilename, extraBytes], ["supplementary nested project asset", nestedFilename, nestedBytes]]) {
            await check(name, async () => {
                const res = await request(port, route + path);
                assert.equal(res.status, 200);
                assert.deepEqual(res.body, expected);
                assert.equal(res.headers["accept-ranges"], "bytes");
                assert.equal(res.headers["cache-control"], "private, no-store");
                assert.equal(res.headers["cdn-cache-control"], "no-store");
            });
        }
        for (const [name, path, expected] of [["primary", filename, primaryBytes], ["supplementary", extraFilename, extraBytes]]) {
            await check(`${name} HEAD`, async () => {
                const res = await request(port, route + path, { method: "HEAD" });
                assert.equal(res.status, 200);
                assert.equal(Number(res.headers["content-length"]), expected.length);
                assert.equal(res.body.length, 0);
            });
            await check(`${name} byte range`, async () => {
                const res = await request(port, route + path, { headers: { Range: "bytes=3-7" } });
                assert.equal(res.status, 206);
                assert.deepEqual(res.body, expected.subarray(3, 8));
                assert.equal(res.headers["content-range"], `bytes 3-7/${expected.length}`);
            });
            await check(`${name} unsatisfiable range`, async () => {
                const res = await request(port, route + path, { headers: { Range: "bytes=999-" } });
                assert.equal(res.status, 416);
                assert.equal(res.headers["content-range"], `bytes */${expected.length}`);
            });
        }
        await check("manifest stays on primary", async () => {
            const res = await request(port, "/production-library/case-media-manifest.json");
            assert.equal(res.status, 200); assert.deepEqual(res.body, manifest);
        });
        await check("missing file has a real 404", async () => assert.equal((await request(port, route + "f".repeat(32) + ".mp4")).status, 404));
        await check("directory listing is refused", async () => assert([403, 404].includes((await request(port, route)).status)));
        for (const method of ["POST", "PUT", "DELETE"]) {
            for (const path of [filename, extraFilename]) await check(`${method} is refused for ${path === filename ? "primary" : "supplementary"}`, async () => {
                assert([403, 405].includes((await request(port, route + path, { method })).status));
            });
        }
        for (const path of ["../private.txt", "%2e%2e/%2e%2e/private.txt", "%2e%2e%2f%2e%2e%2fprivate.txt", "case-a/../../../private.txt"]) {
            await check(`path cannot escape media roots: ${path}`, async () => {
                const res = await request(port, route + path);
                assert(!res.body.includes(Buffer.from(outsideMarker)));
                assert.notEqual(res.status, 206);
            });
        }
    });
    if (inventory) await withNginx("current", inventory.roots, async port => {
        const { open } = await import("node:fs/promises");
        for (const row of inventory.rows) {
            const head = await request(port, route + row.filename, { method: "HEAD" });
            assert.equal(head.status, 200, row.filename);
            assert.equal(Number(head.headers["content-length"]), row.bytes, row.filename);
            const res = await request(port, route + row.filename, { headers: { Range: "bytes=0-7" } });
            assert.equal(res.status, 206, row.filename);
            assert.equal(res.headers["content-range"], `bytes 0-7/${row.bytes}`, row.filename);
            const handle = await open(resolve(inventory.roots[row.rootIndex], row.filename), "r");
            const expected = Buffer.alloc(8);
            try { assert.equal((await handle.read(expected, 0, 8, 0)).bytesRead, 8); } finally { await handle.close(); }
            assert.deepEqual(res.body, expected, row.filename);
            receipt.inventory.checked++;
            receipt.inventory.rangeBytesRead += res.body.length;
            if (receipt.inventory.checked % 1000 === 0) process.stdout.write(JSON.stringify({ checked: receipt.inventory.checked, total: inventory.rows.length }) + "\n");
        }
    });
    receipt.passed = receipt.failures.length === 0;
} catch (error) { receipt.failures.push(String(error)); }
receipt.finishedAt = new Date().toISOString();
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
process.stdout.write(JSON.stringify({ passed: receipt.passed, checks: receipt.checks.length, failures: receipt.failures, inventory: receipt.inventory, receipt: receiptPath }) + "\n");
if (!receipt.passed) process.exitCode = 1;
