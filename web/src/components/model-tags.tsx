import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { ModelTag } from "@/lib/model-tags";
import "@/styles/shared/model-tags.css";

export function ModelTags({ tags }: { tags?: ModelTag[] }) {
    const { t } = useInterfaceTranslation();
    if (!tags?.length) return null;
    return <span className="model-tags" aria-label={t("sharedDialogsUi.modelTags")}>
        {tags.map((tag, index) => <span key={`${tag.text}-${index}`} className="model-tag" data-color={tag.color}>{tag.text}</span>)}
    </span>;
}
