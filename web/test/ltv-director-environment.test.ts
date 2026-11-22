import { expect, test } from "bun:test";
import { Mesh } from "three";
import { prepareLtvPrevisEnvironment } from "../src/lib/canvas/previs/ltv-director-environment";
import { PrevisSceneEnvironment, PrevisLightView } from "../src/components/canvas/previs/director-scene-environment";

const env={skyColor:"#060608",groundVisible:true,groundOpacity:.4,groundHeight:0,sceneScale:3};
test("source environment uses exact four lights with no extra native ambient or floor",()=>{
 const {settings,ground}=prepareLtvPrevisEnvironment(env,"scene");
 expect(settings).toMatchObject({environmentIntensity:0,groundVisible:false,toneMapping:"none",gridVisible:false});
 expect(settings.lights.map(l=>l.type)).toEqual(["ambient","hemisphere","directional","directional"]);
 expect(settings.lights.map(l=>l.intensity)).toEqual([1.05,.85,1.2,.75]);
 expect(settings.lights[1].groundColor).toBe("#2c3140");
 expect(settings.lights[2]).toMatchObject({shadowNear:.5,shadowFar:50,castShadow:true});
 expect(ground.object.transform.scale).toEqual([3,3,3]);
 expect((ground.model.children[0] as Mesh).material).toMatchObject({transparent:true,opacity:.4,roughness:.9});
});
test("source ground height is world-height offset and visibility has the original threshold",()=>{
 const hidden=prepareLtvPrevisEnvironment({...env,groundHeight:2,groundOpacity:.01},"test");
 expect(hidden.ground.object.transform.position[1]).toBeCloseTo(2,12);
 expect(hidden.ground.object.visible).toBe(false);
 expect(prepareLtvPrevisEnvironment({...env,groundVisible:false},"test").ground.object.visible).toBe(false);
});
test("native environment component keeps its old floor unless explicitly disabled",()=>{
 const children=(PrevisSceneEnvironment({scene:{environmentIntensity:.7,lights:[]}}).props as any).children;
 expect(children[2].type).toBe("mesh");
 expect((PrevisSceneEnvironment({scene:{environmentIntensity:0,lights:[],groundVisible:false}}).props as any).children[2]).toBeNull();
 const light=prepareLtvPrevisEnvironment(env,"scene").settings.lights[1];
 expect(PrevisLightView({light}).type).toBe("hemisphereLight");
});
test("unresolved environment media and malformed values fail without a fake plain sky",()=>{
 for(const patch of [{panoramaUrl:"https://example.test/pano.jpg"},{gaussianSplatUrl:"asset"},{groundOpacity:-1},{groundHeight:NaN},{sceneScale:Infinity},{skyColor:"bad"}])expect(()=>prepareLtvPrevisEnvironment({...env,...patch},"scene")).toThrow();
});
