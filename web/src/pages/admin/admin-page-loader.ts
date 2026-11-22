import type { ComponentType } from "react";
import { preloadableLazy } from "@/lib/preloadable-lazy";

// 后台页面按需加载并复用已加载模块，避免预取全部编辑器抢占当前页面请求。

// 后台路由页面都不接收 props。
type AdminPageModule = { default: ComponentType };

export function lazyAdminPage(factory: () => Promise<AdminPageModule>) {
    return preloadableLazy(factory);
}
