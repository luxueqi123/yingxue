// Run from the repository root against an existing local Vite server. APIs are synthetic; external requests are blocked.
import { chromium } from "../../canvas-agent/node_modules/playwright-core/index.mjs";

const baseURL = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:4175";
const now = "2026-09-12T08:00:00.000Z";
const user = { id: "browser-user", username: "browser", displayName: "浏览器验收", role: "user", status: "active", createdAt: now, updatedAt: now };
const logicalModels = ["text", "image", "video"].map((capability, index) => ({
    id: `fixture-${capability}`,
    code: `fixture-${capability}`,
    name: `验收${capability}模型`,
    description: "browser fixture",
    capability,
    sortOrder: index + 1,
    pricePolicy: "unified",
    billingMode: "fixed_request",
    unitPriceMicrocredits: 1000000,
    inputPriceMicrocredits: 0,
    outputPriceMicrocredits: 0,
    cachedPriceMicrocredits: 0,
    priceTiers: [],
    legacyModelIds: [],
    capabilitySpec: { version: 1, capability, inputs: {}, options: {} },
    capabilityProfiles: [],
    defaultOptions: {},
    available: true,
}));

logicalModels.push({...logicalModels.find(item=>item.capability==='image'),id:'image-alternative',name:'替代图片模型'});
const seenApi = [];
const savedProjects = new Map();
const taskWrites = [];
const browserErrors = [];
const failedRequests = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await context.newPage();
page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
});
page.on("requestfailed", (request) => failedRequests.push(`FAILED ${request.url()} ${request.failure()?.errorText || ""}`));

await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseURL) return route.abort("blockedbyclient");
    if (!url.pathname.startsWith("/api/")) return route.continue();

    const path = url.pathname.slice(4);
    const method = request.method();
    seenApi.push(`${method} ${path}${url.search}`);
    if (/\/tasks(?:\/|$)|\/generate(?:\/|$)/.test(path) && method !== "GET") taskWrites.push(`${method} ${path}`);

    let data = {};
    if (path === "/auth/session") data = { user, logicalModels, runtimeLimits: { activeTaskLimit: 4, resourceUploadMB: 50, sessionUploadMB: 100 }, features: {} };
    else if (path === "/model-catalog") data = { source: "frontend", models: logicalModels };
    else if (path === "/user-data/snapshot") data = { assets: [], projects: [] };
    else if (path === "/wallet") data = { account: { userId: user.id, availableMicrocredits: 120000000, reservedMicrocredits: 0, version: 1, createdAt: now, updatedAt: now }, entries: [], total: 0, page: 1, pageSize: 20, policy: { signupBonusMicrocredits: 0, checkinBonusMicrocredits: 0, checkedInToday: false, creditPerYuan: 10, rechargePlans: [], pricingNotice: { rates: [] } } };




    else if (path.startsWith("/canvas-projects/") && method === "PUT") {
        const body = request.postDataJSON();
        savedProjects.set(body.project.id, body.project);
        data = { project: { id: body.project.id, title: body.project.title, createdAt: body.project.createdAt, updatedAt: body.project.updatedAt } };
    } else if (path.startsWith("/canvas-projects/") && method === "GET") {
        const project = savedProjects.get(decodeURIComponent(path.split("/")[2]));
        if (!project) throw new Error("测试请求了不存在的画布");
        data = { project };
    } else if (path === "/announcements") data = { announcements: [] };
    else if (path === "/skills" || path === "/skills/added") data = { skills: [], totalCount: 0, hasMore: false, nextOffset: 0, page: 1, pageSize: 100, categories: [] };
    else if (path === "/plugins/catalog") data = { plugins: [] };
    else if (path === "/plugins/status") data = { statuses: {}, states: {} };
    else if (path === "/appearance") data = { appearance: null };
    else if (path === "/assets") data = { assets: [], kindCounts: {}, categoryCounts: {}, folderCounts: {}, page: 1, pageSize: 20, total: 0, hasMore: false };
    else if (path === "/asset-folders") data = { folders: [] };

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data, msg: "ok" }) });
});

try {
    await page.goto(`${baseURL}/home`, { waitUntil: "domcontentloaded" });
    const composer = page.getByLabel("创作提示词，可使用 @ 引用当前参考内容或技能");
    await composer.waitFor({ state: "visible", timeout: 20000 });
    const container = page.locator(".creation-chat-composer.is-lobby");
    const emptyBox = await container.boundingBox();
    await composer.fill("一只白鹤掠过雪山，生成分镜草稿");
    await composer.focus();
    await page.waitForTimeout(300);
    await container.locator("button.creation-chat-control.is-mode").click();
    await page.getByRole("option", { name: "Agent 创作" }).click();
    const expandedBox = await container.boundingBox();
    const canvasButton = page.locator(".canvas-node-composer-submit");
    await canvasButton.click();
    await page.waitForURL(/\/canvas\//, { timeout: 20000 });
    await page.getByText("画布协作", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    const agentComposer = page.getByLabel("Agent 输入");
    await agentComposer.waitFor({ state: "visible", timeout: 10000 });
    const agentPrompt = await agentComposer.inputValue().catch(async () => agentComposer.textContent());
    if (await page.getByText("创作简报", {exact:true}).count()) throw new Error("大厅输入仍创建了简报占位节点");
    await page.waitForTimeout(1500);
    const canvasURL = page.url();
    if (!agentPrompt.includes('白鹤')) throw new Error('创意未承接');
    if (agentPrompt.includes('文本模型：')) throw new Error('输入框混入配置');
    await page.getByLabel('选择文本、图片和视频模型', {exact:true}).click();
    const modelPanel = page.locator('.creation-agent-models');
    await modelPanel.waitFor();
    if (await modelPanel.locator('label').count() !== 3) throw new Error('工作台缺少三类模型');
    await modelPanel.locator('label').nth(1).locator('button').first().click();
    await page.getByRole('option',{name:/替代图片模型/}).click();
    await modelPanel.getByText('替代图片模型',{exact:true}).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({path:'.local/cache/workbench-models-after.png'});
    await page.mouse.click(900,650);
    await page.getByLabel('选择文本、图片和视频模型', {exact:true}).click();
    await modelPanel.getByText('替代图片模型',{exact:true}).waitFor();
    await page.mouse.click(900,650);
    await page.getByText('创意已就绪', {exact:true}).waitFor();
    if (await page.getByRole('button',{name:'整理当前画布',exact:true}).count()) throw new Error('已有草稿时仍显示替换入口');
    await page.screenshot({path: '.local/cache/workbench-handoff-after.png'});
    await agentComposer.fill('');
    await page.getByRole('button',{name:'整理当前画布',exact:true}).click();
    const prepared = await agentComposer.inputValue().catch(()=>agentComposer.textContent());
    if (!prepared.includes('整理当前画布')) throw new Error('快捷入口未预填');
    if (taskWrites.length) throw new Error('快捷入口自动执行任务');

    await page.getByRole('button',{name:'打开画布菜单',exact:true}).click();
    await page.getByRole('menuitem',{name:'新建画布',exact:true}).click();
    await page.waitForTimeout(1000);
    if (await page.getByText('一只白鹤掠过雪山，生成分镜草稿',{exact:true}).count()) throw new Error('新建画布错误沿用旧节点');
    await page.getByRole('button',{name:'从空白画布开始',exact:true}).click();
    const starts = page.getByRole('group',{name:'创作起点',exact:true});
    await starts.waitFor();
    if (await starts.getByRole('button').count() !== 4) throw new Error('创作入口数量错误');
    await page.screenshot({path:'.local/cache/workbench-empty-after.png'});
    await starts.getByRole('button',{name:'文本',exact:true}).click();
    await page.waitForTimeout(400);
    if (await starts.count()) throw new Error('添加节点后仍显示空态');
    await page.keyboard.press('Control+s');
    await page.getByText('画布布局和位置已保存',{exact:true}).waitFor();
    await page.goto(canvasURL,{waitUntil:'domcontentloaded'});
    await page.getByLabel('Agent 输入').waitFor();
    const restored = await page.getByLabel('Agent 输入').inputValue().catch(()=>page.getByLabel('Agent 输入').textContent());
    if (!restored.includes('整理当前画布')) throw new Error('项目对话草稿未恢复');
    console.log('PROJECT_ISOLATION_AND_NODE_CREATE_SAVE_PASS');
    console.log(JSON.stringify({
        create: {
            emptyComposer: emptyBox && { width: Math.round(emptyBox.width), height: Math.round(emptyBox.height) },
            expandedComposer: expandedBox && { width: Math.round(expandedBox.width), height: Math.round(expandedBox.height) },
            canvasURL,
            briefRemovedFromURL: !new URL(canvasURL).searchParams.has("brief"),
            agentPrompt,
            taskWrites,
        },

        externalRequestsBlocked: true,
        apiRequests: seenApi,
        browserErrors,
        failedRequests,
    }, null, 2));
} catch (error) {
    console.error(JSON.stringify({ failure: error.message, url: page.url(), body: (await page.locator("body").innerText().catch(() => "")).slice(0, 4000), seenApi, browserErrors }, null, 2));
    throw error;
} finally {
    await browser.close();
}
