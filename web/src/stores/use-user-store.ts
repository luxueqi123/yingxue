import { create } from "zustand";

import { DEFAULT_DRAWING_ENGINE, type CanvasDrawingEngineSetting } from "@/lib/canvas/canvas-drawing-engine";

export type { LocalUser } from "@/services/api/auth";
import type { LocalUser } from "@/services/api/auth";
import type { PublicUserGroup } from "@/services/api/user-groups";

export type RuntimeLimits = {
    activeTaskLimit: number;
    resourceUploadMB: number;
    sessionUploadMB: number;
    recycleBinRetentionDays?: number;
};

export type FeatureAvailability = {
    welcomeEnabled: boolean;
    shortDramaEnabled: boolean;
    taskCenterEnabled: boolean;
    creditsEnabled: boolean;
    teamsEnabled: boolean;
    customChannelsEnabled: boolean;
    frontendModelsEnabled: boolean;
    pluginCenterEnabled: boolean;
    systemPluginsVisibleToUsers: boolean;
    inspirationSourcesVisible: boolean;
    imageWorkbenchEnabled: boolean;
    videoWorkbenchEnabled: boolean;
    ecommerceEnabled: boolean;
    ecommerceVideoEnabled: boolean;
    desktopLocalChannelsEnabled: boolean;
    configured?: boolean;
    updatedBy?: string;
    updatedAt?: string;
};

export const defaultFeatureAvailability: FeatureAvailability = {
    welcomeEnabled: true,
    shortDramaEnabled: true,
    taskCenterEnabled: true,
    creditsEnabled: true,
    teamsEnabled: false,
    customChannelsEnabled: true,
    frontendModelsEnabled: false,
    pluginCenterEnabled: true,
    systemPluginsVisibleToUsers: true,
    inspirationSourcesVisible: true,
    imageWorkbenchEnabled: false,
    videoWorkbenchEnabled: false,
    ecommerceEnabled: false,
    ecommerceVideoEnabled: false,
    desktopLocalChannelsEnabled: false,
};

type UserStore = {
    hydrated: boolean;
    user: LocalUser | null;
    userGroup: PublicUserGroup | null;
    runtimeLimits: RuntimeLimits;
    drawingEngine: CanvasDrawingEngineSetting;
    features: FeatureAvailability;
    referralAvailable: boolean;
    setUser: (user: LocalUser | null) => void;
    setUserGroup: (group?: PublicUserGroup | null) => void;
    setRuntimeLimits: (limits?: RuntimeLimits) => void;
    setDrawingEngine: (setting?: CanvasDrawingEngineSetting) => void;
    setFeatures: (features?: FeatureAvailability) => void;
    setReferralAvailable: (available?: boolean) => void;
    setHydrated: (hydrated: boolean) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    hydrated: false,
    user: null,
    userGroup: null,
    runtimeLimits: { activeTaskLimit: 5, resourceUploadMB: 50, sessionUploadMB: 32, recycleBinRetentionDays: 30 },
    drawingEngine: { defaultEngine: DEFAULT_DRAWING_ENGINE },
    features: defaultFeatureAvailability,
    referralAvailable: false,
    setUser: (user) => set({ user }),
    setUserGroup: (userGroup) => set({ userGroup: userGroup ?? null }),
    setRuntimeLimits: (runtimeLimits) => set({ runtimeLimits: runtimeLimits || { activeTaskLimit: 5, resourceUploadMB: 50, sessionUploadMB: 32, recycleBinRetentionDays: 30 } }),
    setDrawingEngine: (drawingEngine) => set({ drawingEngine: drawingEngine || { defaultEngine: DEFAULT_DRAWING_ENGINE } }),
    setFeatures: (features) => set({ features: features ? { ...defaultFeatureAvailability, ...features } : defaultFeatureAvailability }),
    setHydrated: (hydrated) => set({ hydrated }),
    setReferralAvailable: (available) => set({ referralAvailable: Boolean(available) }),
    clearSession: () =>
        set({
            user: null,
            userGroup: null,
            runtimeLimits: { activeTaskLimit: 5, resourceUploadMB: 50, sessionUploadMB: 32, recycleBinRetentionDays: 30 },
            drawingEngine: { defaultEngine: DEFAULT_DRAWING_ENGINE },
            features: defaultFeatureAvailability,
            referralAvailable: false,
        }),
}));
