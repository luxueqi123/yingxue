import { Tooltip } from "antd";
import { CircleAlert } from "lucide-react";
import "./membership-offer-details.css";

export type MembershipCreditEstimate = {
    credits: number;
    yuanPerCredit: string;
    videoCount: number;
    reference: {
        model: string;
        resolution: string;
        seconds: number;
        creditsPerVideo: number;
    };
};

export type MembershipModelGroup = {
    label: string;
    models: readonly { name: string; id?: string }[];
};

const countFormat = new Intl.NumberFormat("zh-CN");

export function MembershipCreditSummary({ estimate }: { estimate: MembershipCreditEstimate }) {
    const { credits, yuanPerCredit, videoCount, reference } = estimate;
    return (
        <div className="membership-credit-summary">
            <p className="membership-credit-summary-amount">
                <strong>{countFormat.format(credits)}</strong> 积分 / 月
            </p>
            <div className="membership-credit-summary-meta">
                <span>1 积分 ≈ ¥{yuanPerCredit}</span>
                <span className="membership-credit-summary-count">
                    约 {countFormat.format(videoCount)} 条视频
                    <Tooltip placement="top" trigger={["hover", "focus", "click"]} title={`参考 ${reference.model} ${reference.resolution}，按成片时长每 ${reference.seconds} 秒折合 1 条、${reference.creditsPerVideo} 积分。实际扣分以生成页为准。`}>
                        <button type="button" className="membership-credit-summary-note" aria-label="积分与视频条数换算说明">
                            <CircleAlert size={14} aria-hidden />
                        </button>
                    </Tooltip>
                </span>
            </div>
        </div>
    );
}

export function MembershipModelAccess({ groups }: { groups: readonly MembershipModelGroup[] }) {
    return (
        <dl className="membership-model-access" aria-label="套餐模型">
            {groups.map(({ label, models }) => (
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                        {models.map((model, index) => (
                            <span key={model.name} title={model.id}>
                                {index > 0 && <span aria-hidden="true"> · </span>}
                                {model.name}
                            </span>
                        ))}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
