import { runLocalRuntimeBootstrap } from "@/services/local-runtime-bootstrap";
import { bootstrapAppearance } from "@/services/appearance-bootstrap";

const staleReleaseRecoveryKey = "yingxue:stale-release-recovery-at";
const staleReleaseRecoveryWindowMs = 60_000;

window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();

    const now = Date.now();
    let lastRecoveryAt = 0;
    try {
        lastRecoveryAt = Number(window.sessionStorage.getItem(staleReleaseRecoveryKey) || "0");
    } catch {
        // Storage may be unavailable in restricted browser contexts; reload recovery must still work.
    }
    if (Number.isFinite(lastRecoveryAt) && now - lastRecoveryAt < staleReleaseRecoveryWindowMs) {
        return;
    }

    try {
        window.sessionStorage.setItem(staleReleaseRecoveryKey, String(now));
    } catch {
        // The reload below remains the safe fallback when the marker cannot be persisted.
    }
    window.location.reload();
});

window.setTimeout(() => {
    try {
        window.sessionStorage.removeItem(staleReleaseRecoveryKey);
    } catch {
        // Ignore storage cleanup failures in restricted browser contexts.
    }
}, staleReleaseRecoveryWindowMs);

runLocalRuntimeBootstrap(
    {
        get href() {
            return window.location.href;
        },
        replaceUrl(url) {
            window.history.replaceState(window.history.state, "", url);
        },
        removeStorageItem(key) {
            window.localStorage.removeItem(key);
        },
    },
    () => {
        void bootstrapAppearance().finally(() => import("./application"));
    },
);
