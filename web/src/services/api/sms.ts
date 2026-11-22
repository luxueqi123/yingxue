import { http } from "./request";
import type { VerificationPurpose } from "./verification";

export type SMSTemplate = {
    purpose: VerificationPurpose;
    templateId: string;
    parameters: Array<{ name: string; value: "code" | "minutes" }>;
};

export type SMSChannelInput = {
    name: string;
    provider: "aliyun" | "aliyun-pns" | "tencent";
    enabled: boolean;
    priority: number;
    dailyLimit: number;
    signName: string;
    appId: string;
    accessId: string;
    accessKey: string;
    templates: SMSTemplate[];
    version: number;
};

export type SMSChannel = Omit<SMSChannelInput, "accessId" | "accessKey"> & {
    id: string;
    hasCredentials: boolean;
    pluginEnabled: boolean;
};

export type SMSRecord = {
    id: string;
    state: "accepted" | "rejected" | "unknown";
    maskedPhone: string;
    errorCode: string;
    requestId: string;
};

export const getSMSChannels = () => http.get<SMSChannel[]>("/admin/sms/channels");

export function saveSMSChannel(id: string | undefined, input: SMSChannelInput) {
    return id
        ? http.put<SMSChannel>(`/admin/sms/channels/${encodeURIComponent(id)}`, input)
        : http.post<SMSChannel>("/admin/sms/channels", input);
}

export const testSMSChannel = (id: string, phone: string) =>
    http.post<SMSRecord>(`/admin/sms/channels/${encodeURIComponent(id)}/test`, { purpose: "register", phone });
