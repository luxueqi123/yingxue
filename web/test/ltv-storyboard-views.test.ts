import {expect,test} from "bun:test";
import {mapLtvStoryboardViews} from "../src/lib/canvas/ltv-storyboard-views";

test("原视图名称、当前创意视图和隐藏列映射保留",()=>{
    const source={viewMode:"table",activeViewId:"creative",views:[{id:"default",name:"导演分镜",type:"table",tableConfig:{columnVisibility:{dialogue:false,characterAction:true}}},{id:"creative",name:"我的创意视图",type:"creative"}]};
    const result=mapLtvStoryboardViews(source);
    expect(result.issues).toEqual([]);
    expect(result.activeId).toBe("creative");
    expect(result.views[0].name).toBe("导演分镜");
    expect(result.views[0].visibleColumns).not.toContain("dialogue");
    expect(result.views[0].visibleColumns).toContain("performanceBlocking");
    expect(source.views[0].tableConfig?.columnVisibility.dialogue).toBe(false);
});

test("旧版仅保存viewMode时恢复内置视图，未知配置不静默删除",()=>{
    expect(mapLtvStoryboardViews({viewMode:"creative"}).activeId).toBe("creative");
    expect(mapLtvStoryboardViews({activeViewId:"missing"}).issues.length).toBeGreaterThan(0);
    expect(mapLtvStoryboardViews({views:[{id:"v",name:"v",type:"table",tableConfig:{columnVisibility:{privateField:true}}}]}).issues.length).toBeGreaterThan(0);
});
