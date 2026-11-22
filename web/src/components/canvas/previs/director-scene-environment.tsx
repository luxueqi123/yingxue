import type { PrevisLight, PrevisScene } from "@/types/previs";

export function PrevisLightView({ light }: { light: PrevisLight }) {
    const position = light.transform.position;
    if (light.type === "ambient") return <ambientLight color={light.color} intensity={light.intensity} />;
    if (light.type === "hemisphere") return <hemisphereLight position={position} color={light.color} groundColor={light.groundColor ?? "#444444"} intensity={light.intensity} />;
    if (light.type === "point") return <pointLight position={position} color={light.color} intensity={light.intensity} castShadow={light.castShadow} />;
    if (light.type === "spot") return <spotLight position={position} color={light.color} intensity={light.intensity} angle={light.angle} penumbra={light.penumbra} castShadow={light.castShadow} />;
    return <directionalLight position={position} color={light.color} intensity={light.intensity} castShadow={light.castShadow} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={light.shadowNear ?? 0.5} shadow-camera-far={light.shadowFar ?? 500} />;
}

export function PrevisSceneEnvironment({ scene }: { scene: Pick<PrevisScene, "environmentIntensity" | "lights" | "groundVisible"> }) {
    return <>
        <ambientLight intensity={scene.environmentIntensity * 0.35} />
        {scene.lights.map((light) => <PrevisLightView key={light.id} light={light} />)}
        {scene.groundVisible !== false ? <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.012, 0]}>
            <planeGeometry args={[120, 120]} />
            <meshStandardMaterial color="#aeb7bf" roughness={0.92} />
        </mesh> : null}
    </>;
}
