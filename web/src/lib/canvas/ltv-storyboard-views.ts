import type { StoryboardColumn, StoryboardView } from "@/types/canvas";
import { ltvStoryboardColumns } from "./ltv-storyboard";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fields = new Set<string>(ltvStoryboardColumns);

export function mapLtvStoryboardViews(data: Record<string, unknown>) {
    const issues: string[] = [];
    const source = data.views === undefined ? [{ id: "default", type: "table", name: "脚本视图" }, { id: "creative", type: "creative", name: "创意视图" }] : data.views;
    if (!Array.isArray(source) || !source.length) return { views: [] as StoryboardView[], activeId: "", issues: ["原分镜视图列表无效"] };
    const ids = new Set<string>();
    const views: StoryboardView[] = [];
    for (const value of source) {
        const view=object(value), config=object(view.tableConfig), visibility=object(config.columnVisibility);
        if (typeof view.id!=="string" || !view.id || ids.has(view.id) || typeof view.name!=="string" || !["table","creative"].includes(String(view.type))) { issues.push("原视图标识、名称或类型无效");continue; }
        ids.add(view.id);
        if(Object.keys(view).some(key=>!["id","type","name","tableConfig"].includes(key))||Object.keys(config).some(key=>!["columnVisibility","columnFilters"].includes(key)))issues.push(`视图${view.id}含未映射配置`);
        if(config.columnFilters!==undefined&&(!Array.isArray(config.columnFilters)||config.columnFilters.length))issues.push(`视图${view.id}含尚未映射的列筛选条件`);
        const columns = new Set(ltvStoryboardColumns);
        for(const [field,visible] of Object.entries(visibility)) {
            const mapped=field==="characterAction"?"performanceBlocking":field;
            if(!fields.has(mapped)||typeof visible!=="boolean") {issues.push(`视图${view.id}的列${field}未完整映射`);continue;}
            if(visible)columns.add(mapped as StoryboardColumn);else columns.delete(mapped as StoryboardColumn);
        }
        views.push({id:view.id,name:view.name,type:view.type as StoryboardView["type"],visibleColumns:Array.from(columns)});
    }
    const requested=typeof data.activeViewId==="string"?data.activeViewId:undefined;
    const mode=data.viewMode===undefined?"table":data.viewMode;
    if(mode!=="table"&&mode!=="creative")issues.push("原分镜视图模式未映射");
    const active=requested?views.find(view=>view.id===requested):views.find(view=>view.type===mode);
    if(!active)issues.push("原分镜当前视图缺失");
    return {views,activeId:active?.id||"",issues};
}
