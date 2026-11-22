import { Navigate } from "react-router";

import { useUserStore } from "@/stores/use-user-store";
import { AdminProvider } from "./admin-context";
import { AdminShell } from "./components/admin-shell";
import "./theme/admin-tokens.css";
import "./theme/admin-chrome.css";

export default function AdminPage() {
    const actor = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);

    if (!hydrated) return null;
    if (actor?.role !== "admin") {
            return <Navigate to="/create" replace />;
    }

    return (
        <AdminProvider>
            <AdminShell />
        </AdminProvider>
    );
}
