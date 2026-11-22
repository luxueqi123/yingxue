import { expect, test } from 'bun:test';
import { Bone, Group } from 'three';
import { inferPrevisRig } from '../src/lib/canvas/previs/director-rig';

function skeleton(names: string[]) {
    const root = new Group();
    for (const name of names) {
        const bone = new Bone();
        bone.name = name;
        root.add(bone);
    }
    return root;
}

test('source director L_/R_ rig maps actual limbs and numbered spine, not twist helpers', () => {
    const names = ['Root', 'Hip', 'Pelvis', 'Waist', 'Spine01', 'Spine02', 'NeckTwist01', 'Head'];
    for (const side of ['L', 'R']) names.push(
        `${side}_UpperarmTwist01`, `${side}_ForearmTwist01`, `${side}_ThighTwist01`, `${side}_CalfTwist01`,
        `${side}_Clavicle`, `${side}_Upperarm`, `${side}_Forearm`, `${side}_Hand`, `${side}_Thigh`, `${side}_Calf`, `${side}_Foot`,
    );
    const rig = inferPrevisRig(skeleton(names), []);
    expect(rig.status).toBe('ready');
    expect(rig.boneMap).toMatchObject({root:'Root',hips:'Pelvis',spine:'Spine01',chest:'Spine02',head:'Head'});
    for (const [side, prefix] of [['left', 'L'], ['right', 'R']] as const) {
        for (const [role, suffix] of [['Shoulder','Clavicle'],['UpperArm','Upperarm'],['LowerArm','Forearm'],['Hand','Hand'],['UpperLeg','Thigh'],['LowerLeg','Calf'],['Foot','Foot']]) {
            expect(rig.boneMap[(side+role) as keyof typeof rig.boneMap]).toBe(`${prefix}_${suffix}`);
        }
    }
    expect(new Set(Object.values(rig.boneMap)).size).toBe(Object.keys(rig.boneMap).length);
});

test('existing Mixamo mapping and animation names remain intact', () => {
    const rig = inferPrevisRig(skeleton(['Root','mixamorigHips','mixamorigSpine','mixamorigSpine2','mixamorigNeck','mixamorigHead','mixamorigLeftArm','mixamorigRightArm','mixamorigLeftHand','mixamorigRightHand','mixamorigLeftHandIndex1']), ['Walk']);
    expect(rig.status).toBe('ready');
    expect(rig.boneMap).toMatchObject({leftUpperArm:'mixamorigLeftArm',rightUpperArm:'mixamorigRightArm',leftIndex1:'mixamorigLeftHandIndex1'});
    expect(rig.animationNames).toEqual(['Walk']);
});

test('twist-only limbs and named non-bone objects do not invent a usable rig', () => {
    const root = skeleton(['L_UpperarmTwist01', 'R_ForearmTwist02', 'L_ThighTwist01']);
    const decorative = new Group();
    decorative.name = 'L_Upperarm';
    root.add(decorative);
    expect(inferPrevisRig(root, [])).toEqual({status:'unmapped',boneMap:{},animationNames:[]});
});
