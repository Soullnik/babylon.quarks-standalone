import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
} from 'babylon.quarks';
import {fade} from '../shared/curves';
import {band} from '../shared/geometry';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/**
 * An aura and a weapon trail, two things mesh particles and trails do that billboards cannot.
 *
 * Left, an aura round a character: a crown of tongues on a band mesh turning round them, breathing
 * through `uvDistortion` (a noise map scrolled across the texture), its faces fading where they
 * look at the camera (`rim: 'fade'`) so it reads as a shell of light thick at its edges, and
 * motes rising.
 *
 * Right, a blade swinging to and fro: its trail is swept along the blade (`sideAxis`), the
 * surface the edge passed through rather than a line behind a point, and curved between frames
 * (`tessellation`) so a fast swing stays round.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 3, 9.5));
    camera.setTarget(new BVector3(0, 1.2, 0));
    addGround(scene);
    const heroMaterial = new StandardMaterial('hero', scene);
    heroMaterial.diffuseColor = new Color3(0.36, 0.36, 0.42);
    heroMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    const hero = MeshBuilder.CreateCapsule('hero', {height: 2.2, radius: 0.42}, scene);
    hero.position.set(-2.6, 1.1, 0);
    hero.material = heroMaterial;
    addLabel(scene, "Aura: uvDistortion, rim: 'fade'", new BVector3(-2.6, 2.6, 0), {height: 0.36});
    addLabel(scene, 'Swept trail: sideAxis', new BVector3(2.6, 2.6, 0), {height: 0.36});

    const system = (name: string, parameters: Partial<ParticleSystemParameters>) => {
        const ps = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            ...parameters,
        } as ParticleSystemParameters);
        ps.emitter.name = name;
        add(ps);
        return ps;
    };
    const standing = {
        startLife: new ConstantValue(1e6),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        looping: false,
        shape: new PointEmitter(),
    };

    // The crown: tongues standing on a band round the character, turning, breathing, rim-faded.
    const crown = system('Crown', {
        ...standing,
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Color4(1, 0.82, 0.42, 1)),
        renderMode: RenderMode.Mesh,
        renderAlignment: 'local',
        lighting: 'unlit',
        ...band({bottom: 0.9, top: 0.75, height: 2.2, segments: 48}),
        texture: baseTexture(scene, 'aura_strip', true, false),
        mapUV: {tiling: [4, 1], scroll: [0.06, 0]},
        uvDistortion: {
            map: baseTexture(scene, 'swirl', true),
            strength: 0.025,
            mapUV: {tiling: [2, 1], scroll: [0, -0.5]},
        },
        rim: {mode: 'fade', strength: 0.35, power: 2},
    });
    crown.emitter.position.set(-2.6, 0, 0);

    const motes = system('Motes', {
        startLife: new IntervalValue(1.2, 1.8),
        startSpeed: new IntervalValue(0.5, 1),
        startSize: new IntervalValue(0.08, 0.16),
        startColor: new RandomColor(new Color4(1, 0.8, 0.4, 1), new Color4(1, 0.95, 0.8, 1)),
        emissionOverTime: new ConstantValue(18),
        shape: new ConeEmitter({radius: 0.9, angle: 0.1, thickness: 0.2}),
        texture: baseTexture(scene, 'spark'),
    });
    motes.addBehavior(new ColorOverLife(fade(0.15, 0.6)));
    motes.emitter.rotation.x = -Math.PI / 2;
    motes.emitter.position.set(-2.6, 0.1, 0);

    // The blade: a pivot swinging a sword to and fro; the trail rides its tip.
    const steel = new StandardMaterial('steel', scene);
    steel.diffuseColor = new Color3(0.75, 0.78, 0.85);
    steel.specularColor = new Color3(0.9, 0.9, 1);
    const pivot = new TransformNode('Pivot', scene);
    pivot.position.set(2.2, 0.9, 0);
    const blade = MeshBuilder.CreateBox('blade', {width: 2.4, height: 0.09, depth: 0.02}, scene);
    blade.material = steel;
    blade.parent = pivot;
    blade.position.x = 1.3;
    const tip = new TransformNode('Blade tip', scene);
    tip.parent = pivot;
    tip.position.x = 1.3;
    const swing = system('Blade trail', {
        ...standing,
        startSize: new ConstantValue(2.4),
        startColor: new ConstantColor(new Color4(1, 0.75, 0.4, 1)),
        worldSpace: true,
        renderMode: RenderMode.Trail,
        texture: baseTexture(scene, 'streak'),
        rendererEmitterSettings: {
            startLength: new ConstantValue(26),
            followLocalOrigin: true,
            sideAxis: new BVector3(1, 0, 0),
            tessellation: 6,
        },
    });
    swing.emitter.parent = tip;

    let t = 0;
    return {
        update(delta) {
            t += delta;
            // Cuts to and fro in the screen's plane, the arc tipping a little as it goes.
            pivot.rotation.z = 0.5 + Math.sin(t * 4.5) * 1.2;
            pivot.rotation.y = 0.3 + Math.sin(t * 2.25) * 0.25;
        },
    };
}
