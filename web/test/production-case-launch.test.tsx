import { beforeEach, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let user: { id: number } | null;
let changeAccountOnLoad = false;
const project = { title: "案例工程", nodes: [], connections: [], mediaAssets: [] };
const navigate = mock(() => {});
const showError = mock(() => {});
const confirm = mock((options: { onOk: () => void }) => { options.onOk(); return { update() {} }; });
const loadProject = mock(async () => { if (changeAccountOnLoad) user = null; return project; });
const materialize = mock(async () => ({ nodes: project.nodes }));
const createProject = mock(async (_title?: string, _projectId?: string, _initial?: unknown, onCreated?: (id: string) => void) => {
    onCreated?.("copied-case");
    return { id: "copied-case", syncError: undefined };
});
mock.module("antd", () => ({ App: { useApp: () => ({ modal: { confirm }, message: { error: showError, warning() {}, loading: () => () => {} } }) } }));
const source = { pathname: "/studio", search: "?tab=cases", hash: "", state: { category: "MV" } };
mock.module("react-router", () => ({ useNavigate: () => navigate, useLocation: () => source }));
mock.module("../src/services/production-case-project", () => ({ loadProductionCaseProject: loadProject }));
mock.module("../src/services/native-case-media", () => ({ materializeNativeCaseMedia: materialize }));
mock.module("../src/services/user-data-sync", () => ({ createCanvasProjectWithRemoteSync: createProject }));
mock.module("../src/stores/use-user-store", () => ({ useUserStore: { getState: () => ({ user, hydrated: true }) } }));
mock.module("../src/stores/canvas/use-canvas-store", () => ({ useCanvasStore: { getState: () => ({ hydrated: true }) } }));
mock.module("../src/components/production/case-model-readiness", () => ({ CaseModelReadiness: () => null }));
mock.module("../src/services/api/skills", () => ({ addSkill: mock(), getSkill: mock() }));
mock.module("../src/lib/production-workflows", () => ({ buildProductionWorkflow: mock() }));
const { useProductionLaunch } = await import("../src/hooks/use-production-launch");
type ProductionItem = Parameters<ReturnType<typeof useProductionLaunch>["caseProject"]>[0];
const item = { id: "case-fixture", kind: "case", name: "案例工程" } as ProductionItem;

function actions() {
    let result!: ReturnType<typeof useProductionLaunch>;
    function Harness() { result = useProductionLaunch(); return null; }
    renderToStaticMarkup(<Harness />);
    return result;
}

beforeEach(() => {
    user = { id: 7 }; changeAccountOnLoad = false;
    for (const fn of [navigate, showError, confirm, loadProject, materialize, createProject]) fn.mockClear();
});

test("打开案例直接创建并进入节点画布，不弹出模型确认", async () => {
    await actions().caseProject(item);
    expect(confirm).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
    expect(loadProject).toHaveBeenCalledWith(item.id, { mode: "editable" });
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/canvas/copied-case", { state: { returnTo: "/studio?tab=cases", returnState: source.state } });
    expect(showError).not.toHaveBeenCalled();
});

test("未登录仍进入登录入口，不创建案例或上传素材", async () => {
    user = null;
    await actions().caseProject(item);
    expect(navigate).toHaveBeenCalledWith("/login?next=%2Fhome");
    expect(loadProject).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
});

test("案例节点本地就绪即进入画布，不等待云端保存", async () => {
    let finish!: () => void;
    let entered!: () => void;
    const localReady = new Promise<void>(resolve => { entered = resolve; });
    createProject.mockImplementationOnce(async (_title, _projectId, _initial, onCreated) => {
        onCreated?.("copied-case");
        entered();
        await new Promise<void>(resolve => { finish = resolve; });
        return { id: "copied-case", syncError: undefined };
    });
    const opening = actions().caseProject(item);
    await localReady;
    expect(navigate).toHaveBeenCalledWith("/canvas/copied-case", { state: { returnTo: "/studio?tab=cases", returnState: source.state } });
    expect(materialize).not.toHaveBeenCalled();
    finish();
    await opening;
});

test("读取过程中切换账号会停止复制", async () => {
    changeAccountOnLoad = true;
    await actions().caseProject(item);
    expect(materialize).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith("账号状态已变化，请重新打开案例后复制。");
});

test("复制后保留当前案例制作过程，返回不跳到个人素材库", async () => {
    const returnState = { casePreview: { id: item.id, process: true, category: "MV", search: "", page: 2, limit: 32 } };
    await actions().caseProject(item, returnState);
    expect(navigate).toHaveBeenCalledWith("/canvas/copied-case", { state: { returnTo: "/studio?tab=cases", returnState } });
});
