import { http } from "./request";

export type MembershipPlan = {
    id: string; name: string; description: string; version: number; enabled: boolean; sortOrder: number;
    monthlyAmountFen: number; annualAmountFen: number; monthlyCreditsMicrocredits: number;
    concurrentTasks: number; storageBytes: number; creditGraceDays: number;
    monthlyProductId: string; annualProductId: string;
};
export type MembershipSubscription = {
    id: string; planName: string; planVersion: number; startsAt: string; endsAt: string;
    months: number; grantedCycles: number; nextGrantAt?: string; paymentOrderId: string;
};
export type MembershipLot = {
    id: string; name: string; availableMicrocredits: number; reservedMicrocredits: number; expiresAt: string;
};
export type Membership = { plans: MembershipPlan[]; active: MembershipPlan | null; subscriptions: MembershipSubscription[]; lots: MembershipLot[] };
export type MembershipPlanInput = Omit<MembershipPlan, "id" | "monthlyProductId" | "annualProductId">;
export const getMembership = (signal?: AbortSignal) => http.get<Membership>("/membership", { signal });
export const getAdminMembershipPlans = (signal?: AbortSignal) => http.get<{ plans: MembershipPlan[] }>("/admin/membership/plans", { signal });
export const saveMembershipPlan = (id: string | undefined, input: MembershipPlanInput) => id
    ? http.patch<{ plan: MembershipPlan }>(`/admin/membership/plans/${encodeURIComponent(id)}`, input)
    : http.post<{ plan: MembershipPlan }>("/admin/membership/plans", input);
