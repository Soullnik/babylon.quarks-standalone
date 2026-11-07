import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ColorOverLength,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    Gradient,
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
import {baseTexture, kenneyTexture} from '../shared/textures';
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
    // The smear: a wide glow and a short white-hot core on the same tip, each a swept trail whose
    // texture runs bright at the head (the blade) to nothing at the tail and dense toward the
    // blade's tip, coloured along its length.
    const smear = kenneyTexture(scene, 'smear');
    const smearLayer = (name: string, length: number, color: Color4, overLength: Gradient) => {
        const layer = system(name, {
            ...standing,
            startSize: new ConstantValue(2.4),
            startColor: new ConstantColor(color),
            worldSpace: true,
            renderMode: RenderMode.Trail,
            texture: smear,
            rendererEmitterSettings: {
                startLength: new ConstantValue(length),
                followLocalOrigin: true,
                // Along the blade, the way the smear's V runs from the hilt to the tip.
                sideAxis: new BVector3(-1, 0, 0),
                tessellation: 6,
            },
        });
        layer.addBehavior(new ColorOverLength(overLength));
        layer.emitter.parent = tip;
        return layer;
    };
    smearLayer(
        'Blade glow',
        30,
        new Color4(1, 0.62, 0.28, 1),
        new Gradient(
            [
                [new Color3(0.9, 0.25, 0.05), 0],
                [new Color3(1, 0.6, 0.2), 0.6],
                [new Color3(1, 0.85, 0.55), 1],
            ],
            [
                [0, 0],
                [1, 0.3],
                [1, 1],
            ]
        )
    );
    smearLayer(
        'Blade core',
        12,
        new Color4(1, 0.95, 0.85, 1),
        new Gradient(
            [
                [new Color3(1, 0.8, 0.5), 0],
                [new Color3(1, 1, 1), 1],
            ],
            [
                [0, 0],
                [1, 1],
            ]
        )
    );

    // A sword's swing: a fast cut, a hold while the smear dies away, the cut back, a hold.
    const CUT = 0.18;
    const HOLD = 0.62;
    const FROM = 1.7;
    const TO = -0.75;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const angleAt = (time: number) => {
        const phase = time % (2 * (CUT + HOLD));
        if (phase < CUT) return FROM + (TO - FROM) * ease(phase / CUT);
        if (phase < CUT + HOLD) return TO;
        if (phase < 2 * CUT + HOLD) return TO + (FROM - TO) * ease((phase - CUT - HOLD) / CUT);
        return FROM;
    };

    let t = 0;
    return {
        update(delta) {
            t += delta;
            // Cuts in the screen's plane, the arc tipping a little toward the camera.
            pivot.rotation.z = angleAt(t);
            pivot.rotation.y = 0.35;
            // The tip's place this frame, before the renderer samples it (Babylon would update the
            // world matrices only when it draws, a frame after the trail read them).
            pivot.computeWorldMatrix(true);
            tip.computeWorldMatrix(true);
        },
    };
}
