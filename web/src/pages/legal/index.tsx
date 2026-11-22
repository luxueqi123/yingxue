import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { InterfaceLanguageSelect } from "@/components/layout/interface-language-select";
import { getAuthSettings } from "@/services/api/auth";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { legalCopy, PRIVACY_CONTACT, PRIVACY_UPDATED } from "./privacy-content";

// Public documents share the application's semantic colors and language settings.
// Terms are always read from the same public API as the registration agreement.
export default function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
    const { locale } = useInterfaceTranslation();
    const copy = legalCopy[locale];
    const brand = useAppearanceStore(state => state.appearance.brandName);
    const scroll = useRef<HTMLElement>(null);
    const terms = useQuery({ queryKey: ["public-legal-terms"], queryFn: getAuthSettings, enabled: kind === "terms", staleTime: 0, retry: 1 });
    const title = kind === "privacy" ? copy.privacy : terms.data?.agreementTitle?.trim().replace(/^《|》$/g, "") || copy.terms;

    useEffect(() => {
        const previous = document.title;
        document.title = `${title} · ${brand}`;
        return () => { document.title = previous; };
    }, [brand, title]);

    useEffect(() => { scroll.current?.scrollTo(0, 0); }, [kind]);

    return <main ref={scroll} lang={locale} className="h-dvh overflow-y-auto bg-[var(--bg-page)] font-sans text-[var(--fg-default)]">
        <div className="mx-auto max-w-4xl px-5 py-7 sm:px-10 sm:py-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
                <Link to="/" className="text-xl font-semibold">{brand}</Link>
                <div className="flex flex-wrap items-center gap-4"><InterfaceLanguageSelect /><Link to="/" className="text-sm underline underline-offset-4">{copy.home}</Link></div>
            </header>
            <nav className="my-7 flex flex-wrap gap-6 text-sm">
                <Link to="/privacy" aria-current={kind === "privacy" ? "page" : undefined} className={kind === "privacy" ? "font-semibold underline underline-offset-4" : "underline-offset-4 hover:underline"}>{copy.privacy}</Link>
                <Link to="/terms" aria-current={kind === "terms" ? "page" : undefined} className={kind === "terms" ? "font-semibold underline underline-offset-4" : "underline-offset-4 hover:underline"}>{copy.terms}</Link>
            </nav>
            <article aria-labelledby="legal-document-title" className="pb-10 text-base leading-8">
                <h1 id="legal-document-title" className="mb-6 break-words text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
                {kind === "privacy" ? <>
                    <p className="mb-6 text-sm text-[var(--fg-muted)]">{copy.updated}: <time dateTime={PRIVACY_UPDATED}>{PRIVACY_UPDATED}</time></p>
                    <p>{copy.intro}</p>
                    {copy.sections.map(section => <section key={section.title} className="mt-8"><h2 className="mb-3 text-xl font-semibold">{section.title}</h2><p>{section.body}</p></section>)}
                    <section className="mt-8"><h2 className="mb-3 text-xl font-semibold">{copy.contact}</h2><a className="break-all underline underline-offset-4" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a></section>
                </> : terms.isError ? <div role="alert"><p>{copy.unavailable}</p><button type="button" className="mt-4 underline underline-offset-4" onClick={() => void terms.refetch()}>{copy.retry}</button></div>
                    : terms.isPending ? <p role="status">{copy.loading}</p>
                        : terms.data?.agreementContent?.trim() ? <div data-testid="legal-terms-content" className="whitespace-pre-wrap break-words">{terms.data.agreementContent}</div>
                            : <p role="status">{copy.empty}</p>}
            </article>
        </div>
    </main>;
}
