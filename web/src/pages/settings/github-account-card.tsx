import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { GithubOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { beginProfileGitHubLink, getProfileGitHub } from "@/services/api/profile";

export function GitHubAccountCard({ userId }: { userId: string }) {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [callback] = useState(searchParams.get("github"));
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const account = useQuery({ queryKey: ["profile-github", userId], queryFn: ({ signal }) => getProfileGitHub(signal), staleTime: 0, retry: false });

    useEffect(() => {
        if (!searchParams.has("github") && !searchParams.has("githubError")) return;
        const next = new URLSearchParams(searchParams);
        next.delete("github");
        next.delete("githubError");
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const link = async () => {
        if (pending) return;
        setPending(true);
        setError("");
        try {
            const result = await beginProfileGitHubLink();
            window.location.assign(result.url);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : t("profileGitHub.linkFailed"));
            setPending(false);
        }
    };

    if (!account.isPending && !account.isError && !account.data?.enabled && !account.data?.linked) return null;

    return (
        <section className="profile-overview" aria-labelledby="profile-github-title">
            <div className="profile-overview-heading"><h3 id="profile-github-title">GitHub</h3></div>
            <div className="profile-overview-main">
                <GithubOutlined className="text-2xl shrink-0" aria-hidden="true" />
                <div className="profile-overview-identity">
                    {account.isError ? <span role="alert">{t("profileGitHub.loadFailed")}</span> : account.data ? <strong>{account.data.linked ? t("profileGitHub.linked", { username: account.data.username ? `@${account.data.username}` : "GitHub" }) : t("profileGitHub.notLinked")}</strong> : null}
                </div>
                {account.isError ? <Button onClick={() => void account.refetch()}>{t("common.retry")}</Button> : !account.data?.linked ? <Button loading={pending || account.isPending} disabled={!account.data?.enabled} onClick={() => void link()}>{t("profileGitHub.link")}</Button> : null}
            </div>
            {error || callback === "error" ? <p role="alert">{error || t("profileGitHub.linkFailed")}</p> : callback === "cancelled" ? <p role="status">{t("profileGitHub.cancelled")}</p> : null}
        </section>
    );
}
