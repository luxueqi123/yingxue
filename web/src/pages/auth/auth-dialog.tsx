import { useState } from "react";
import { ConfigProvider, Modal, Tabs } from "antd";

import { YingxueBrandLockup } from "@/components/brand/yingxue-brand-lockup";
import { getAntThemeConfig } from "@/lib/app-theme";
import LoginPage from "./login";
import RegisterPage from "./register";
import "./auth-scene.css";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { AuthPanel } from "@/components/auth/auth-panel";
import type { AuthView } from "@/lib/auth-entry";

export function AuthDialog({ onCancel, onAuthenticated }: {
    onCancel: () => void;
    onAuthenticated: () => void | Promise<void>;
}) {
    const { t } = useInterfaceTranslation();
    const [tab, setTab] = useState<AuthView>("login");
    const [submitting, setSubmitting] = useState(false);
    const props = { returnTo: "/home", onAuthenticated, onSubmittingChange: setSubmitting };

    return <ConfigProvider theme={getAntThemeConfig(true)}>
        <Modal open centered width={460} footer={null} className="yx-account-modal yx-cinematic-theme"
            title={<div className="yx-account-heading"><YingxueBrandLockup className="yx-account-brand" /><span>{t("authDialogTitle")}</span></div>}
            closable={!submitting} mask={{ closable: !submitting }} keyboard={!submitting}
            onCancel={onCancel} destroyOnHidden styles={{ container: { padding: 28 } }}>
            <div className="auth-card-dark">
                <div className="yx-account-fields"><AuthPanel variant="dialog" view={tab} onViewChange={setTab} next="/home" onAuthenticated={onAuthenticated} onSubmittingChange={setSubmitting} /></div>
            </div>
        </Modal>
    </ConfigProvider>;
}
