import { Group, Mesh, Quaternion, SkinnedMesh, Vector3 } from "three";
import { GLTFExporter, GLTFLoader } from "three-stdlib";
import { prepareLtvPrevisCameraAnimatedScene, bindLtvPrevisSceneAssets } from "../src/lib/canvas/previs/ltv-director-static-scene";
import { normalizePrevisImportedModel } from "../src/lib/canvas/previs/threebox-import";
import { resolvePrevisBoneRotation } from "../src/lib/canvas/previs/previs-animation-semantics";
import { buildLtvPrevisProjectNode } from "../src/lib/canvas/previs/ltv-director-project";
import { copyProductionCasePreviss } from "../src/lib/canvas/previs/production-case-director";
import { resolvePrevisViewFraming } from "../src/lib/canvas/previs/previs-view-modes";
import { adaptLtvNativeProject } from "../src/lib/canvas/ltv-native-project";

function vertices(model: any, object: any) {
    const wrapper = new Group();
    wrapper.position.fromArray(object.transform.position);
    wrapper.rotation.set(...object.transform.rotation); wrapper.scale.fromArray(object.transform.scale);
    wrapper.add(model); wrapper.updateMatrixWorld(true);
    const result: number[] = [];
    model.traverse((child: any) => {
        if (!(child instanceof Mesh)) return;
        if (child instanceof SkinnedMesh) child.skeleton.update();
        const position = new Vector3();
        for (let i = 0; i < child.geometry.attributes.position.count; i++) {
            child.getVertexPosition(i, position).applyMatrix4(child.matrixWorld);
            result.push(...position.toArray());
        }
    });
    wrapper.remove(model); return result;
}

export async function verifyFullEmptyCameraScene(input: any) {
    const { snapshot, nodeId, modelPaths, schemas, screenshots, preview, caseId, title } = input;
    const node = snapshot.nodes.find((n: any) => n.id === nodeId);
    const composition = node.data.compositionData, before = JSON.stringify(composition);
    const models = new Map<string, any>(), loader = new GLTFLoader();
    for (const [url, path] of Object.entries(modelPaths)) models.set(url, (await loader.loadAsync(path as string)).scene);
    const prepared = prepareLtvPrevisCameraAnimatedScene(composition, { id: nodeId, title, now: "2026-10-10T00:00:00Z" }, models);
    try {
        const resources = new Map(), checks = [];
        for (const asset of prepared.assets) {
            const object = prepared.scene.objects.find(o => o.id === asset.objectId)!;
            const original = vertices(asset.model, object);
            const binary = await new GLTFExporter().parseAsync(asset.model, { binary: true, onlyVisible: false });
            if (!(binary instanceof ArrayBuffer)) throw new Error("Expected an actual GLB");
            const restored = (await loader.parseAsync(binary, "")).scene;
            normalizePrevisImportedModel(restored, object.castShadow, object.receiveShadow, object.modelNormalization);
            for (const [key, value] of Object.entries(object.boneOverrides ?? {})) {
                const bone = object.rig!.boneMap[key as keyof typeof object.rig.boneMap]!;
                restored.getObjectByName(bone)!.quaternion.copy(new Quaternion(...resolvePrevisBoneRotation({ override: value, time: 0 })!));
            }
            const actual = vertices(restored, object);
            if (original.length !== actual.length) throw new Error("Round-trip vertex count changed");
            let maxError = 0;
            for (let i = 0; i < original.length; i++) maxError = Math.max(maxError, Math.abs(original[i] - actual[i]));
            if (maxError > 0.00005) throw new Error(`Round-trip geometry changed: ${maxError}`);
            const bytes = new Uint8Array(binary); let encoded = "";
            for (let i = 0; i < bytes.length; i += 32768) encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
            const saved = await (window as any).saveEmptyCameraModel({ objectId: object.id, base64: btoa(encoded) });
            resources.set(object.id, { url: saved.url });
            checks.push({ objectId: object.id, vertices: original.length / 3, maxError, sha256: saved.sha256 });
        }
        const scene = bindLtvPrevisSceneAssets(prepared.scene, resources);
        const imported = { sourceComposition: composition, scene, screenshots, preview };
        const built = buildLtvPrevisProjectNode(node, imported, { position: { x: 0, y: 0 }, width: 400, height: 300 });
        const copied = copyProductionCasePreviss([built.scene], built.nodes, new Map(built.nodes.map(n => [n.id, `copy:${n.id}`])), false);
        const reopened = JSON.parse(JSON.stringify(copied.previsScenes![0]));
        const framing = [0, 2.5, 5].map(playhead => resolvePrevisViewFraming({ scene, mode: "camera", playhead }));
        if (framing.some(value => JSON.stringify(value) !== JSON.stringify(framing[0]))) throw new Error("Empty source track invented camera movement");
        if (JSON.stringify(composition) !== before) throw new Error("Source mutated");
        const result = adaptLtvNativeProject(snapshot, { channels: [] }, caseId, title, schemas, new Map([[nodeId, imported]]));
        return { passed: true, checks, imported, fullScene: { objects: scene.objects.length,
            actors: scene.objects.filter(o => o.role === "actor").length, props: composition.props.length,
            cameras: scene.cameras.length, shots: scene.shots.length, screenshots: screenshots.length,
            capturesAndPreviewRetained: built.nodes.length - 1, duration: scene.shots[0].duration,
            emptyTracksRetained: scene.cameras.filter(c => c.ltvEmptyCameraTrack).length,
            reopenedEmptyTracksRetained: reopened.cameras.filter((c: any) => c.ltvEmptyCameraTrack).length },
            wholeProject: { adoptable: result.adoptable, issues: result.issues, readiness: result.readiness,
                nodes: result.project.nodes.length, connections: result.project.connections.length },
            sourceUnchanged: true, nativePersisted: false, normalGalleryAccepted: false, completeCaseAccepted: false };
    } finally { prepared.dispose(); }
}
