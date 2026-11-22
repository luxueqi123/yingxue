import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { rolldown } from 'rolldown';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = path.join(root, '.local/cache');
await mkdir(cache, { recursive: true });
const output = await mkdtemp(path.join(cache, 'auth-session-test-'));
const build = await rolldown({
    input: 'session-test-entry',
    platform: 'node',
    transform: { define: { 'import.meta.env': '{}' } },
    plugins: [{
        name: 'test-real-auth-module',
        resolveId(id) {
            if (id === 'session-test-entry') return '\0session-test-entry';
            if (id.startsWith('@/')) {
                const source = path.join(root, 'web/src', id.slice(2));
                return existsSync(source + '.ts') ? source + '.ts' : path.join(source, 'index.ts');
            }
        },
        load(id) {
            if (id === '\0session-test-entry') return 'export { getAuthSession, login, register, logout } from "@/services/api/auth"; export { apiClient, http } from "@/services/api/request";';
        },
    }],
});
await build.write({ dir: output, format: 'esm', entryFileNames: 'session.mjs' });
await build.close();
const { getAuthSession, login, register, logout, apiClient, http } = await import(pathToFileURL(path.join(output, 'session.mjs')).href);
after(async () => {
    const resolvedOutput = await realpath(output);
    assert.equal(path.dirname(resolvedOutput), await realpath(cache));
    assert.ok(path.basename(resolvedOutput).startsWith('auth-session-test-'));
    await rm(resolvedOutput, { recursive: true, force: true });
});

test('a stalled real GET is cancelled and recovered once', async () => {
    let requests = 0;
    let firstClosed = false;
    const server = createServer((req, res) => {
        requests++;
        if (requests === 1) {
            res.on('close', () => { firstClosed = true; });
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 0, data: { restored: true }, msg: '' }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    apiClient.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    apiClient.defaults.proxy = false;
    const started = performance.now();
    try {
        assert.deepEqual(await http.get('/characters'), { restored: true });
        assert.equal(requests, 2);
        assert.ok(firstClosed);
        assert.ok(performance.now() - started >= 14_000);
        assert.ok(performance.now() - started < 19_000);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('registration replaces the cached visitor session', async () => {
    let user = null;
    const server = createServer((req, res) => {
        if (req.url.endsWith('/register')) user = { id: 'registered-user', status: 'active' };
        if (req.url.endsWith('/logout')) user = null;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 0, data: { user }, msg: '' }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    apiClient.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    apiClient.defaults.proxy = false;
    try {
        await logout();
        assert.equal((await getAuthSession()).user, null);
        await register({ username: 'registration-probe', password: 'test-only-password' });
        assert.equal((await getAuthSession()).user?.id, 'registered-user');
    } finally {
        await logout();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('a visitor request arriving after login cannot restore the visitor identity', async () => {
    let user = null;
    let visitorResponse;
    let notifyVisitor;
    const visitorReceived = new Promise(resolve => { notifyVisitor = resolve; });
    const reply = (res, value) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 0, data: { user: value }, msg: '' }));
    };
    const server = createServer((req, res) => {
        if (req.url.endsWith('/login')) user = { id: 'signed-in-user', status: 'active' };
        if (req.url.endsWith('/logout')) user = null;
        if (req.url.endsWith('/session') && !user) {
            visitorResponse = res;
            notifyVisitor();
        } else reply(res, user);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    apiClient.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    apiClient.defaults.proxy = false;
    try {
        await logout();
        const initial = getAuthSession();
        await visitorReceived;
        await login({ username: 'login-probe', password: 'test-only-password' });
        const signedIn = getAuthSession();
        reply(visitorResponse, null);
        assert.equal((await signedIn).user?.id, 'signed-in-user');
        assert.equal((await initial).user?.id, 'signed-in-user', 'initial hydrators also receive the current identity');
        assert.equal((await getAuthSession()).user?.id, 'signed-in-user');
    } finally {
        await logout();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('a healthy session response arriving after six seconds still restores the account', { timeout: 18000 }, async () => {
    let sessionRequests = 0;
    let timer;
    const server = createServer((request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (!request.url.endsWith('/session')) {
            response.end(JSON.stringify({ code: 0, data: { user: null }, msg: '' }));
            return;
        }
        sessionRequests++;
        timer = setTimeout(() => response.end(JSON.stringify({ code: 0, data: { user: { id: 'slow-session-user', status: 'active' } }, msg: '' })), 6500);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    apiClient.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    apiClient.defaults.proxy = false;
    try {
        await logout();
        const pending = getAuthSession();
        assert.equal(getAuthSession(), pending);
        assert.equal((await pending).user?.id, 'slow-session-user');
        assert.equal((await getAuthSession()).user?.id, 'slow-session-user');
        assert.equal(sessionRequests, 1, 'a healthy response does not need a second request or a manual reconnect');
    } finally {
        clearTimeout(timer);
        await logout();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('a stalled session request recovers automatically without manual reconnect', { timeout: 24000 }, async () => {
    let hits = 0;
    let firstClosed = false;
    const server = createServer((request, response) => {
        if (!request.url.endsWith('/session')) {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ code: 0, data: { user: null }, msg: '' }));
            return;
        }
        hits++;
        if (hits === 1) {
            response.on('close', () => { firstClosed = true; });
            return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ code: 0, data: { user: { id: 'recovered-user' } }, msg: '' }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    apiClient.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    apiClient.defaults.proxy = false;
    const watchdog = setTimeout(() => server.closeAllConnections(), 20000);
    try {
        await logout();
        const pending = getAuthSession();
        assert.equal(getAuthSession(), pending, 'concurrent consumers share one request');
        assert.equal((await pending).user?.id, 'recovered-user');
        assert.ok(firstClosed, 'the first stalled transport is aborted');
        assert.equal((await getAuthSession()).user?.id, 'recovered-user');
        assert.equal(hits, 2, 'only one recovery request is issued and the result is cached');
    } finally {
        clearTimeout(watchdog);
        await logout();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('a rejected session is not retried or treated as an anonymous success', async () => {
    let hits = 0;
    const server = createServer((request, response) => {
        response.setHeader('Content-Type', 'application/json');
        if (!request.url.endsWith('/session')) {
            response.end(JSON.stringify({ code: 0, data: { user: null }, msg: '' }));
            return;
        }
        hits++;
        response.statusCode = 403;
        response.end(JSON.stringify({ code: 403, data: null, msg: 'denied' }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    apiClient.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
    apiClient.defaults.proxy = false;
    try {
        await logout();
        await assert.rejects(getAuthSession(), error => error.status === 403 && error.code === 403);
        assert.equal(hits, 1);
        await assert.rejects(getAuthSession(), error => error.status === 403);
        assert.equal(hits, 2, 'failed requests release the in-flight slot without caching a fake visitor');
    } finally {
        await logout();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
