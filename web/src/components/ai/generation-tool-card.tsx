import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type GenerationToolStatus = "running" | "completed" | "error" | "cancelled";

export function GenerationToolCard({ status, heading, children }: { status: GenerationToolStatus; heading: ReactNode; children: ReactNode }) {
    const { t } = useInterfaceTranslation();
    const [open, setOpen] = useState(true);

    useEffect(() => {
        if (status !== "completed") setOpen(true);
    }, [status]);

    return <>
        <div className="creation-message-heading">
            {heading}
            <button type="button" className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-foreground/45 transition-colors hover:bg-surface-hover hover:text-foreground" aria-label={t(open ? "aiUi.collapseGenerationDetails" as InterfaceMessageKey : "aiUi.expandGenerationDetails" as InterfaceMessageKey)} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                <ChevronDown className={`size-4 transition-transform${open ? " rotate-180" : ""}`} />
            </button>
        </div>
        {open ? children : null}
    </>;
}
