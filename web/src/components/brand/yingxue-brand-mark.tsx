import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { cn } from "@/lib/utils";
import { YingxueBrandLockup } from "./yingxue-brand-lockup";

type YingxueBrandMarkProps = {
    className?: string;
    variant?: "adaptive" | "inverse";
};

export function YingxueBrandMark({ className, variant = "adaptive" }: YingxueBrandMarkProps) {
    const activeTheme = useActiveTheme();
    const isDark = variant === "adaptive" ? activeTheme === "dark" : true;

    return (
        <span aria-hidden className={cn("block shrink-0", className)}>
            <YingxueBrandLockup className="size-full" variant={isDark ? "dark" : "light"} />
        </span>
    );
}
