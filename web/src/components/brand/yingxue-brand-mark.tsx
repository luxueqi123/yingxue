import { cn } from "@/lib/utils";

type YingxueBrandMarkProps = {
    className?: string;
    variant?: "adaptive" | "inverse";
};

export function YingxueBrandMark({ className, variant = "adaptive" }: YingxueBrandMarkProps) {
    if (variant === "inverse") {
        return (
            <span aria-hidden className={cn("block shrink-0", className)}>
                <img className="size-full object-contain drop-shadow-[0_0_7px_rgba(255,255,255,0.2)]" src="/brand/yingxue-premium-mark-v5-dark.webp" alt="" draggable={false} />
            </span>
        );
    }

    return (
        <span aria-hidden className={cn("block shrink-0", className)}>
            <img className="size-full object-contain dark:hidden" src="/brand/yingxue-premium-mark-v5-light.webp" alt="" draggable={false} />
            <img className="hidden size-full object-contain drop-shadow-[0_0_7px_rgba(255,255,255,0.18)] dark:block" src="/brand/yingxue-premium-mark-v5-dark.webp" alt="" draggable={false} />
        </span>
    );
}
