import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import lightLogo from "../../../public/brand/yingxue-art-tv-20261107-light.svg?url";
import darkLogo from "../../../public/brand/yingxue-art-tv-20261107-dark.svg?url";
import "./yingxue-brand-lockup.css";

type YingxueBrandLockupProps = {
    className?: string;
    variant?: "adaptive" | "light" | "dark";
};

export function YingxueBrandLockup({ className, variant = "dark" }: YingxueBrandLockupProps) {
    const { t } = useInterfaceTranslation();
    const theme = useThemeStore(state => state.theme);
    const light = variant === "light" || (variant === "adaptive" && theme !== "dark");
    return (
        <span role="img" aria-label={t("brand")} data-variant={variant} data-tone={light ? "light" : "dark"} className={cn("yingxue-brand-lockup inline-flex shrink-0 items-center justify-center", className)}>
            <img
                alt={t("brand")}
                className="yingxue-brand-lockup-image h-full w-auto max-w-full object-contain"
                draggable={false}
                fetchPriority="high"
                src={light ? lightLogo : darkLogo}
            />
        </span>
    );
}
