import { interfaceLocales } from "./interface-locale-ids";
import { PageResourceError } from "@/lib/module-preload";

const RECOVERY_QUERY = "__chunk_recovery";
const RECOVERY_KEY = "canvas:chunk-recovery";
let recovering = false;

export function installChunkRecovery() {
    window.addEventListener("vite:preloadError", handlePreloadError);
}

export function markChunkRecoverySucceeded() {
    // An entry module loading says nothing about lazy routes. Keep the guard for
    // the tab's lifetime; the URL also protects browsers with disabled storage.
}

/** Explicit user retry is allowed even after the automatic recovery was used. */
export function reloadAfterChunkFailure() {
    navigateToFreshEntry();
}

/** Startup imports report through the same event channel as route resources. */
export function reportStartupLoadFailure(error: unknown) {
    console.error("Application startup failed", error);
    window.dispatchEvent(new CustomEvent("starai:startup-load-failure", { detail: { status: error instanceof PageResourceError ? error.status : undefined } }));
}

/** Entry failures happen before React and its route error boundary exist. */
export function handleEntryLoadError(error: unknown) {
    console.error("页面入口加载失败", error);
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
    const moduleDownloadFailed = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .+ failed/i.test(message);
    if (moduleDownloadFailed && tryRecoverChunkFailure()) return;

    const panel = document.createElement("main");
    panel.className = "app-bootstrap-error";
    panel.setAttribute("role", "alert");
    const title = document.createElement("h1");
    title.textContent = "页面暂时无法加载";
    const description = document.createElement("p");
    description.textContent = "请重新加载页面。";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重新加载";
    retry.addEventListener("click", reloadAfterChunkFailure);
    panel.append(title, description, retry);
    (document.getElementById("root") ?? document.body).replaceChildren(panel);
}

export function tryRecoverChunkFailure() {
    if (recovering) return true;
    const url = new URL(window.location.href);
    if (url.searchParams.has(RECOVERY_QUERY)) return false;
    try {
        if (sessionStorage.getItem(RECOVERY_KEY) === "1") return false;
        sessionStorage.setItem(RECOVERY_KEY, "1");
    } catch {
        // The query marker survives the reload when session storage is denied.
    }
    recovering = true;
    navigateToFreshEntry();
    return true;
}

function navigateToFreshEntry() {
    const url = new URL(window.location.href);
    url.searchParams.set(RECOVERY_QUERY, String(Date.now()));
    window.location.replace(url.toString());
}

function handlePreloadError(event: Event) {
    const payload = (event as Event & { payload?: unknown }).payload;
    // Language selection handles its own failure; a page reload would erase input.
    if (payload instanceof Error && interfaceLocales.some(locale =>
        payload.message.includes(`/assets/${locale}-`) || payload.message.includes(`/src/lib/locales/${locale}.ts`))) return;
    // On the second failure let Vite throw to the route error boundary.
    if (tryRecoverChunkFailure()) event.preventDefault();
}
