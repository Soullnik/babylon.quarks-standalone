import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    ApplyForce,
    Bezier,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    Gradient,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
    WidthOverLength,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/** Seconds between replays of the one-shot effect. */
const REFRESH_INTERVAL = 2.8;

/** 10×10 `texture1.png`, counted from the top left. */
const TILE = {dot: 0, glow: 1, ring: 4, star: 84};

const GOLD = new Color4(1, 0.78, 0.28, 1);

/** Colour over life: `from` at birth to `to` at death, fading in quickly and out at the end. */
function goldFade(from: Color3, to: Color3, fadeOut = 0.6) {
    return new Gradient(
        [
            [from, 0],
            [to, 1],
        ],
        [
            [0, 0],
            [1, 0.08],
            [1, fadeOut],
            [0, 1],
        ]
    );
}

function restartTracked(tracked: ParticleSystem[]) {
    for (const s of tracked) {
        s.restart();
        s.play();
    }
}

/**
 * A level-up on a game character: a shockwave ring on the ground (HorizontalBillBoard), a column
 * of light, golden trail ribbons spiralling up around the character (Trail render mode plus
 * OrbitOverLife), and a burst of spinning stars that falls back down under a force. One-shot
 * systems, replayed every few seconds.
 */
export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 4.2, 13));
    camera.setTarget(new BVector3(0, 2, 0));
    const texture = createSharedTexture(scene);
    const tracked: ParticleSystem[] = [];
    const add = (system: ParticleSystem) => {
        batchRenderer.addSystem(system);
        systems.push(system);
        tracked.push(system);
    };

    // The character and the ground it stands on, so the effect has a scale.
    const ground = MeshBuilder.CreateDisc('levelUpGround', {radius: 40, tessellation: 64}, scene);
    ground.rotation.x = Math.PI / 2;
    const groundMat = new StandardMaterial('levelUpGroundMat', scene);
    groundMat.diffuseColor = new Color3(0.07, 0.075, 0.1);
    groundMat.specularColor = Color3.Black();
    ground.material = groundMat;
    const hero = MeshBuilder.CreateCapsule('levelUpHero', {height: 2.4, radius: 0.45}, scene);
    hero.position.y = 1.2;
    const heroMat = new StandardMaterial('levelUpHeroMat', scene);
    heroMat.diffuseColor = new Color3(0.16, 0.17, 0.22);
    heroMat.specularColor = new Color3(0.1, 0.1, 0.1);
    hero.material = heroMat;

    // Shockwave: a ring lying on the ground that grows and fades.
    const shockwave = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(0.9),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(14),
        startColor: new ConstantColor(GOLD),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
            {time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
            {time: 0.18, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
        ],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.ring),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 1,
    });
    shockwave.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.05, 0.6, 0.9, 1), 0]])));
    shockwave.addBehavior(new ColorOverLife(goldFade(new Color3(1, 1, 1), new Color3(1, 0.6, 0.15), 0.4)));
    shockwave.emitter.position.y = 0.05;
    add(shockwave);

    // A soft glow pooled on the ground under the character.
    const groundGlow = new ParticleSystem({
        scene,
        duration: 2,
        looping: false,
        startLife: new ConstantValue(1.8),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(9),
        startColor: new ConstantColor(new Color4(1, 0.7, 0.25, 0.8)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.glow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 0,
    });
    groundGlow.addBehavior(new ColorOverLife(goldFade(new Color3(1, 1, 1), new Color3(1, 0.8, 0.4), 0.5)));
    groundGlow.emitter.position.y = 0.04;
    add(groundGlow);

    // Column of light: soft glows rising slowly from a small circle, so they stack into a beam.
    const column = new ParticleSystem({
        scene,
        duration: 1.2,
        looping: false,
        startLife: new IntervalValue(0.9, 1.3),
        startSpeed: new IntervalValue(3, 5),
        startSize: new IntervalValue(1.4, 2.4),
        startColor: new RandomColor(new Color4(1, 0.8, 0.4, 0.7), new Color4(1, 0.95, 0.75, 0.85)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(70),
        shape: new ConeEmitter({radius: 0.6, angle: 0, thickness: 1}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.glow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    column.addBehavior(new ColorOverLife(goldFade(new Color3(1, 1, 1), new Color3(1, 0.7, 0.3))));
    column.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.6, 1, 1, 0.4), 0]])));
    // The cone emits along its local +z; tip it up.
    column.emitter.rotation.x = -Math.PI / 2;
    add(column);

    // Golden ribbons spiralling up around the character: trails shot straight up from a ring
    // while OrbitOverLife turns them about the emitter's axis, so each trail draws a helix.
    const spiral = new ParticleSystem({
        scene,
        duration: 0.5,
        looping: false,
        startLife: new IntervalValue(1, 1.3),
        startSpeed: new IntervalValue(4.5, 6),
        startSize: new IntervalValue(0.12, 0.2),
        startColor: new ConstantColor(GOLD),
        worldSpace: false,
        emissionOverTime: new ConstantValue(28),
        shape: new ConeEmitter({radius: 1.3, angle: 0, thickness: 0}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.dot),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(40), followLocalOrigin: false},
        renderOrder: 3,
    });
    spiral.addBehavior(new OrbitOverLife(new ConstantValue(4.5), new BVector3(0, 0, 1)));
    spiral.addBehavior(new ColorOverLife(goldFade(new Color3(1, 1, 0.9), new Color3(1, 0.55, 0.1))));
    spiral.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])));
    spiral.emitter.rotation.x = -Math.PI / 2;
    add(spiral);

    // Stars: a burst over the character's head that spins and drifts back down.
    const stars = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(1.1, 1.6),
        startSpeed: new IntervalValue(3, 6),
        startSize: new IntervalValue(0.35, 0.7),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(new Color4(1, 0.85, 0.35, 1), new Color4(1, 1, 0.85, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0.25, count: new ConstantValue(40), cycle: 1, interval: 0, probability: 1}],
        shape: new SphereEmitter({radius: 0.4, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(TILE.star),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 4,
    });
    stars.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(6)));
    stars.addBehavior(new RotationOverLife(new IntervalValue(-4, 4)));
    stars.addBehavior(new ColorOverLife(goldFade(new Color3(1, 1, 1), new Color3(1, 0.7, 0.2), 0.55)));
    stars.emitter.position.y = 2.8;
    add(stars);

    demoState.levelUp = {tracked, elapsed: 0};
    restartTracked(tracked);
}

export function update({demoState}: DemoContext, delta: number) {
    const st = demoState.levelUp;
    if (!st?.tracked?.length) {
        return;
    }
    st.elapsed += delta;
    if (st.elapsed >= REFRESH_INTERVAL) {
        st.elapsed = 0;
        restartTracked(st.tracked);
    }
}
