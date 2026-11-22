import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

const MIIT_FILING_URL = "https://beian.miit.gov.cn/";

export function SiteComplianceFooter({ className, variant = "default" }: { className?: string; variant?: "default" | "auth" }) {
    
    const appearance = useAppearanceStore((state) => state.appearance);
    const { t } = useInterfaceTranslation();

    return (
        <footer className={cn("site-compliance-footer", variant === "auth" && "is-auth", className)} aria-label={t("layoutExtrasUi.complianceFooter" as InterfaceMessageKey)}>
            <span>{appearance.footerCopyright}</span>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
                {t("legalPrivacy")}
            </a>
            <a href="/terms" target="_blank" rel="noopener noreferrer">
                {t("legalTerms")}
            </a>
            {appearance.icpFilingEnabled && appearance.icpFilingNumber ? (
                <a href={MIIT_FILING_URL} target="_blank" rel="noopener noreferrer" aria-label={t("account.layout.footer.icpLink", { number: appearance.icpFilingNumber })}>
                    {appearance.icpFilingNumber}
                    <ExternalLink aria-hidden="true" />
                </a>
            ) : null}
        </footer>
    );
}
