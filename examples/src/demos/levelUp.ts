import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    ApplyForce,
    ColorOverLength,
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
import {addGround} from '../shared/stage';
import {baseTexture, kenneySheet, kenneyTexture, sheetOf} from '../shared/textures';
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
 * A level-up on a character, built in stages as a game's effect is: a magic circle opens on the
 * ground under it, the light gathers there and a column of light stands round the character, shafts of light flaring up round it in
 * waves and rings rising up it; two shockwaves run out over the ground and kick up
 * dust; golden ribbons spiral up (Trail with `OrbitOverLife` and `WidthOverLength`); then a flash
 * at the chest throws glints that spin and fall, and motes keep rising after. Replayed every few
 * seconds.
 */
export function init({scene, camera, add, systems}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 3.6, 11));
    camera.setTarget(new BVector3(0, 1.7, 0));
    const glow = baseTexture(scene, 'glow');
    const ringTexture = baseTexture(scene, 'ring');
    const glint = baseTexture(scene, 'glint');
    const flash = baseTexture(scene, 'flash');
    const spark = baseTexture(scene, 'spark');
    const shafts = kenneyTexture(scene, 'shafts');
    const ribbon = kenneyTexture(scene, 'ribbon', true);
    const sigil = kenneyTexture(scene, 'sigil');

    // The character and the ground it stands on, mid-toned so dust and light both read on it.
    addGround(scene, 0, new Color3(0.24, 0.25, 0.3));
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

    // 0 s: a magic circle on the ground under the character, opening out and turning slowly, there
    // for the whole effect and the last to fade.
    const circle = system('Magic circle', {
        startLife: new ConstantValue(2.2),
        startSize: new ConstantValue(5.2),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(1, 0.78, 0.38, 0.9)),
        emissionBursts: [burst(0, 1)],
        texture: sigil,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 1,
    });
    circle.addBehavior(new ColorOverLife(hold(WHITE, GOLD, 0.7, 0.08)));
    circle.addBehavior(new RotationOverLife(new ConstantValue(0.6)));
    circle.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.5],
                [0.12, 1],
                [1, 1.05],
            ])
        )
    );
    circle.emitter.position.y = 0.05;

    // 0 s: a column of light: a tall upright glow, and rings of light rising up it, narrowing as
    // they go.
    const column = system('Light column', {
        startLife: new ConstantValue(1.3),
        startSize: new Vector3Function(new ConstantValue(2.4), new ConstantValue(7), new ConstantValue(1)),
        startColor: new ConstantColor(new Color4(1, 0.62, 0.22, 0.45)),
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
    // Shafts of light standing up round the character in waves, each a random shaft of the sheet,
    // its foot on the ground (a shaft is drawn from the bottom of its card), drifting up as it
    // fades. The cone emits in its xy plane; turned flat, it rings the character.
    const shaftHeight = new IntervalValue(5.5, 7.5);
    const lightShafts = system('Light shafts', {
        startLife: new IntervalValue(0.8, 1.2),
        startSpeed: new IntervalValue(0.2, 0.5),
        startSize: new Vector3Function(new IntervalValue(1, 2.2), shaftHeight, new ConstantValue(1)),
        startColor: new RandomColor(new Color4(1, 0.92, 0.75, 0.7), new Color4(1, 1, 0.92, 0.85)),
        emissionBursts: [burst(0, 3), burst(0.08, 2), burst(0.18, 3), burst(0.32, 2)],
        shape: new ConeEmitter({radius: 0.7, angle: 0, thickness: 1}),
        texture: shafts,
        ...kenneySheet('shafts'),
        startTileIndex: new IntervalValue(0, 4),
        renderMode: RenderMode.VerticalBillBoard,
        renderOrder: 2,
    });
    lightShafts.addBehavior(new ColorOverLife(hold(WHITE, GOLD, 0.45, 0.15)));
    lightShafts.emitter.rotation.x = -Math.PI / 2;
    lightShafts.emitter.position.y = 3.2;
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
    // Puffs of a random shape each (no frames to step through: a puff that is eaten away frame by
    // frame jumps and breaks up when it plays slowly), turning, swelling and fading out.
    const dustRing = system('Dust', {
        startLife: new IntervalValue(0.7, 1.1),
        startSpeed: new IntervalValue(2.5, 4),
        startSize: new IntervalValue(0.9, 1.3),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 0.95, 0.85, 0.55), new Color4(1, 1, 0.95, 0.7)),
        emissionBursts: [burst(0.05, 16)],
        shape: new ConeEmitter({radius: 0.6, angle: (80 * Math.PI) / 180, thickness: 1}),
        texture: kenneyTexture(scene, 'puffs'),
        ...kenneySheet('puffs'),
        startTileIndex: new IntervalValue(0, 25),
        blendMode: Constants.ALPHA_COMBINE,
        renderOrder: 1,
    });
    dustRing.addBehavior(new RotationOverLife(new IntervalValue(-0.8, 0.8)));
    dustRing.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.7],
                [1, 1.6],
            ])
        )
    );
    dustRing.addBehavior(new ColorOverLife(hold(WHITE, WHITE, 0.35, 0.1)));
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
        startSize: new IntervalValue(0.55, 0.8),
        startColor: new ConstantColor(new Color4(1, 0.85, 0.5, 1)),
        startDelay: new ConstantValue(0.1),
        emissionOverTime: new ConstantValue(30),
        shape: new ConeEmitter({radius: 1.2, angle: 0, thickness: 0}),
        texture: ribbon,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(40), followLocalOrigin: false},
        renderOrder: 3,
    });
    spiral.addBehavior(new OrbitOverLife(new ConstantValue(4.5), new BVector3(0, 0, 1)));
    spiral.addBehavior(new ColorOverLife(hold(new Color3(1, 1, 0.9), DEEP, 0.6)));
    // Soft ends: the ribbon rises in from its head and runs out to nothing at its tail (0 is the
    // head), narrowing as it goes, so no end is a hard cut.
    spiral.addBehavior(
        new ColorOverLength(
            new Gradient(
                [
                    [WHITE, 0],
                    [WHITE, 1],
                ],
                [
                    [0, 0],
                    [1, 0.15],
                    [1, 0.5],
                    [0, 1],
                ]
            )
        )
    );
    spiral.addBehavior(
        new WidthOverLength(
            curve([
                [0, 0.6],
                [0.15, 1],
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
        startSize: new IntervalValue(0.18, 0.36),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(new Color4(1, 0.85, 0.35, 1), new Color4(1, 1, 0.85, 1)),
        emissionBursts: [burst(0.25, 55)],
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
