import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { handleEntryLoadError, installChunkRecovery } from "@/lib/chunk-recovery";
import "./styles/bootstrap-error.css";
import { runLocalRuntimeBootstrap } from "@/services/local-runtime-bootstrap";
import { isIsolatedDevRepro } from "@/lib/dev-repro";

installChunkRecovery();

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
        // Appearance updates the shared store independently; a slow backend must not block either entry.
        if (!isIsolatedDevRepro(import.meta.env.DEV, window.location.pathname)) {
            void import("@/services/appearance-bootstrap").then(module => module.bootstrapAppearance()).catch(console.warn);
        }
        if (/^\/welcome\/?$/.test(window.location.pathname)) window.history.replaceState(window.history.state, "", "/home");
        {
            // Start the lobby and its shell alongside the application, avoiding nested import waterfalls.
            if (/^\/(?:home\/?)?$/.test(window.location.pathname)) {
                void import("@/layouts/user-layout").catch(handleEntryLoadError);
                void import("@/pages/home").catch(handleEntryLoadError);
                void import("@/pages/create").catch(console.warn);
            }
            const applicationReady = import("./application");
            void applicationReady.then(module => module?.mountApplication()).catch(handleEntryLoadError);
        }
    },
);
