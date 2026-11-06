import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    Gradient,
    IntervalValue,
    LimitSpeedOverLife,
    OrbitOverLife,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
    Vector3Function,
    WidthOverLength,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {baseTexture, sheetOf} from '../shared/textures';
import {every, replay} from '../shared/timing';
import type {DemoContext, DemoRun} from '../types';

/** Seconds between replays of the one-shot effect. */
const REPLAY = 3;

/** One burst of `count` at `time` seconds into the system. */
const burst = (time: number, count: number) => ({
    time,
    count: new ConstantValue(count),
    cycle: 1,
    interval: 0,
    probability: 1,
});

/** Colour from `from` to `to` over life; alpha held until `hold`, then out (in by `fadeIn`). */
function hold(from: Color3, to: Color3, holdUntil = 0.7, fadeIn = 0): Gradient {
    return new Gradient(
        [
            [from, 0],
            [to, 1],
        ],
        fadeIn > 0
            ? [
                  [0, 0],
                  [1, fadeIn],
                  [1, holdUntil],
                  [0, 1],
              ]
            : [
                  [1, 0],
                  [1, holdUntil],
                  [0, 1],
              ]
    );
}

const WHITE = new Color3(1, 1, 1);
const GOLD = new Color3(1, 0.72, 0.25);
const DEEP = new Color3(1, 0.45, 0.1);

/**
 * A level-up on a character, built in stages as a game's effect is: the light gathers on the
 * ground and a column of light stands round the character, rings rising up it; two shockwaves run out over the ground and kick up
 * dust; golden ribbons spiral up (Trail with `OrbitOverLife` and `WidthOverLength`); then a flash
 * at the chest throws glints that spin and fall, and motes keep rising after. Replayed every few
 * seconds.
 */
export function init({scene, camera, add, systems}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 3.6, 11));
    camera.setTarget(new BVector3(0, 1.7, 0));
    const glow = baseTexture(scene, 'glow');
    const ringTexture = baseTexture(scene, 'ring');
    const streak = baseTexture(scene, 'streak');
    const glint = baseTexture(scene, 'glint');
    const flash = baseTexture(scene, 'flash');
    const dust = baseTexture(scene, 'dust_puff');
    const spark = baseTexture(scene, 'spark');

    // The character and the ground it stands on, mid-toned so dust and light both read on it.
    const ground = MeshBuilder.CreateDisc('ground', {radius: 40, tessellation: 64}, scene);
    ground.rotation.x = Math.PI / 2;
    const groundMaterial = new StandardMaterial('ground', scene);
    groundMaterial.diffuseColor = new Color3(0.24, 0.25, 0.3);
    groundMaterial.specularColor = Color3.Black();
    ground.material = groundMaterial;
    const hero = MeshBuilder.CreateCapsule('hero', {height: 2.4, radius: 0.45}, scene);
    hero.position.y = 1.2;
    const heroMaterial = new StandardMaterial('hero', scene);
    heroMaterial.diffuseColor = new Color3(0.36, 0.36, 0.42);
    heroMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    hero.material = heroMaterial;

    const system = (name: string, params: Partial<ParticleSystemParameters>) => {
        const ps = new ParticleSystem({
            scene,
            duration: 1.5,
            looping: false,
            startSpeed: new ConstantValue(0),
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            ...params,
        } as ParticleSystemParameters);
        ps.emitter.name = name;
        add(ps);
        return ps;
    };

    // 0 s: the light gathering on the ground.
    const groundLight = system('Ground light', {
        startLife: new ConstantValue(1.9),
        startSize: new ConstantValue(7),
        startColor: new ConstantColor(new Color4(1, 0.7, 0.3, 0.75)),
        emissionBursts: [burst(0, 1)],
        texture: glow,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 0,
    });
    groundLight.addBehavior(new ColorOverLife(hold(WHITE, GOLD, 0.55, 0.1)));
    groundLight.emitter.position.y = 0.03;

    // 0 s: a column of light: a tall upright glow, and rings of light rising up it, narrowing as
    // they go.
    const column = system('Light column', {
        startLife: new ConstantValue(1.3),
        startSize: new Vector3Function(new ConstantValue(2.4), new ConstantValue(7), new ConstantValue(1)),
        startColor: new ConstantColor(new Color4(1, 0.78, 0.4, 0.8)),
        emissionBursts: [burst(0, 1)],
        texture: glow,
        renderMode: RenderMode.VerticalBillBoard,
        renderOrder: 2,
    });
    column.addBehavior(new ColorOverLife(hold(WHITE, GOLD, 0.5, 0.12)));
    column.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.6],
                [0.2, 1],
                [1, 0.8],
            ])
        )
    );
    column.emitter.position.y = 2.2;
    const risingRings = system('Rising rings', {
        duration: 0.6,
        startLife: new IntervalValue(0.7, 0.9),
        startSpeed: new IntervalValue(3.5, 4.5),
        startSize: new IntervalValue(2.4, 2.8),
        startColor: new RandomColor(new Color4(1, 0.85, 0.5, 1), new Color4(1, 0.95, 0.8, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new ConeEmitter({radius: 0.01, angle: 0, thickness: 1}),
        texture: ringTexture,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 2,
    });
    risingRings.addBehavior(new ColorOverLife(hold(WHITE, DEEP, 0.4, 0.1)));
    risingRings.addBehavior(
        new SizeOverLife(
            curve([
                [0, 1],
                [1, 0.35],
            ])
        )
    );
    risingRings.emitter.rotation.x = -Math.PI / 2;
    risingRings.emitter.position.y = 0.1;

    // 0.05 s and 0.2 s: two shockwaves running out over the ground.
    const shockwave = system('Shockwaves', {
        startLife: new ConstantValue(0.8),
        startSize: new ConstantValue(9),
        startColor: new ConstantColor(new Color4(1, 0.8, 0.4, 1)),
        emissionBursts: [burst(0.05, 1), burst(0.2, 1)],
        texture: ringTexture,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 1,
    });
    shockwave.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.08],
                [0.3, 0.75],
                [1, 1],
            ])
        )
    );
    shockwave.addBehavior(new ColorOverLife(hold(WHITE, DEEP, 0.3)));
    shockwave.emitter.position.y = 0.05;

    // 0.05 s: dust kicked up round the feet, alpha-blended so it reads on the light ground.
    const dustRing = system('Dust', {
        startLife: new IntervalValue(0.6, 1),
        startSpeed: new IntervalValue(2.5, 4),
        startSize: new IntervalValue(1, 1.5),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 0.95, 0.85, 0.7), new Color4(1, 1, 0.95, 0.85)),
        emissionBursts: [burst(0.05, 14)],
        shape: new ConeEmitter({radius: 0.6, angle: (80 * Math.PI) / 180, thickness: 1}),
        texture: dust,
        ...sheetOf('dust_puff'),
        blendMode: Constants.ALPHA_COMBINE,
        renderOrder: 1,
    });
    dustRing.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 15.99],
            ])
        )
    );
    dustRing.addBehavior(
        new LimitSpeedOverLife(
            curve([
                [0, 4],
                [0.3, 1.6],
                [1, 0.2],
            ]),
            1
        )
    );
    dustRing.emitter.rotation.x = -Math.PI / 2;

    // 0.1 s: golden ribbons spiralling up round the character: trails shot straight up from a
    // ring while OrbitOverLife turns them round the column, so each draws a helix.
    const spiral = system('Ribbons', {
        duration: 0.5,
        startLife: new IntervalValue(1, 1.3),
        startSpeed: new IntervalValue(4, 5.5),
        startSize: new IntervalValue(0.14, 0.22),
        startColor: new ConstantColor(new Color4(1, 0.85, 0.5, 1)),
        startDelay: new ConstantValue(0.1),
        emissionOverTime: new ConstantValue(24),
        shape: new ConeEmitter({radius: 1.2, angle: 0, thickness: 0}),
        texture: streak,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(40), followLocalOrigin: false},
        renderOrder: 3,
    });
    spiral.addBehavior(new OrbitOverLife(new ConstantValue(4.5), new BVector3(0, 0, 1)));
    spiral.addBehavior(new ColorOverLife(hold(new Color3(1, 1, 0.9), DEEP, 0.6)));
    spiral.addBehavior(
        new WidthOverLength(
            curve([
                [0, 1],
                [1, 0],
            ])
        )
    );
    spiral.emitter.rotation.x = -Math.PI / 2;

    // 0.25 s: the flash at the chest, two stacked takes of the star burst.
    const chest = system('Flash', {
        startLife: new ConstantValue(0.32),
        startSize: new IntervalValue(2.4, 3),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 0.95, 0.75, 1), new Color4(1, 0.8, 0.4, 1)),
        emissionBursts: [burst(0.25, 2)],
        texture: flash,
        ...sheetOf('flash'),
        renderOrder: 4,
    });
    chest.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 7.99],
            ])
        )
    );
    chest.emitter.position.y = 1.6;

    // 0.25 s: glints thrown up from the flash, spinning, eased, then falling.
    const glints = system('Glints', {
        startLife: new IntervalValue(1.1, 1.6),
        startSpeed: new IntervalValue(4, 7),
        startSize: new IntervalValue(0.35, 0.7),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(new Color4(1, 0.85, 0.35, 1), new Color4(1, 1, 0.85, 1)),
        emissionBursts: [burst(0.25, 26)],
        shape: new SphereEmitter({radius: 0.4, thickness: 1, arc: Math.PI * 2}),
        texture: glint,
        renderOrder: 4,
    });
    glints.addBehavior(
        new LimitSpeedOverLife(
            curve([
                [0, 7],
                [0.3, 2.8],
                [1, 0.4],
            ]),
            1
        )
    );
    glints.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(4)));
    glints.addBehavior(new RotationOverLife(new IntervalValue(-4, 4)));
    glints.addBehavior(new ColorOverLife(hold(WHITE, GOLD, 0.55)));
    glints.emitter.position.y = 1.8;

    // After: motes rising slowly round the character as the light fades.
    const motes = system('Motes', {
        duration: 1.2,
        startLife: new IntervalValue(1, 1.8),
        startSpeed: new IntervalValue(0.6, 1.2),
        startSize: new IntervalValue(0.08, 0.16),
        startColor: new RandomColor(new Color4(1, 0.8, 0.4, 1), new Color4(1, 0.95, 0.8, 1)),
        startDelay: new ConstantValue(0.3),
        emissionOverTime: new ConstantValue(30),
        shape: new ConeEmitter({radius: 1.3, angle: 0.15, thickness: 1}),
        texture: spark,
        renderOrder: 3,
    });
    motes.addBehavior(new ColorOverLife(hold(WHITE, GOLD, 0.6, 0.15)));
    motes.emitter.rotation.x = -Math.PI / 2;

    return {update: every(REPLAY, () => replay(systems))};
}
