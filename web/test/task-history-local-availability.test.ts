import { afterEach, expect, mock, test } from "bun:test";
import { apiClient } from "../src/services/api/request";
import { createModelChannel, useConfigStore } from "../src/stores/use-config-store";
import { useLocalRuntimeStore } from "../src/stores/use-local-runtime-store";

const listLocal = mock(async () => ({ tasks: [] }));
mock.module("@/services/local-dreamina-generation", () => ({
    LOCAL_DREAMINA_FAILED_OR_CANCELLED_MESSAGE: "Local task failed or was cancelled",
    LOCAL_DREAMINA_OFFICIAL_INCOMPLETE_CODE: "dreamina_official_incomplete",
    LOCAL_DREAMINA_OFFICIAL_INCOMPLETE_MESSAGE: "Local result is incomplete",
    LOCAL_DREAMINA_WAIT_STOPPED_CODE: "dreamina_wait_stopped",
    LOCAL_DREAMINA_WAIT_STOPPED_MESSAGE: "Stopped waiting",
    listLocalDreaminaGenerationTaskPage: listLocal,
    deleteLocalDreaminaGenerationTask: mock(),
    queryLocalDreaminaGenerationTask: mock(),
    refreshLocalDreaminaGenerationTask: mock(),
    waitForLocalDreaminaGenerationTask: mock(),
}));
const { listGenerationTasks } = await import("../src/services/api/task-center");
const originalAdapter = apiClient.defaults.adapter;
const originalConfig = useConfigStore.getState().config;
const originalConnection = useLocalRuntimeStore.getState().connection;
afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    useConfigStore.setState({ config: originalConfig });
    useLocalRuntimeStore.setState({ connection: originalConnection });
    listLocal.mockClear();
});

function prepareHistory(channels: typeof originalConfig.channels) {
    useConfigStore.setState({ config: { ...originalConfig, channels } });
    apiClient.defaults.adapter = async (config) => ({
        config, status: 200, statusText: "OK", headers: {},
        data: { code: 0, msg: "ok", data: [{ id: "cloud-task", status: "succeeded", type: "canvas_image", prompt: "", createdAt: "2026-11-08", updatedAt: "2026-11-08", attempts: 1 }] },
    });
}

test("cloud task history never probes an unconfigured local runtime", async () => {
    prepareHistory([]);
    const tasks = await listGenerationTasks();
    expect(tasks.map((task) => task.id)).toEqual(["cloud-task"]);
    expect(listLocal).not.toHaveBeenCalled();
});

test.each([true, false])("configured local task history remains readable when channel enabled=%s", async (enabled) => {
    prepareHistory([{ ...createModelChannel({ id: "history-runtime", name: "Local runtime", enabled }), transport: "local-runtime" }]);
    useLocalRuntimeStore.setState({ connection: "connected" });
    const tasks = await listGenerationTasks();
    expect(tasks.map((task) => task.id)).toEqual(["cloud-task"]);
    expect(listLocal).toHaveBeenCalledTimes(1);
});

test.each(["idle", "unreachable", "origin_not_trusted"] as const)("cloud history does not reconnect a %s desktop runtime", async (connection) => {
    prepareHistory([{ ...createModelChannel({ id: "history-runtime", name: "Local runtime" }), transport: "local-runtime" }]);
    useLocalRuntimeStore.setState({ connection });
    const tasks = await listGenerationTasks();
    expect(tasks.map((task) => task.id)).toEqual(["cloud-task"]);
    expect(listLocal).not.toHaveBeenCalled();
});
