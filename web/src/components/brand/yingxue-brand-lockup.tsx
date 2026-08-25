import { cn } from "@/lib/utils";

type YingxueBrandLockupProps = {
    className?: string;
    variant?: "adaptive" | "light" | "dark";
};

export function YingxueBrandLockup({ className, variant = "dark" }: YingxueBrandLockupProps) {
    if (variant === "adaptive") {
        return (
            <span role="img" aria-label="映雪" className={cn("inline-flex shrink-0 items-center", className)}>
                <img aria-hidden className="h-full w-auto max-w-none object-contain dark:hidden" src="/brand/yingxue-premium-v5-light.webp" alt="" draggable={false} />
                <img aria-hidden className="hidden h-full w-auto max-w-none object-contain drop-shadow-[0_0_7px_rgba(255,255,255,0.18)] dark:block" src="/brand/yingxue-premium-v5-dark.webp" alt="" draggable={false} />
            </span>
        );
    }

    return (
        <img
            alt="映雪"
            className={cn(
                "block h-auto max-w-none object-contain",
                className,
            )}
            draggable={false}
            fetchPriority="high"
            src={variant === "dark" ? "/brand/yingxue-premium-v5-dark.webp" : "/brand/yingxue-premium-v5-light.webp"}
        />
    );
}
