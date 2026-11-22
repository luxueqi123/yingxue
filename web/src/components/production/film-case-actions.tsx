import { useState } from "react";
import { App, Button, Input, Modal } from "antd";
import { Heart, Share2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { getCaseReaction, setCaseLiked } from "@/services/api/case-reactions";
import { useUserStore } from "@/stores/use-user-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function FilmCaseActions({ caseId, onViewProcess }: { caseId: string; onViewProcess?: () => void }) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const user = useUserStore((state) => state.user);
    const navigate = useNavigate();
    const client = useQueryClient();
    const [sharing, setSharing] = useState(false);
    const [copying, setCopying] = useState(false);
    const path = `/?case=${encodeURIComponent(caseId.replace(/^case-/, ""))}`;
    const shareUrl = new URL(path, window.location.origin).href;
    const key = ["case-reaction", caseId, user?.id || "public"];
    const reaction = useQuery({ queryKey: key, queryFn: ({ signal }) => getCaseReaction(caseId, !!user, signal), staleTime: 15000 });
    const change = useMutation({
        mutationFn: (input: { id: string; userId: string; liked: boolean }) => setCaseLiked(input.id, input.liked),
        onSuccess: (value, input) => {
            client.setQueryData(["case-reaction", input.id, input.userId], value);
            void client.invalidateQueries({ queryKey: ["case-reaction", input.id] });
        },
        onError: (error: Error) => {
            void message.error(error.message);
        },
    });
    const like = () => {
        if (!user) {
            navigate(`/login?next=${encodeURIComponent(path)}`);
            return;
        }
        if (reaction.isError) {
            void reaction.refetch();
            return;
        }
        if (!reaction.data || change.isPending) return;
        change.mutate({ id: caseId, userId: user.id, liked: !reaction.data.liked });
    };
    return (
        <>
            {onViewProcess ? (
                <button type="button" className="film-case-action" onClick={onViewProcess}>
                    {t("galleryOpenCanvas")}
                </button>
            ) : null}
            <button
                type="button"
                className="film-case-action film-case-like"
                aria-label={t(reaction.data?.liked ? "galleryUnlike" : "galleryLike")}
                aria-pressed={!!reaction.data?.liked}
                aria-busy={change.isPending}
                disabled={change.isPending || (reaction.isPending && !!user)}
                onClick={like}
                title={reaction.isError ? t("galleryReactionRetry") : undefined}
            >
                <Heart size={19} fill={reaction.data?.liked ? "currentColor" : "none"} />
                <span>{reaction.data?.count ?? "—"}</span>
            </button>
            <button type="button" className="film-case-action film-case-share" aria-label={t("galleryShare")} title={t("galleryShare")} onClick={() => setSharing(true)}>
                <Share2 size={17} />
            </button>
            <Modal title={t("galleryShare")} open={sharing} onCancel={() => setSharing(false)} footer={null} destroyOnHidden>
                <Input aria-label={t("galleryShareLink")} value={shareUrl} readOnly onFocus={(event) => event.target.select()} />
                <Button
                    className="film-case-copy-link"
                    loading={copying}
                    onClick={() => {
                        if (!navigator.clipboard) {
                            void message.error(t("galleryCopyLinkFailed"));
                            return;
                        }
                        setCopying(true);
                        void navigator.clipboard
                            .writeText(shareUrl)
                            .then(
                                () => {
                                    void message.success(t("galleryLinkCopied"));
                                    setSharing(false);
                                },
                                () => {
                                    void message.error(t("galleryCopyLinkFailed"));
                                },
                            )
                            .finally(() => setCopying(false));
                    }}
                >
                    {t("galleryCopyLink")}
                </Button>
            </Modal>
        </>
    );
}
