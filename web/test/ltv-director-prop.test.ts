import { expect, test } from "bun:test";
import { Box3, Euler, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import { applyLtvPrevisSceneTransform, prepareLtvPrevisProp } from "../src/lib/canvas/previs/ltv-director-prop";

const source={assetId:"mesh_cylinder",position:{x:0.284,y:0.078,z:3.979},rotation:{x:0,y:0,z:0},scale:{x:0.651,y:0.651,z:0.651},uniformScale:1.7,color:"#d7e7ff",visible:true};
const identity={id:"prop",name:"圆柱"};
test("source cylinder retains .42 radius, .9 height, ground offset and material",()=>{
 const {model,object}=prepareLtvPrevisProp(source,{sceneScale:3},identity);
 const box=new Box3().setFromObject(model),mesh=model.children[0] as Mesh;
 expect(box.min.y).toBeCloseTo(0,6);expect(box.max.y).toBeCloseTo(.9,6);expect(box.max.x).toBeCloseTo(.42,6);
 expect(object.transform.position).toEqual([.284*3,.078*3,3.979*3]);
 expect(object.transform.scale[0]).toBeCloseTo(.651*1.7*3,12);
 expect(mesh.material).toMatchObject({roughness:.62,metalness:.04});
 expect(object.modelNormalization).toBe("preserve-source");
});
test("source torus remains a ring, not a default primitive",()=>{
 const {model}=prepareLtvPrevisProp({...source,assetId:"mesh_torus"},{},identity);
 const mesh=model.children[0] as Mesh;
 expect(mesh.geometry.type).toBe("TorusGeometry");expect(mesh.position.y).toBe(.46);
 expect(mesh.geometry.parameters).toMatchObject({radius:.34,tube:.12,radialSegments:20,tubularSegments:48});
});

test("source chair, three-metre wall and cube retain their exact component geometry and materials",()=>{
 for(const [assetId,meshes,width,height,depth,roughness,metalness] of [
  ["chair",6,.44,.88,.43,.7,.1],
  ["wall_3m",1,3,2.4,.15,.7,.1],
  ["mesh_cube",1,.8,.8,.8,.62,.04],
 ] as const){
  const {model,object}=prepareLtvPrevisProp({...source,assetId,color:"#3b2f27"},{},identity);
  const box=new Box3().setFromObject(model),size=box.getSize(new Vector3());
  expect(model.children).toHaveLength(meshes);
  expect(size.x).toBeCloseTo(width,6);expect(size.y).toBeCloseTo(height,6);expect(size.z).toBeCloseTo(depth,6);
  expect(box.min.y).toBeCloseTo(0,6);
  for(const child of model.children){
   const mesh=child as Mesh;
   expect(mesh.geometry.type).toBe("BoxGeometry");
   expect(mesh.material).toMatchObject({roughness,metalness});
   expect((mesh.material as any).color.getHexString()).toBe("3b2f27");
  }
  expect(object.modelNormalization).toBe("preserve-source");
 }
});
test("source scene transform composition preserves tilted nonuniform objects",()=>{
 const original={position:[1,2,3],rotation:[.1,.2,.3],scale:[2,3,4]} as const;
 const transform={position:[...original.position],rotation:[...original.rotation],scale:[...original.scale]} as any;
 const result=applyLtvPrevisSceneTransform(transform,{sceneScale:3,sceneRotation:{x:10,y:20,z:30},sceneTranslation:{x:4,y:5,z:6}});
 const expected=new Matrix4().compose(new Vector3(4,5,6),new Quaternion().setFromEuler(new Euler(Math.PI/18,Math.PI/9,Math.PI/6)),new Vector3(3,3,3)).multiply(new Matrix4().compose(new Vector3(1,2,3),new Quaternion().setFromEuler(new Euler(.1,.2,.3)),new Vector3(2,3,4)));
 const actual=new Matrix4().compose(new Vector3(...result.position),new Quaternion().setFromEuler(new Euler(...result.rotation)),new Vector3(...result.scale));
 expect(Math.max(...actual.elements.map((n,i)=>Math.abs(n-expected.elements[i])))).toBeLessThan(1e-12);
 expect(transform).toEqual(original);
});
test("unknown source geometry and malformed transforms do not receive a fallback mesh",()=>{
 for(const patch of [{assetId:"unknown"},{modelUrl:"https://example.test/model.glb"},{scale:{x:0,y:1,z:1}},{uniformScale:Infinity},{rotation:{x:NaN,y:0,z:0}}])expect(()=>prepareLtvPrevisProp({...source,...patch},{},identity)).toThrow();
});
