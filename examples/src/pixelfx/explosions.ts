import {CircleEmitter, ConeEmitter, DonutEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    curve,
    drag,
    fadeOut,
    flicker,
    gravity,
    grow,
    holdFrame,
    lifeFrames,
    orbit,
    popOut,
    spin,
    subEmit,
    tint,
    wobble,
    type Hex,
    type SysOptions,
} from './kit';
import {
    PALETTE,
    arcs,
    debris,
    decal,
    embers,
    flames,
    flash,
    heart,
    pool,
    shockwave,
    smoke,
    sparks,
    type Ramp,
} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {rampTexture} from './textures';

/** Puffs of pixelfx's flame, cooling through the fire ramp; `smokes` of them roll on as smoke. */
function puffs(
    fx: FxBuilder,
    o: {
        at: [number, number, number];
        delay: number;
        count: number;
        size: [number, number];
        speed: [number, number];
        life: [number, number];
        shape: SysOptions['shape'];
        aim?: SysOptions['aim'];
        rise?: number;
        smokes?: number;
        smoke?: string;
        order?: number;
    }
) {
    const fire = fx.sys({
        image: 'fire-puff-heat',
        randomTile: false,
        blend: 'alpha',
        life: o.life,
        speed: o.speed,
        size: o.size,
        rot: true,
        burst: [[0, o.count]],
        delay: o.delay,
        loop: false,
        shape: o.shape,
        aim: o.aim,
        at: o.at,
        world: true,
        order: o.order ?? 4,
        look: {gradientMap: {ramp: rampTexture(fx.scene, PALETTE.fire)}},
        b: [
            lifeFrames(16, 1.3),
            tint([['#ffffff', 0]], popOut(0.4)),
            grow([0, 0.8], [1, 1.5]),
            drag([0, 1], [0.4, 0.25], [1, 0.1]),
            gravity(-(o.rise ?? 1.6)),
        ],
    });
    if (o.smokes) {
        const sz = (o.size[0] + o.size[1]) / 2;
        const roll = fx.sys({
            image: 'smoke-puff',
            randomTile: false,
            blend: 'alpha',
            life: [1.2, 2],
            speed: [0.3, 0.8],
            size: [sz * 0.9, sz * 1.3],
            rot: true,
            burst: [[0, 1]],
            loop: false,
            world: true,
            color: o.smoke ?? '#6a6478',
            alpha: 0.9,
            shape: new SphereEmitter({radius: 0.05}),
            order: (o.order ?? 4) - 1,
            b: [lifeFrames(16), grow([0, 0.9], [1, 1.6]), gravity(-0.9), wobble(1, 0.4)],
        });
        subEmit(fire, roll, 'death', o.smokes);
    }
    return fire;
}

/**
 * small-explosion.js's ground blast at size `S` (1 px ≈ 0.04 m, RAD = 18 px · S): a white flash and two
 * shock rings; a burst of fire puffs thrown out and up, almost half rolling on as smoke; a few puffs
 * shot up the middle into a column; dark smoke inside and big smoke after; sparks, embers and burning
 * brands that land and burn; dust rolling out along the floor; rocks, grit and a dust column thrown
 * up; a band of floor rolling out; a white-hot scorch cooling to soot.
 */
function blast(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        delay?: number;
        size?: number;
        earth?: number;
        brands?: number;
        stone?: string;
        /** A blast in the air: no dust, rocks, grit, floor band or scorch. */
        air?: boolean;
    }
) {
    const S = o.size ?? 1;
    const delay = o.delay ?? 0;
    const POWER = 0.9 * Math.pow(S, 0.8);
    const RAD = 0.72 * S;
    const EARTH = o.earth ?? 1.6;
    const [x, y0, z] = o.at ?? [0, 0, 0];
    const at = (y: number): [number, number, number] => [x, y0 + y, z];
    const centre = at(RAD * 0.3);
    const dust = o.stone ?? '#7a7088';
    // The hero frame: a white flash, two rings racing out from it.
    flash(fx, {at: centre, size: RAD * 2.6, time: delay, life: 0.08, color: '#ffffff'});
    flash(fx, {at: centre, size: RAD * 4.5, time: delay, life: 0.25});
    shockwave(fx, {at: centre, size: RAD * 5.4, delay, life: 0.34, facing: true, tex: 'ring', color: '#ffe26b'});
    shockwave(fx, {at: centre, size: RAD * 3.2, delay, life: 0.22, facing: true, tex: 'ring', color: '#ff8a2a'});
    heart(fx, {at: at(RAD * 1.6), size: RAD * 4, alpha: 0.6, delay, duration: 0.7, loop: false});
    // The fireball: a white-hot core, puffs thrown out and up, a few shot up the middle.
    puffs(fx, {
        at: centre,
        delay,
        count: 5,
        size: [RAD * 2, RAD * 2.6],
        speed: [0.2, 0.8],
        life: [0.18, 0.3],
        shape: new SphereEmitter({radius: 0.1}),
        order: 6,
    });
    puffs(fx, {
        at: centre,
        delay,
        count: Math.round(28 * POWER),
        size: [RAD * 1.1, RAD * 2.2],
        speed: [1.6 * POWER, 8.4 * POWER],
        life: [0.55, 1.15],
        shape: new SphereEmitter({radius: RAD * 0.55, thickness: 1}),
        smokes: 0.45,
        order: 5,
    });
    puffs(fx, {
        at: centre,
        delay,
        count: 5,
        size: [RAD * 1.2, RAD * 1.7],
        speed: [4, 7.2],
        life: [0.8, 1.3],
        shape: new ConeEmitter({radius: RAD * 0.25, angle: 0.08}),
        aim: 'up',
        smokes: 0.6,
    });
    // Smoke: dark puffs inside the fireball, then big smoke billowing up after it.
    smoke(fx, {
        at: centre,
        burst: [[delay + 0.1, 5]],
        speed: [0.8, 1.4],
        life: [0.9, 1.5],
        size: [RAD * 0.8, RAD * 1.3],
        color: '#221d26',
        alpha: 0.85,
        radius: RAD * 0.5,
        loop: false,
    });
    smoke(fx, {
        at: centre,
        burst: [[delay + 0.25, Math.round(18 * POWER)]],
        speed: [0.6, 4],
        life: [1.8, 2.8],
        size: [RAD * 1.3, RAD * 2.2],
        color: '#5a5466',
        alpha: 0.8,
        radius: RAD * 0.7,
        spread: 0.9,
        loop: false,
    });
    sparks(fx, {
        at: centre,
        time: delay,
        count: Math.round(80 * POWER),
        speed: [5.6 * POWER, 15 * POWER],
        life: [0.18, 0.6],
        gravity: 6,
        shape: new SphereEmitter({radius: 0.1, thickness: 1}),
    });
    embers(fx, {
        at: centre,
        burst: [[delay, Math.round(40 * POWER)]],
        radius: RAD * 0.4,
        speed: [1.2, 6],
        life: [1.2, 2.6],
        loop: false,
    });
    // Burning brands: they arc out, land and keep burning.
    const brandCount = o.air ? 0 : (o.brands ?? Math.round(11 * Math.max(0, POWER - 0.55)));
    if (brandCount > 0) {
        fx.sys({
            tex: 'dot',
            mode: RenderMode.Trail,
            trail: 6,
            life: [0.7, 1.1],
            speed: [6.8, 13],
            size: 0.1,
            burst: [[delay, brandCount]],
            loop: false,
            color: '#ffc23d',
            shape: new ConeEmitter({radius: 0.1, angle: 1.35}),
            aim: 'up',
            at: centre,
            world: true,
            order: 4,
            b: [gravity(18)],
        });
        // Where they land they burn on, small and flickering.
        flames(fx, {
            at: at(0),
            radius: RAD * 2.4,
            height: 0.5,
            size: [0.3, 0.45],
            rate: brandCount * 4,
            life: [0.25, 0.45],
            delay: delay + 0.7,
            duration: 2,
            loop: false,
        });
    }
    if (o.air) return;
    // The ground's part: dust rolling out along the floor, rocks and grit, a dust column.
    smoke(fx, {
        burst: [[delay, Math.round(RAD * 12)]],
        shape: new CircleEmitter({radius: RAD * 0.3, thickness: 1}),
        at: at(0.1),
        speed: [RAD * 3, RAD * 9.5],
        life: [1.1, 2],
        size: [RAD * 0.8, RAD * 1.3],
        color: dust,
        alpha: 0.6,
        loop: false,
    });
    debris(fx, {
        at: at(0.1),
        count: Math.round(26 * Math.min(1.5, S)),
        delay,
        speed: [4.5 * S, 10 * S],
        color: ['#4a3f69', '#6a5c90'],
        aim: 'up',
        shape: new ConeEmitter({radius: RAD * 0.4, angle: 0.6}),
    });
    debris(fx, {
        at: at(0.05),
        count: Math.round(EARTH * 40 * S),
        delay,
        speed: [3.6 * S, 10.8 * S],
        size: [0.04, 0.08],
        life: [1.2, 2.2],
        color: ['#4a3f69', '#8a7cb0'],
        aim: 'up',
        shape: new ConeEmitter({radius: RAD * 0.25, angle: 0.5}),
    });
    smoke(fx, {
        at: at(RAD * 0.3),
        burst: [[delay + 0.1, Math.round(EARTH * 16)]],
        speed: [1.4 * EARTH, 4.4 * EARTH],
        life: [1.6, 2.6],
        size: [RAD * 0.9, RAD * 1.5],
        color: dust,
        alpha: 0.55,
        radius: RAD * 0.3,
        spread: 0.15,
        loop: false,
    });
    shockwave(fx, {at: at(0.03), size: 6.4 * S, delay, life: 0.5, color: '#a898c8', alpha: 0.7});
    // The scorch: white-hot, cooling through the fire ramp to soot, fading at the end.
    const cool = 1.2 + RAD / 0.04 / 14;
    decal(fx, {at: at(0.02), size: 1.8 * S, life: 4.4, delay, alpha: 0.85});
    decal(fx, {
        at: at(0.025),
        tex: 'glow',
        size: 1.9 * S,
        life: cool,
        delay,
        color: '#ffffff',
        blend: 'add',
        alpha: 1,
        alphas: [
            [1, 0],
            [0, 1],
        ],
        colors: [
            ['#ffffff', 0],
            ['#ffc23d', 0.15],
            ['#f2561d', 0.4],
            ['#8a1f17', 0.7],
            ['#2a0a08', 1],
        ],
    });
}

/** The fireball of a blast: pixelfx's flame puffs thrown up and out, cooling, some rolling into smoke. */
function fireball(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        delay?: number;
        size?: number;
        count?: number;
        speed?: [number, number];
        spread?: number;
    }
) {
    const size = o.size ?? 1;
    return puffs(fx, {
        at: o.at ?? [0, 0.3, 0],
        delay: o.delay ?? 0,
        count: o.count ?? 26,
        size: [1.1 * size, 1.8 * size],
        speed: o.speed ?? [2 * size, 4.5 * size],
        life: [0.7, 1.2],
        shape: new ConeEmitter({radius: 0.4 * size, angle: o.spread ?? 0.9, thickness: 1}),
        aim: 'up',
        smokes: 0.5,
    });
}

interface StarOptions {
    at: [number, number, number];
    delay: number;
    count: number;
    speed: [number, number];
    life: [number, number];
    /** Head and trail colour over life (the first keys can burn another colour for a beat). */
    ramp: Ramp;
    /** Trail length in samples. */
    trail: number;
    /** Gravity once the drag has eaten the throw. */
    droop: number;
    /** Air resistance per second (see {@link airDrag}). */
    drag: number;
    size?: [number, number];
    shape?: SysOptions['shape'];
    aim?: SysOptions['aim'];
    /** Glitter shed per second per star, over the star's life (curve keys). */
    glitter: Array<[number, number]>;
    glitterColor: Hex;
    /** Crackle pops at each star's end, and their colour. */
    pops: number;
    popColor: Hex;
}

/**
 * Firework stars: trailing heads thrown from one point that slow, droop, shed twinkling glitter
 * and crackle out in a few cross-shaped pops at the end, flickering just before they do.
 */
function fireworkStars(fx: FxBuilder, o: StarOptions) {
    const life = (o.life[0] + o.life[1]) / 2;
    const stars = fx.sys({
        tex: 'dot',
        mode: RenderMode.Trail,
        trail: o.trail,
        life: o.life,
        speed: o.speed,
        size: o.size ?? [0.08, 0.12],
        burst: [[0, o.count]],
        delay: o.delay,
        at: o.at,
        aim: o.aim,
        loop: false,
        world: true,
        shape: o.shape ?? new SphereEmitter({radius: 0.08, thickness: 1}),
        order: 4,
        b: [
            tint(o.ramp, [
                [1, 0],
                [1, 0.72],
                [0.25, 0.76],
                [1, 0.8],
                [0.2, 0.86],
                [0.9, 0.9],
                [0.1, 0.95],
                [0, 1],
            ]),
            gravity(o.droop),
            airDrag(o.drag),
        ],
    });
    const glitter = fx.sys({
        tex: 'glint',
        life: [0.35, 0.9],
        speed: [0.05, 0.3],
        size: [0.07, 0.16],
        rate: 0,
        duration: life,
        loop: false,
        world: true,
        color: o.glitterColor,
        shape: new SphereEmitter({radius: 0.04}),
        order: 3,
        b: [tint([['#ffffff', 0]], flicker()), gravity(0.6)],
    });
    glitter.emissionOverTime = curve(...o.glitter);
    subEmit(stars, glitter, 'birth');
    const crackle = fx.sys({
        tex: 'glint',
        life: [0.08, 0.16],
        speed: [0.3, 1.2],
        size: [0.25, 0.4],
        rot: true,
        burst: [
            [0, Math.ceil(o.pops / 2)],
            [0.1, Math.floor(o.pops / 2)],
        ],
        loop: false,
        world: true,
        color: o.popColor,
        shape: new SphereEmitter({radius: 0.15}),
        order: 5,
        b: [
            tint(
                [['#ffffff', 0]],
                [
                    [1, 0],
                    [1, 1],
                ]
            ),
            grow([0, 0.2], [0.4, 1], [1, 0]),
        ],
    });
    subEmit(stars, crackle, 'death');
    return stars;
}

/** The burst's flare: long white rays on the axes, short gold diagonals, turning as they shrink. */
function flare(fx: FxBuilder, at: [number, number, number], delay: number, size: number, rays: Hex, diagonals: Hex) {
    for (const [rot, color, scale] of [
        [0, rays, 1],
        [Math.PI / 4, diagonals, 0.45],
    ] as Array<[number, Hex, number]>) {
        fx.sys({
            tex: 'glint',
            life: 0.28,
            size: size * scale,
            rot,
            burst: [[0, 1]],
            delay,
            at,
            loop: false,
            color,
            order: 7,
            b: [
                tint(
                    [['#ffffff', 0]],
                    [
                        [1, 0],
                        [1, 0.4],
                        [0, 1],
                    ]
                ),
                grow([0, 1], [1, 0.1]),
                spin(2),
            ],
        });
    }
}

/** Drifting grey smoke left where a shell broke. */
function burstSmoke(fx: FxBuilder, at: [number, number, number], delay: number, count: number) {
    smoke(fx, {
        at,
        delay,
        burst: [[0, count]],
        loop: false,
        world: true,
        color: '#4a4458',
        alpha: 0.4,
        life: [2.2, 3],
        speed: [0.3, 1],
        size: [1, 1.6],
        shape: new SphereEmitter({radius: 0.3}),
        order: 1,
    });
}

/** pixelfx's explosions category, rebuilt as 3D particle effects. */
export const explosions: FxDef[] = [
    {
        id: 'explosions/barrel-explosion',
        name: 'Barrel explosion',
        loop: false,
        period: 5.2,
        build(fx) {
            const blow = 0.8;
            const barrel = fx.prop(shapes.cylinder(fx.scene, 1.2, 0.45), {at: [0, 0.6, 0], color: '#7a2a1c'});
            const lid = fx.prop(shapes.cylinder(fx.scene, 0.06, 0.47), {at: [0, 1.22, 0], color: '#3a3438'});
            fx.every((t) => {
                const shaking = t < blow;
                barrel.setEnabled(shaking);
                const j = t > 0.4 && shaking ? 0.04 * Math.sin(t * 90) : 0;
                barrel.position.x = j;
                if (shaking) {
                    lid.position.set(0, 1.22 + (t > 0.4 ? 0.04 + 0.03 * Math.sin(t * 50) : 0), 0);
                    lid.rotation.set(0, 0, 0);
                } else {
                    // The lid, flung high and spinning, lands flat beside the drum.
                    const u = t - blow;
                    const fly = Math.min(u, 1.4);
                    lid.position.set(1.6 * fly, Math.max(0.03, 1.22 + 9 * fly - 7 * fly * fly), 0.4 * fly);
                    lid.rotation.set(u < 1.4 ? u * 9 : 0, 0, u < 1.4 ? u * 4 : 0);
                }
            });
            // Flame spitting from under the bulging lid.
            fx.sys({
                tex: 'smoke',
                life: [0.2, 0.35],
                speed: [1.5, 2.5],
                size: [0.25, 0.4],
                rate: 30,
                delay: 0.35,
                duration: blow - 0.35,
                loop: false,
                shape: new CircleEmitter({radius: 0.45, thickness: 0}),
                aim: 'up',
                at: [0, 1.25, 0],
                order: 3,
                b: [tint(PALETTE.fire, fadeOut(0.4))],
            });
            // barrel-explosion.js: the blast, then a column of fire driven up out of the drum, oily
            // black smoke, burning fuel flung out in arcs, the staves torn off, the lid flung high.
            blast(fx, {delay: blow, size: 1.1, brands: 10});
            fireball(fx, {at: [0, 0.6, 0], delay: blow + 0.05, size: 0.9, count: 18, speed: [5, 8], spread: 0.25});
            smoke(fx, {
                at: [0, 1.4, 0],
                burst: [[blow + 0.3, 16]],
                speed: [1.2, 3.2],
                life: [2, 3],
                size: [1.2, 1.9],
                color: '#16121a',
                alpha: 0.85,
                radius: 0.5,
                spread: 0.5,
                loop: false,
            });
            debris(fx, {
                mesh: 'plank',
                count: 10,
                delay: blow,
                color: ['#5a2018', '#8a3a24'],
                size: [0.35, 0.55],
                speed: [5, 9],
            });
            // Burning fuel splashed on the floor, flickering on after the blast.
            flames(fx, {
                radius: 2.2,
                height: 0.8,
                size: [0.35, 0.6],
                rate: 40,
                delay: blow + 0.3,
                duration: 3,
                loop: false,
            });
            pool(fx, {size: 5, delay: blow, duration: 3.2, loop: false, alpha: 0.4});
        },
    },
    {
        id: 'explosions/big-explosion',
        name: 'Big explosion',
        loop: false,
        period: 7.2,
        view: {height: 2.4, distance: 13},
        build(fx) {
            // big-explosion.js in 3D (RAD 30 px ≈ 1.2 m): three detonations a beat apart, climbing (0,
            // 0.13 and 0.25 s); a white dome on the floor; the fireball climbs into a mushroom cap that
            // rolls (lobes up the middle, out over the top, curling under), hot at first, cooling to
            // sooty smoke lit on top, fading by 6.4 s; a column of fire and smoke boiling up off the floor
            // into it, dust drawn in along the ground; embers shed, then ash drifting down; heavy rocks,
            // some molten and trailing smoke; brands that land and keep the ground on fire; a scorch.
            const fireRamp = rampTexture(fx.scene, PALETTE.fire);
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: 4.2,
                burst: 1,
                at: [0, 0.3, 0],
                order: 7,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffe2a0', 1],
                        ],
                        popOut(0.3)
                    ),
                    grow([0, 0.4], [0.3, 1], [1, 1.2]),
                ],
            });
            blast(fx, {at: [0, 0.15, 0], delay: 0, size: 1.67, brands: 14});
            blast(fx, {at: [-0.68, 1.2, 0.2], delay: 0.13, size: 0.95, air: true});
            blast(fx, {at: [0.6, 1.84, -0.2], delay: 0.25, size: 0.83, air: true});
            heart(fx, {at: [0, 2.4, 0], size: 5, alpha: 0.6, duration: 2.6, loop: false});
            // The cap: rising fast, then slowing (118 px over τ 1.25 s), rolling as it goes.
            const cap = fx.node('cap', [0, 1.2, 0]);
            fx.every((t) => {
                cap.position.y = 1.2 + 2.6 * (1 - Math.exp(-Math.max(0, t - 0.08) / 1.25));
            });
            const capRamp: Ramp = [
                ['#fff3a6', 0],
                ['#ff8a2a', 0.12],
                ['#c9281f', 0.25],
                ['#83777f', 0.42],
                ['#575060', 0.7],
                ['#29242f', 1],
            ];
            fx.sys({
                image: 'smoke-puff',
                randomTile: false,
                blend: 'alpha',
                life: [4.4, 5.6],
                speed: [0.2, 0.6],
                size: [1.5, 2.1],
                rot: true,
                burst: [[0.08, 70]],
                loop: false,
                shape: new DonutEmitter({radius: 0.8, donutRadius: 0.4}),
                aim: 'up',
                parent: cap,
                order: 4,
                b: [
                    holdFrame(7),
                    tint(capRamp, [
                        [0, 0],
                        [1, 0.03],
                        [1, 0.8],
                        [0, 1],
                    ]),
                    grow([0, 0.6], [0.4, 1.4], [1, 1.8]),
                    wobble(0.8, 0.3),
                ],
            });
            // Hot fire boiling inside the cap early on.
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'add',
                alpha: 0.7,
                life: [0.5, 0.9],
                speed: [0.4, 1.2],
                size: [1, 1.6],
                rot: true,
                rate: 30,
                delay: 0.1,
                duration: 1.6,
                loop: false,
                shape: new SphereEmitter({radius: 0.9}),
                parent: cap,
                order: 5,
                look: {gradientMap: {ramp: fireRamp}},
                b: [lifeFrames(16, 1.2), tint([['#ffffff', 0]], popOut(0.4))],
            });
            // The column: fire and smoke boiling up off the floor into it.
            puffs(fx, {
                at: [0, 0.3, 0],
                delay: 0.22,
                count: 20,
                size: [0.6, 1],
                speed: [3.6, 6],
                life: [0.5, 0.8],
                shape: new ConeEmitter({radius: 0.3, angle: 0.1}),
                aim: 'up',
                smokes: 0.5,
            });
            smoke(fx, {
                at: [0, 0.2, 0],
                rate: 18,
                delay: 0.2,
                duration: 2.3,
                loop: false,
                speed: [1.4, 2],
                life: [1.5, 2.3],
                size: [0.6, 0.9],
                color: '#83777f',
                alpha: 0.85,
                radius: 0.25,
                spread: 0.05,
            });
            // Embers shed, then ash drifting down out of the cloud.
            embers(fx, {
                parent: cap,
                rate: 10,
                delay: 0.3,
                duration: 2.7,
                loop: false,
                radius: 1.2,
                speed: [1.6, 3.6],
                life: [1.2, 2.4],
            });
            fx.sys({
                tex: 'square',
                blend: 'alpha',
                life: [2, 3],
                speed: [0.1, 0.4],
                size: [0.03, 0.05],
                rot: true,
                rate: 7,
                delay: 1.4,
                duration: 3.2,
                loop: false,
                color: ['#6e6470', '#f2561d'],
                shape: new SphereEmitter({radius: 1.2}),
                parent: cap,
                world: true,
                order: 3,
                b: [gravity(0.4), spin([-3, 3]), wobble(1, 0.5), tint([['#ffffff', 0]], fadeOut(0.7, 0.1))],
            });
            // Heavy rocks thrown high, some molten and trailing smoke.
            debris(fx, {
                count: 10,
                size: [0.3, 0.5],
                speed: [11, 19],
                life: [3.6, 5],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.4, angle: 0.3}),
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.Trail,
                trail: 12,
                life: [1.5, 2.2],
                speed: [12, 19],
                size: [0.12, 0.18],
                burst: [[0, 8]],
                loop: false,
                color: '#ff8a2a',
                shape: new ConeEmitter({radius: 0.3, angle: 0.35}),
                aim: 'up',
                world: true,
                order: 4,
                b: [
                    gravity(9),
                    tint(
                        [
                            ['#ffe26b', 0],
                            ['#f2561d', 0.5],
                            ['#4a1712', 1],
                        ],
                        fadeOut(0.8, 0.02)
                    ),
                ],
            });
        },
    },
    {
        id: 'explosions/cartoon-pow',
        name: 'Cartoon POW',
        loop: false,
        period: 1.6,
        build(fx) {
            const at: [number, number, number] = [0, 1.6, 0];
            const slam = () => grow([0, 0.2], [0.12, 1.25], [0.2, 1], [0.85, 1.05], [1, 0.2]);
            fx.sys({
                tex: 'burst',
                blend: 'alpha',
                life: 1.05,
                size: 4.2,
                rot: [0, 0.3],
                burst: 1,
                color: '#e8321e',
                at,
                order: 3,
                b: [tint([['#ffffff', 0]], popOut(0.9)), slam(), spin(0.6)],
            });
            fx.sys({
                tex: 'burst',
                blend: 'alpha',
                life: 1.05,
                size: 3.2,
                rot: [0.2, 0.5],
                burst: 1,
                color: '#ffd23a',
                at,
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.9)), slam(), spin(-0.8)],
            });
            fx.sys({
                tex: 'pow',
                blend: 'alpha',
                life: 0.95,
                size: 2.6,
                burst: [[0.08, 1]],
                color: '#2a1a40',
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.85)), grow([0, 2], [0.12, 0.9], [0.2, 1], [1, 1.1])],
            });
            // Action lines flying out.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 2},
                life: [0.25, 0.4],
                speed: [8, 12],
                size: [0.12, 0.18],
                burst: [[0, 14]],
                color: '#ffffff',
                shape: new SphereEmitter({radius: 1.2, thickness: 0}),
                at,
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
        },
    },
    {
        id: 'explosions/dirt-explosion',
        name: 'Dirt explosion',
        loop: false,
        period: 3.6,
        build(fx) {
            // dirt-explosion.js in 3D (1 px ≈ 0.04 m): a buried charge. A squat dome of white-hot air
            // out of the floor for a frame or two, a few sparks; a fountain of grit and clods thrown high
            // in a cone; a soil-brown plume punched straight up, lobes riding the cone, a skirt of dust
            // rolling out along the floor, dark soil thrown up heavier and lower; a band of floor rolling
            // out; clods thudding down in puffs of dust; a crater with a heaped lip left behind.
            const SOIL = '#6a5a4a';
            const DUST = '#948070';
            const DARK = '#463a33';
            fx.sys({
                tex: 'glow',
                life: 0.09,
                size: 1.4,
                burst: 1,
                color: '#ffffff',
                at: [0, 0.15, 0],
                order: 7,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffc23d', 1],
                        ],
                        popOut(0.3)
                    ),
                    grow([0, 1], [1, 0.7]),
                ],
            });
            heart(fx, {at: [0, 0.8, 0], size: 3.4, color: '#ffc23d', alpha: 0.6, duration: 0.25, loop: false});
            pool(fx, {size: 4.8, alpha: 0.45, duration: 0.3, loop: false});
            sparks(fx, {
                at: [0, 0.1, 0],
                count: 14,
                speed: [6.4, 12.8],
                life: [0.15, 0.35],
                aim: 'up',
                gravity: 6,
                shape: new ConeEmitter({radius: 0.05, angle: 0.7}),
            });
            // The fountain: grit and clods in a cone.
            fx.sys({
                tex: 'square',
                blend: 'alpha',
                life: [1.2, 2.2],
                speed: [4, 11],
                size: [0.04, 0.08],
                rot: true,
                burst: [[0, 300]],
                color: ['#33281c', '#b89f78'],
                shape: new ConeEmitter({radius: 0.16, angle: 0.62}),
                aim: 'up',
                world: true,
                order: 3,
                b: [gravity(14), spin([-8, 8]), drag([0, 1], [1, 0.6])],
            });
            const clods = debris(fx, {
                at: [0, 0.1, 0],
                count: 30,
                speed: [5, 10],
                size: [0.12, 0.3],
                life: [2.2, 3],
                color: ['#4f3f2c', '#927a58'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 0.6}),
            });
            // Where clods land: a puff of dust.
            const thud = smoke(fx, {
                burst: [[0, 3]],
                speed: [0.4, 1.4],
                life: [0.35, 0.7],
                size: [0.2, 0.35],
                color: DUST,
                alpha: 0.6,
                radius: 0.05,
                loop: false,
            });
            subEmit(clods, thud, 'death');
            // The dust: a plume straight up, lobes on the cone, a skirt along the floor, dark soil.
            smoke(fx, {
                at: [0, 0.25, 0],
                burst: [[0.02, 22]],
                speed: [2, 4.6],
                spread: 0.12,
                size: [1.5, 2.3],
                life: [1.8, 2.6],
                color: [SOIL, DUST],
                alpha: 0.95,
                radius: 0.28,
                loop: false,
            });
            smoke(fx, {
                at: [0, 0.2, 0],
                burst: [[0.01, 14]],
                speed: [3, 5.4],
                shape: new ConeEmitter({radius: 0.2, angle: 0.6, thickness: 0.2}),
                aim: 'up',
                size: [1, 1.6],
                life: [1.6, 2.4],
                color: [SOIL, DUST],
                alpha: 0.75,
                loop: false,
            });
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.4, thickness: 1}),
                at: [0, 0.12, 0],
                burst: [[0.02, 16]],
                speed: [2.8, 8],
                size: [0.8, 1.2],
                life: [1.4, 2.2],
                color: DUST,
                alpha: 0.65,
                loop: false,
            });
            smoke(fx, {
                at: [0, 0.2, 0],
                burst: [[0, 8]],
                speed: [1.6, 4.4],
                spread: 0.3,
                size: [0.8, 1.2],
                life: [1.2, 1.8],
                color: DARK,
                alpha: 0.85,
                radius: 0.3,
                loop: false,
            });
            shockwave(fx, {at: [0, 0.03, 0], size: 7.2, life: 0.45, color: '#b89f78', alpha: 0.7});
            // The crater: a dark dent with a lip of heaped earth.
            decal(fx, {size: 2.6, life: 3.5, color: '#1c1610', alpha: 0.9});
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'alpha',
                life: 3.5,
                burst: 1,
                size: 2.6,
                at: [0, 0.02, 0],
                color: '#3a2e22',
                alpha: 0.9,
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.03)), grow([0, 0.4], [0.04, 1], [1, 1])],
            });
        },
    },
    {
        id: 'explosions/firework-burst',
        name: 'Firework burst',
        loop: false,
        period: 3.6,
        view: {height: 3.2, distance: 13},
        build(fx) {
            // pixelfx: the shell climbs 72 px in 0.42 s, slowing, and breaks 100 px up the sky.
            const RISE = 0.42;
            const H = 4.6;
            const at: [number, number, number] = [0, H, 0];
            const pink: Ramp = [
                ['#ffffff', 0],
                ['#fff6c4', 0.025],
                ['#ffe066', 0.11],
                ['#ffd2f6', 0.14],
                ['#ff86e6', 0.2],
                ['#f53cd1', 0.55],
                ['#b0228f', 0.85],
                ['#701560', 1],
            ];
            const gold: Ramp = [
                ['#ffffff', 0],
                ['#fff6c4', 0.05],
                ['#ffe066', 0.4],
                ['#f0b424', 0.8],
                ['#86520c', 1],
            ];
            const shell = fx.node('shell', [0, H - 2.9, 0]);
            fx.every((t) => {
                const k = Math.min(1, t / RISE);
                shell.position.y = H - 2.9 * Math.pow(1 - k, 3);
            });
            // The shell: a hot head with a gold tail shedding a fizz of sparks and a thread of smoke.
            fx.sys({
                tex: 'glow',
                life: RISE,
                size: 0.55,
                burst: [[0, 1]],
                parent: shell,
                loop: false,
                color: '#ffe066',
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [1, 0.9],
                            [0, 1],
                        ]
                    ),
                ],
            });
            fx.sys({
                tex: 'dot',
                life: [0.08, 0.16],
                size: [0.07, 0.1],
                rate: 160,
                duration: RISE,
                parent: shell,
                loop: false,
                world: true,
                order: 4,
                b: [
                    tint(gold, [
                        [1, 0],
                        [0, 1],
                    ]),
                ],
            });
            sparks(fx, {
                parent: shell,
                rate: 50,
                duration: RISE,
                world: true,
                aim: 'down',
                shape: new ConeEmitter({radius: 0.02, angle: 0.6}),
                speed: [0.8, 2.8],
                life: [0.15, 0.35],
                size: [0.04, 0.06],
                palette: gold,
            });
            smoke(fx, {
                parent: shell,
                rate: 14,
                duration: RISE,
                loop: false,
                world: true,
                color: '#4a4458',
                alpha: 0.35,
                life: [0.5, 0.8],
                speed: [0.1, 0.4],
                size: [0.25, 0.4],
                aim: 'down',
            });
            // The break: 66 outer stars that burn gold for a beat, then their colour, round a gold core
            // of 26 slower ones; a sphere, so the ones thrown at the camera fly out of the picture.
            fireworkStars(fx, {
                at,
                delay: RISE,
                count: 66,
                speed: [8.7, 9.9],
                life: [1.35, 1.9],
                ramp: pink,
                trail: 22,
                droop: 3.5,
                drag: 2.6,
                size: [0.06, 0.09],
                glitter: [
                    [0, 4],
                    [0.24, 4],
                    [0.26, 11],
                    [1, 11],
                ],
                glitterColor: '#fff6c4',
                pops: 3,
                popColor: '#ffd2f6',
            });
            fireworkStars(fx, {
                at,
                delay: RISE,
                count: 26,
                speed: [4.5, 5],
                life: [1, 1.4],
                ramp: gold,
                trail: 16,
                droop: 3.5,
                drag: 2.6,
                size: [0.05, 0.07],
                glitter: [
                    [0, 4],
                    [1, 8],
                ],
                glitterColor: '#ffffff',
                pops: 2,
                popColor: '#ffffff',
            });
            flare(fx, at, RISE, 2.6, '#ffd2f6', '#fff6c4');
            flash(fx, {at, delay: RISE, size: 1.2, life: 0.08, order: 8});
            // The sky lit up: a wide pink glow over 1.5 s.
            fx.sys({
                tex: 'glow',
                life: 1.5,
                size: 9,
                burst: [[0, 1]],
                delay: RISE,
                at,
                loop: false,
                color: '#7a2f6c',
                order: 0,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.05],
                            [0.4, 0.4],
                            [0, 1],
                        ]
                    ),
                ],
            });
            sparks(fx, {at, delay: RISE, count: 24, speed: [1.6, 5.6], life: [0.15, 0.35], palette: gold, gravity: 2});
            burstSmoke(fx, at, RISE, 7);
        },
    },
    {
        id: 'explosions/firework-rocket',
        name: 'Firework rocket',
        loop: false,
        period: 3.8,
        view: {height: 4.4, distance: 16},
        build(fx) {
            // pixelfx: the rocket climbs 192 px in 1.05 s (ease-out), wobbling, and bursts into a palm.
            const FLY = 1.05;
            const H = 6.4;
            const gold: Ramp = [
                ['#ffffff', 0],
                ['#fff2b0', 0.06],
                ['#ffd860', 0.25],
                ['#f0a830', 0.5],
                ['#b8701a', 0.75],
                ['#6a3a0c', 1],
            ];
            const path = (t: number): [number, number, number] => {
                const k = Math.min(1, t / FLY);
                return [
                    Math.sin(t * 8) * 0.065 * k,
                    0.3 + (H - 0.3) * (1 - (1 - k) * (1 - k)),
                    Math.cos(t * 6) * 0.04 * k,
                ];
            };
            const top = path(FLY);
            const rocket = fx.node('rocket', [0, 0.3, 0]);
            const tube = fx.prop(shapes.cylinder(fx.scene, 0.28, 0.06), {
                parent: rocket,
                at: [0, 0.14, 0],
                color: '#b8303a',
            });
            const cap = fx.prop(shapes.cylinder(fx.scene, 0.06, 0.07), {
                parent: rocket,
                at: [0, 0.3, 0],
                color: '#d8d0c0',
            });
            const stick = fx.prop(shapes.cylinder(fx.scene, 0.34, 0.012), {
                parent: rocket,
                at: [0.05, -0.15, 0],
                color: '#5a4030',
            });
            fx.every((t) => {
                rocket.position.set(...path(t));
                for (const m of [tube, cap, stick]) m.isVisible = t < FLY;
            });
            // Ignition: a spray of sparks and a puff of smoke off the ground.
            sparks(fx, {
                at: [0, 0.1, 0],
                count: 18,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 1.2}),
                speed: [2.4, 7],
                life: [0.15, 0.4],
                palette: gold,
            });
            smoke(fx, {
                at: [0, 0.1, 0],
                burst: [[0, 5]],
                loop: false,
                color: '#5a5468',
                alpha: 0.5,
                life: [0.6, 1],
                speed: [0.3, 0.8],
                size: [0.5, 0.8],
                spread: 1.3,
            });
            flash(fx, {at: [0, 0.4, 0], size: 1.6, life: 0.35, color: '#ffd860', order: 2});
            // The climb: a white-hot tail spitting gold sparks, glitter left hanging, a thread of smoke.
            fx.sys({
                tex: 'glow',
                life: FLY,
                size: 0.7,
                burst: [[0, 1]],
                parent: rocket,
                loop: false,
                color: '#ffd860',
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [0.7, 0.5],
                            [1, 0.95],
                            [0, 1],
                        ]
                    ),
                ],
            });
            sparks(fx, {
                parent: rocket,
                rate: 90,
                duration: FLY,
                world: true,
                aim: 'down',
                shape: new ConeEmitter({radius: 0.02, angle: 0.45}),
                speed: [1.2, 4.4],
                life: [0.15, 0.4],
                size: [0.04, 0.07],
                palette: gold,
            });
            fx.sys({
                tex: 'glint',
                life: [0.4, 0.9],
                speed: [0.1, 0.5],
                size: [0.07, 0.15],
                rate: 22,
                duration: FLY,
                parent: rocket,
                at: [0, -0.15, 0],
                loop: false,
                world: true,
                color: '#fff2b0',
                aim: 'down',
                order: 3,
                b: [tint([['#ffffff', 0]], flicker()), gravity(0.5)],
            });
            smoke(fx, {
                parent: rocket,
                at: [0, -0.2, 0],
                rate: 16,
                duration: FLY,
                loop: false,
                world: true,
                color: '#4a4458',
                alpha: 0.35,
                life: [0.6, 1.1],
                speed: [0.1, 0.4],
                size: [0.2, 0.36],
                aim: 'down',
            });
            // The palm: heavy gold comets thrown up and out on long glittering trails, which droop and
            // crackle white and cyan at the tips. A cone round the sky, so the fronds spread in depth too.
            fireworkStars(fx, {
                at: top,
                delay: FLY,
                count: 16,
                speed: [7.2, 8.4],
                life: [1.8, 2.15],
                ramp: gold,
                trail: 60,
                droop: 4.2,
                drag: 1.35,
                size: [0.16, 0.2],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 1.4, thickness: 1}),
                glitter: [
                    [0, 34],
                    [1, 34],
                ],
                glitterColor: '#fff2b0',
                pops: 4,
                popColor: '#7cd8f0',
            });
            flare(fx, top, FLY, 2.2, '#fff2b0', '#ffd860');
            flash(fx, {at: top, delay: FLY, size: 1.6, life: 0.08, order: 8});
            fx.sys({
                tex: 'glow',
                life: 1.6,
                size: 7,
                burst: [[0, 1]],
                delay: FLY,
                at: top,
                loop: false,
                color: '#6a4a14',
                order: 0,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.05],
                            [0.4, 0.4],
                            [0, 1],
                        ]
                    ),
                ],
            });
            sparks(fx, {
                at: top,
                delay: FLY,
                count: 30,
                speed: [1.6, 6.4],
                life: [0.15, 0.35],
                palette: gold,
                gravity: 2,
            });
            burstSmoke(fx, top, FLY, 6);
        },
    },
    {
        id: 'explosions/grenade',
        name: 'Grenade',
        loop: false,
        period: 4.2,
        build(fx) {
            const blow = 1.62;
            const node = fx.node('grenade', [-3, 2, 0]);
            const body = fx.prop(shapes.sphere(fx.scene, 0.2, 8), {parent: node, color: '#3a4a2a'});
            body.scaling.y = 1.25;
            fx.every((t) => {
                body.setEnabled(t < blow);
                // Lobbed in, a bounce, a roll to a stop, a shudder.
                if (t < 0.6) {
                    const k = t / 0.6;
                    node.position.set(-3 + 2.4 * k, 2 + 1.2 * Math.sin(k * Math.PI) - 1.8 * k, 0);
                } else if (t < 1) {
                    const k = (t - 0.6) / 0.4;
                    node.position.set(-0.6 + 0.45 * k, 0.2 + 0.5 * Math.sin(k * Math.PI), 0);
                } else {
                    const k = Math.min(1, (t - 1) / 0.5);
                    node.position.set(-0.15 + 0.15 * (1 - (1 - k) * (1 - k)), 0.2, 0);
                }
                body.rotation.z = t < 1.5 ? -t * 8 : -12 + (t > 1.6 ? 0.1 * Math.sin(t * 80) : 0);
            });
            sparks(fx, {
                parent: node,
                at: [0, 0.3, 0],
                rate: 30,
                duration: blow,
                loop: false,
                speed: [1, 2],
                gravity: 4,
                life: [0.2, 0.4],
                shape: new SphereEmitter({radius: 0.02}),
            });
            // The fuse's thread of smoke.
            smoke(fx, {
                parent: node,
                at: [0, 0.3, 0],
                rate: 8,
                duration: blow,
                loop: false,
                speed: [0.3, 0.6],
                life: [0.6, 1],
                size: [0.1, 0.18],
                alpha: 0.4,
                color: '#8a8290',
                radius: 0.02,
                spread: 0.2,
            });
            // grenade.js: a small blast (a white flash, a ring, a small fireball cooling into smoke,
            // sparks, grit and a scorch) and shrapnel: hot streaks flying straight and far, low.
            blast(fx, {delay: blow, size: 0.8, earth: 0.8, brands: 0});
            sparks(fx, {
                at: [0, 0.25, 0],
                time: blow,
                count: 26,
                speed: [14, 20],
                life: [0.25, 0.45],
                stretch: 0.05,
                gravity: 1,
                shape: new ConeEmitter({radius: 0.05, angle: 1.4}),
                aim: 'up',
                palette: [
                    ['#ffffff', 0],
                    ['#ffe26b', 0.3],
                    ['#ff8a2a', 1],
                ],
            });
            // The casing in pieces.
            debris(fx, {
                at: [0, 0.2, 0],
                count: 8,
                delay: blow,
                speed: [5, 10],
                size: [0.06, 0.1],
                color: ['#3a4a2a', '#5a6a3a'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1.2}),
            });
        },
    },
    {
        id: 'explosions/implosion',
        name: 'Implosion',
        loop: false,
        period: 1.65,
        build(fx) {
            // implosion.js: everything sucked in for 0.8 s (streaks of light rushing in from all round,
            // accelerating and thickening, grit spiralling in, vapour drawn in, rings pulled in one after
            // another, brighter as they go, a dark sphere edged with light collapsing onto the core); a
            // white point trembling in the stillness; at 1.02 s a sharp pop: a white point bursting, a
            // cross flare, a fast thin ring and a slower one, sparks.
            const SUCK = 0.8;
            const POP = 1.02;
            const at: [number, number, number] = [0, 1.6, 0];
            // Streaks rushing inward from a sphere around the centre.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.5,
                speed: -6,
                size: [0.06, 0.1],
                rate: 160,
                duration: SUCK - 0.2,
                loop: false,
                color: '#d8c8ff',
                shape: new SphereEmitter({radius: 3, thickness: 0}),
                at,
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.3))],
            });
            fx.sys({
                tex: 'dot',
                blend: 'alpha',
                life: 0.6,
                speed: -4.5,
                size: [0.04, 0.07],
                rate: 60,
                duration: SUCK - 0.15,
                loop: false,
                color: '#3a2470',
                shape: new SphereEmitter({radius: 2.7, thickness: 0.2}),
                at,
                order: 2,
            });
            // Rings contracting.
            for (const d of [0, 0.25, 0.5]) {
                fx.sys({
                    tex: 'ring',
                    life: SUCK - d,
                    size: 5 - d * 3,
                    burst: [[d, 1]],
                    color: '#a080f0',
                    at,
                    order: 4,
                    b: [tint([['#ffffff', 0]], fadeOut(0.7, 0.3)), grow([0, 1], [1, 0.05])],
                });
            }
            // Vapour drawn in along the way.
            fx.sys({
                image: 'smoke-puff',
                randomTile: false,
                blend: 'alpha',
                life: 0.5,
                speed: -3.6,
                size: [0.6, 0.9],
                rot: true,
                rate: 30,
                duration: SUCK - 0.3,
                loop: false,
                color: '#6a44c0',
                alpha: 0.5,
                shape: new SphereEmitter({radius: 2, thickness: 0}),
                at,
                order: 2,
                b: [
                    holdFrame(6),
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.4],
                            [0, 1],
                        ]
                    ),
                    grow([0, 1], [1, 0.3]),
                ],
            });
            // A dark sphere collapsing onto a crushed white point.
            fx.sys({
                tex: 'glow',
                blend: 'alpha',
                life: SUCK,
                size: 3.2,
                burst: 1,
                color: '#05040a',
                alpha: 0.9,
                at,
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.85, 0.2)), grow([0, 1], [1, 0.05])],
            });
            fx.sys({
                tex: 'glint',
                life: POP - SUCK + 0.02,
                size: 0.5,
                burst: [[SUCK, 1]],
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker()), wobble(30, 0.02)],
            });
            // The pop: a burst, a cross flare, a fast thin ring and a slower one.
            flash(fx, {at, size: 2.4, time: POP, life: 0.12, color: '#ffffff'});
            fx.sys({
                tex: 'glint',
                life: 0.25,
                size: 3.4,
                burst: [[POP, 1]],
                loop: false,
                at,
                order: 6,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#d8c8ff', 1],
                        ],
                        popOut(0.2)
                    ),
                    grow([0, 1], [1, 0.4]),
                ],
            });
            fx.sys({
                tex: 'ring',
                life: 0.45,
                size: 3,
                burst: [[POP + 0.04, 1]],
                loop: false,
                at,
                color: '#a080f0',
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.1], [1, 1])],
            });
            fx.sys({
                tex: 'ring',
                life: 0.3,
                size: 4.4,
                burst: [[POP, 1]],
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            sparks(fx, {
                at,
                count: 24,
                time: POP,
                speed: [6, 9],
                gravity: 0,
                palette: [
                    ['#ffffff', 0],
                    ['#a080f0', 1],
                ],
            });
        },
    },
    {
        id: 'explosions/nuke',
        name: 'Nuke',
        loop: false,
        period: 9,
        view: {height: 2.6, distance: 14},
        build(fx) {
            // nuke.js in 3D: a blinding white frame (0.05 s) with a white-hot sphere cooling into the
            // fireball; the fireball lifts on a thin stem into a wide, flat cap rolling like a torus,
            // lit taupe on top, dark beneath, its hollow glowing orange where the stem goes in; a white
            // condensation skirt flaring round it (0.55-1.75 s); a base surge of dust racing out along
            // the floor, then afterwinds drawing dust in; the stem breaks up from the bottom and the cap
            // drifts and thins away by 9 s.
            const fireRamp = rampTexture(fx.scene, PALETTE.fire);
            fx.sys({
                tex: 'glow',
                life: 0.4,
                size: 16,
                burst: 1,
                at: [0, 1.2, 0],
                order: 8,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [1, 0.15],
                            [0, 1],
                        ]
                    ),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: 0.7,
                size: 3.4,
                burst: 1,
                at: [0, 1.2, 0],
                order: 8,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#fff3a6', 0.4],
                            ['#ff8a2a', 1],
                        ],
                        popOut(0.4)
                    ),
                ],
            });
            // The fireball, lifting on its stem.
            const ball = fx.node('ball', [0, 1.2, 0]);
            fx.every((t) => {
                ball.position.y = 1.2 + 3.2 * (1 - Math.exp(-t / 0.9));
            });
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'add',
                life: [0.4, 0.7],
                speed: [0.4, 1.4],
                size: [1, 1.6],
                rot: true,
                rate: 40,
                duration: 2.2,
                loop: false,
                shape: new SphereEmitter({radius: 0.7}),
                parent: ball,
                order: 5,
                look: {gradientMap: {ramp: fireRamp}},
                b: [lifeFrames(16, 1.2), tint([['#ffffff', 0]], popOut(0.4)), grow([0, 0.8], [1, 1.3])],
            });
            heart(fx, {parent: ball, size: 4.4, color: '#ff9a3a', alpha: 0.55, duration: 3.6, loop: false});
            // The cap: a wide rolling torus of smoke, lit on top, dark beneath.
            fx.sys({
                image: 'smoke-puff',
                randomTile: false,
                blend: 'alpha',
                life: [5.5, 7],
                speed: [0.1, 0.35],
                size: [1.3, 1.8],
                rot: true,
                burst: [[0.3, 60]],
                rate: 20,
                duration: 3,
                loop: false,
                shape: new DonutEmitter({radius: 1.7, donutRadius: 0.35}),
                aim: 'up',
                parent: ball,
                order: 4,
                b: [
                    holdFrame(7),
                    tint(
                        [
                            ['#ffc23d', 0],
                            ['#c9281f', 0.08],
                            ['#a0918c', 0.2],
                            ['#7c6f6e', 0.5],
                            ['#5f5458', 0.8],
                            ['#40373f', 1],
                        ],
                        [
                            [0, 0],
                            [1, 0.04],
                            [0.95, 0.75],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.6], [0.3, 1.2], [1, 1.6]),
                    wobble(0.6, 0.25),
                ],
            });
            // The hollow under the cap, glowing where the stem goes in.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'add',
                life: 4.5,
                burst: [[0.4, 1]],
                loop: false,
                size: 2.4,
                at: [0, -0.35, 0],
                parent: ball,
                color: '#ff5a1a',
                order: 3,
                b: [
                    tint(
                        [
                            ['#ffc23d', 0],
                            ['#c9281f', 0.6],
                            ['#4a1712', 1],
                        ],
                        [
                            [0, 0],
                            [1, 0.05],
                            [0.8, 0.5],
                            [0, 1],
                        ]
                    ),
                ],
            });
            // The condensation skirt: a white veil flaring round the cap and evaporating.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.2,
                burst: [[0.55, 1]],
                loop: false,
                size: 4.4,
                at: [0, -0.6, 0],
                parent: ball,
                color: '#ffffff',
                alpha: 0.85,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.5], [1, 1.3])],
            });
            // The stem: tan smoke feeding the cap, breaking up from the bottom.
            smoke(fx, {
                at: [0, 0.2, 0],
                rate: 30,
                delay: 0.2,
                duration: 4.6,
                loop: false,
                speed: [2.4, 3],
                life: [2, 2.4],
                size: [0.75, 1],
                color: '#c8a888',
                alpha: 0.95,
                radius: 0.15,
                spread: 0.03,
                grows: 1.5,
            });
            // The base surge: dust thrown out along the floor in every direction.
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.6, thickness: 1}),
                at: [0, 0.2, 0],
                burst: [[0.15, 48]],
                speed: [3.5, 6],
                size: [0.7, 1.1],
                life: [1.4, 2.2],
                color: '#9a8478',
                alpha: 0.7,
                loop: false,
            });
            shockwave(fx, {size: 10, delay: 0.05, life: 0.7, alpha: 0.9, color: '#ffe2c0'});
            sparks(fx, {at: [0, 1.4, 0], count: 60, speed: [3, 9], life: [0.4, 1], gravity: 2});
            embers(fx, {
                parent: ball,
                rate: 14,
                duration: 2.6,
                loop: false,
                radius: 1.4,
                speed: [0.6, 1.8],
                life: [1, 2],
            });
            pool(fx, {size: 7, alpha: 0.4, duration: 2.8, loop: false});
            decal(fx, {size: 5, life: 8.5, alpha: 0.75});
        },
    },
    {
        id: 'explosions/plasma-explosion',
        name: 'Plasma explosion',
        loop: false,
        period: 1.7,
        build(fx) {
            // plasma-explosion.js in 3D: no smoke. A white flash; a ball of plasma (a white heart in
            // cyan and blue bands, a violet rim boiling at its edge) swelling for 0.55 s, then hollowing
            // into a thinning violet shell; a fast bright shock shell and a slower violet one, and a ring
            // tilted round it in depth; lightning re-struck out of the heart every few frames, shorter as
            // the charge runs out, little arcs crawling over the shell; sparkles and motes shed by the
            // shell, twinkling on to 1.2 s.
            const at: [number, number, number] = [0, 2, 0];
            flash(fx, {at, size: 3.2, color: '#ffffff', life: 0.1});
            // The ball: a white heart in blue bands, swelling, then going out from the middle.
            fx.sys({
                tex: 'glow',
                life: 0.55,
                size: 2.6,
                burst: 1,
                at,
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#c8ecff', 0.3],
                            ['#4a7cf0', 0.7],
                            ['#1a1c6e', 1],
                        ],
                        [
                            [1, 0],
                            [1, 0.5],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.5], [0.6, 1.2], [1, 0.6]),
                ],
            });
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'add',
                life: [0.3, 0.55],
                speed: [0.2, 0.8],
                size: [0.6, 1],
                rot: true,
                burst: [[0, 16]],
                loop: false,
                shape: new SphereEmitter({radius: 0.45}),
                at,
                order: 4,
                look: {
                    gradientMap: {
                        ramp: rampTexture(fx.scene, [
                            ['#ffffff', 0],
                            ['#c8ecff', 0.25],
                            ['#7cc0ff', 0.45],
                            ['#4a7cf0', 0.65],
                            ['#9a5cff', 0.85],
                            ['#3a1f9c', 1],
                        ]),
                    },
                },
                b: [lifeFrames(16, 1.2), tint([['#ffffff', 0]], popOut(0.4)), orbit(4, [0, 1, 0])],
            });
            // The shell: the violet rim left as the ball hollows out, thinning.
            fx.sys({
                tex: 'ring',
                life: 0.5,
                size: 2.4,
                burst: [[0.3, 1]],
                loop: false,
                at,
                color: '#9a5cff',
                order: 6,
                b: [
                    tint(
                        [
                            ['#e7c8ff', 0],
                            ['#9a5cff', 0.5],
                            ['#3a1f9c', 1],
                        ],
                        popOut(0.3)
                    ),
                    grow([0, 0.8], [1, 1.25]),
                ],
            });
            // Shock shells: a fast bright one and a slower violet one; a ring tilted round it.
            fx.sys({
                tex: 'ring',
                life: 0.35,
                size: 4.6,
                burst: [[0.03, 1]],
                loop: false,
                at,
                color: '#c8ecff',
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.15], [1, 1])],
            });
            fx.sys({
                tex: 'ring',
                life: 0.6,
                size: 3.8,
                burst: [[0.08, 1]],
                loop: false,
                at,
                color: '#9a5cff',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.2], [1, 1])],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.7,
                size: 5.2,
                burst: [[0.05, 1]],
                loop: false,
                at,
                rotate: [0.35, 0, 0.2],
                color: '#7cc0ff',
                order: 6,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#9a5cff', 1],
                        ],
                        popOut(0.3)
                    ),
                    grow([0, 0.25], [1, 1]),
                ],
            });
            // Lightning out of the heart, re-struck every few frames, shorter as the charge runs out.
            const tips = [0, 1, 2, 3].map((i) => fx.node(`tip${i}`, at));
            fx.every((t) => {
                const strike = Math.floor(t * 15);
                const reach = 1.3 * Math.max(0.25, 1 - t / 0.7);
                tips.forEach((tip, i) => {
                    const h = Math.sin((strike + 1) * 12.9898 + i * 78.233) * 43758.5453;
                    const u = h - Math.floor(h);
                    const v = Math.abs(Math.sin(h)) % 1;
                    const a = u * Math.PI * 2;
                    const e = (v - 0.5) * 2.2;
                    tip.position.set(
                        at[0] + Math.cos(a) * Math.cos(e) * reach,
                        at[1] + Math.sin(e) * reach,
                        at[2] + Math.sin(a) * Math.cos(e) * reach
                    );
                });
            });
            for (const tip of tips) {
                arcs(fx, {
                    at,
                    to: tip,
                    rate: 26,
                    duration: 0.7,
                    loop: false,
                    width: [0.25, 0.4],
                    color: '#c8ecff',
                    palette: PALETTE.electric,
                });
            }
            // Sparkles and motes shed by the shell.
            fx.sys({
                tex: 'glint',
                life: [0.5, 0.9],
                speed: [0.6, 2.2],
                size: [0.12, 0.24],
                burst: [[0.3, 24]],
                loop: false,
                shape: new SphereEmitter({radius: 1, thickness: 0.2}),
                at,
                order: 7,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#c8ecff', 0.6],
                            ['#9a5cff', 1],
                        ],
                        flicker()
                    ),
                    drag([0, 1], [1, 0.1]),
                ],
            });
            heart(fx, {at, size: 4.4, color: '#7c9cff', alpha: 0.5, duration: 0.6, loop: false});
        },
    },
    {
        id: 'explosions/small-explosion',
        name: 'Explosion',
        loop: false,
        period: 5.4,
        build(fx) {
            blast(fx, {size: 1});
            pool(fx, {size: 4, alpha: 0.4, duration: 1.4, loop: false});
        },
    },
    {
        id: 'explosions/smoke-bomb',
        name: 'Smoke bomb',
        loop: false,
        period: 5,
        build(fx) {
            // smoke-bomb.js: a round canister thrown in from the left clinks down, rolls to rest, its
            // fuse sparking quicker as it burns down with a thread of smoke; at 0.95 s it pops (a flash,
            // a soft light dying fast, sparks and grit, the canister jolted) and thick grey-violet smoke
            // gushes out: rollers sliding out low along the floor, a fat core over the canister, a plume
            // driven up and a trickle keeping the base filled; the lobes rise as they billow, a breeze
            // takes them late on, they thin and shed wisps; the spent canister keeps smoking a little.
            const POP = 0.95;
            const can = fx.node('can', [-2.5, 1.2, 0]);
            fx.prop(shapes.cylinder(fx.scene, 0.34, 0.17), {parent: can, color: '#4a4a5a'});
            fx.prop(shapes.cylinder(fx.scene, 0.08, 0.175), {parent: can, color: '#7a2a24'});
            fx.every((t) => {
                if (t < 0.45) {
                    const k = t / 0.45;
                    can.position.set(-2.5 + 2.2 * k, 0.17 + 1.1 * (1 - k) + 0.6 * Math.sin(k * Math.PI), 0);
                } else if (t < 0.7) {
                    const k = (t - 0.45) / 0.25;
                    can.position.set(-0.3 + 0.24 * k, 0.17 + 0.25 * Math.sin(k * Math.PI), 0);
                } else {
                    const k = Math.min(1, (t - 0.7) / 0.2);
                    const jolt = t > POP && t < POP + 0.15 ? 0.08 * Math.sin((t - POP) * 60) : 0;
                    can.position.set(-0.06 + 0.06 * k, 0.17 + Math.abs(jolt), 0);
                }
                can.rotation.z = t < 0.9 ? -t * 9 : -8.1;
            });
            // The clink: a few bright specks and a puff of dust.
            sparks(fx, {
                at: [-0.3, 0.05, 0],
                time: 0.45,
                count: 6,
                speed: [1.5, 3],
                life: [0.15, 0.3],
                gravity: 6,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 1}),
            });
            smoke(fx, {
                at: [-0.3, 0.05, 0],
                burst: [[0.45, 3]],
                speed: [0.3, 0.8],
                life: [0.4, 0.7],
                size: [0.2, 0.3],
                color: '#776c88',
                alpha: 0.5,
                loop: false,
            });
            // The fuse: sparks spitting off its tip, quicker as it burns down; a thread of smoke.
            const fuse = sparks(fx, {
                parent: can,
                at: [0, 0.25, 0],
                rate: 30,
                duration: POP,
                loop: false,
                speed: [0.8, 1.6],
                gravity: 3,
                life: [0.2, 0.35],
                shape: new SphereEmitter({radius: 0.02}),
            });
            // Over the fuse system's own duration (POP): spitting quicker as it burns down.
            fuse.emissionOverTime = curve([0, 10], [1, 50]);
            smoke(fx, {
                parent: can,
                at: [0, 0.3, 0],
                rate: 8,
                duration: POP,
                loop: false,
                speed: [0.2, 0.5],
                life: [0.6, 1],
                size: [0.08, 0.14],
                alpha: 0.4,
                color: '#867a9e',
                radius: 0.02,
                spread: 0.2,
            });
            // The pop.
            flash(fx, {at: [0, 0.4, 0], size: 1.6, time: POP, color: '#e8e0ff'});
            heart(fx, {
                at: [0, 0.6, 0],
                size: 2.6,
                color: '#d8c8ff',
                alpha: 0.5,
                delay: POP,
                duration: 0.25,
                loop: false,
            });
            sparks(fx, {at: [0, 0.3, 0], time: POP, count: 16, speed: [2, 5], life: [0.2, 0.45], gravity: 6});
            debris(fx, {
                at: [0, 0.2, 0],
                count: 14,
                delay: POP,
                speed: [2, 5],
                size: [0.03, 0.06],
                color: ['#3e3650', '#776c88'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1}),
            });
            // The smoke: rollers low along the floor, a fat core, a plume up, a trickle filling the base.
            const SMOKE: [string, string] = ['#62567a', '#aea4c4'];
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                at: [0, 0.35, 0],
                burst: [[POP, 20]],
                speed: [1.6, 3.2],
                size: [2, 2.8],
                life: [3, 3.8],
                color: SMOKE,
                alpha: 0.85,
                loop: false,
                grows: 2.2,
            });
            smoke(fx, {
                at: [0, 0.6, 0],
                burst: [[POP + 0.05, 14]],
                speed: [0.3, 1],
                spread: 1.2,
                size: [2.6, 3.4],
                life: [3, 3.8],
                color: SMOKE,
                alpha: 0.9,
                radius: 0.4,
                loop: false,
                grows: 2.4,
            });
            smoke(fx, {
                at: [0, 0.6, 0],
                burst: [[POP + 0.1, 12]],
                speed: [2, 3.6],
                spread: 0.3,
                size: [2.2, 3],
                life: [2.6, 3.4],
                color: SMOKE,
                alpha: 0.85,
                loop: false,
                grows: 2.2,
            });
            smoke(fx, {
                at: [0, 0.4, 0],
                rate: 8,
                delay: POP + 0.2,
                duration: 2,
                loop: false,
                speed: [0.4, 1],
                size: [2, 2.6],
                life: [2, 2.6],
                color: SMOKE,
                alpha: 0.75,
                radius: 0.5,
            });
            // The spent canister keeps smoking a little.
            smoke(fx, {
                at: [0, 0.35, 0],
                rate: 4,
                delay: POP + 2,
                duration: 1.8,
                loop: false,
                speed: [0.3, 0.6],
                life: [1, 1.5],
                size: [0.2, 0.35],
                alpha: 0.4,
                color: '#867a9e',
                radius: 0.05,
                spread: 0.3,
            });
        },
    },
];
