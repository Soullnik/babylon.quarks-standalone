import {CircleEmitter, ConeEmitter, DonutEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {drag, fadeOut, flicker, gravity, grow, orbit, popOut, spin, subEmit, tint, wobble} from './kit';
import {PALETTE, debris, decal, embers, flames, flash, pool, shockwave, smoke, sparks, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';

const BLAST: Ramp = [
    ['#ffffff', 0],
    ['#fff3a6', 0.08],
    ['#ffc23d', 0.2],
    ['#f2561d', 0.4],
    ['#8a1f17', 0.65],
    ['#2a2026', 1],
];

/** The fireball of a blast: billowing fire puffs thrown up and out that cool into smoke. */
function fireball(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        delay?: number;
        size?: number;
        count?: number;
        speed?: [number, number];
        spread?: number;
        palette?: Ramp;
    }
) {
    const size = o.size ?? 1;
    return fx.sys({
        tex: 'smoke',
        life: [0.7, 1.2],
        speed: o.speed ?? [2 * size, 4.5 * size],
        size: [1 * size, 1.6 * size],
        rot: true,
        burst: [[0, o.count ?? 26]],
        delay: o.delay,
        shape: new ConeEmitter({radius: 0.4 * size, angle: o.spread ?? 0.9, thickness: 1}),
        aim: 'up',
        at: o.at ?? [0, 0.3, 0],
        order: 3,
        b: [
            tint(o.palette ?? BLAST, fadeOut(0.5, 0.02)),
            grow([0, 0.5], [0.3, 1.1], [1, 1.5]),
            drag([0, 1], [0.4, 0.15], [1, 0.05]),
            spin([-1.5, 1.5]),
        ],
    });
}

/** A whole ground blast at `scale`: flash, rings, fireball, smoke column, sparks, rocks, scorch. */
function groundBlast(fx: FxBuilder, delay: number, scale: number) {
    flash(fx, {at: [0, 0.6 * scale, 0], size: 5 * scale, delay});
    shockwave(fx, {size: 9 * scale, delay, life: 0.55});
    shockwave(fx, {size: 5 * scale, delay, life: 0.35, facing: true, tex: 'ring', at: [0, 0.8 * scale, 0], alpha: 0.6});
    fireball(fx, {delay, size: scale, count: Math.round(28 * scale)});
    smoke(fx, {
        at: [0, 0.6 * scale, 0],
        burst: [[0, Math.round(16 * scale)]],
        delay: delay + 0.25,
        speed: [1.2 * scale, 2.6 * scale],
        spread: 0.35,
        size: [1.2 * scale, 1.8 * scale],
        life: [2, 3],
        alpha: 0.6,
        loop: false,
    });
    sparks(fx, {
        at: [0, 0.3, 0],
        count: Math.round(40 * scale),
        delay,
        aim: 'up',
        shape: new ConeEmitter({radius: 0.2, angle: 1.1}),
        speed: [5 * scale, 10 * scale],
    });
    debris(fx, {count: Math.round(12 * scale), delay, speed: [4 * scale, 7 * scale]});
    decal(fx, {size: 4 * scale, life: 4, delay, alpha: 0.75});
    decal(fx, {
        tex: 'crack',
        size: 3 * scale,
        life: 2.5,
        delay,
        blend: 'add',
        alpha: 1,
        color: '#ff7a2a',
        colors: [
            ['#ffd27a', 0],
            ['#ff5a1a', 0.3],
            ['#3a0804', 1],
        ],
    });
}

/** A firework star burst: `count` trailing stars from the parent's death point, each crackling out. */
function starBurst(fx: FxBuilder, palette: Ramp, count: number, speed: [number, number], droop: number, trail = 14) {
    const stars = fx.sys({
        tex: 'dot',
        mode: RenderMode.Trail,
        trail,
        life: [1.1, 1.5],
        speed,
        size: [0.08, 0.12],
        burst: [[0, count]],
        loop: false,
        world: true,
        shape: new SphereEmitter({radius: 0.1, thickness: 1}),
        order: 4,
        b: [tint(palette, popOut(0.6)), gravity(droop), drag([0, 1], [0.4, 0.25], [1, 0.1])],
    });
    const crackle = fx.sys({
        tex: 'glint',
        life: [0.2, 0.4],
        speed: [0.2, 0.8],
        size: [0.2, 0.35],
        burst: [[0, 2]],
        loop: false,
        world: true,
        shape: new SphereEmitter({radius: 0.15}),
        order: 5,
        b: [tint([['#ffffff', 0]], flicker())],
    });
    subEmit(stars, crackle, 'death', 0.6);
    return stars;
}

/** pixelfx's explosions category, rebuilt as 3D particle effects. */
export const explosions: FxDef[] = [
    {
        id: 'explosions/barrel-explosion',
        name: 'Barrel explosion',
        loop: false,
        period: 5.6,
        build(fx) {
            const blow = 1.2;
            const barrel = fx.prop(shapes.cylinder(fx.scene, 1.2, 0.45), {at: [0, 0.6, 0], color: '#7a2a1c'});
            const lid = fx.prop(shapes.cylinder(fx.scene, 0.06, 0.47), {at: [0, 1.22, 0], color: '#3a3438'});
            fx.every((t) => {
                const shaking = t < blow;
                barrel.setEnabled(shaking);
                lid.setEnabled(shaking);
                const j = t > 0.4 && shaking ? 0.04 * Math.sin(t * 90) : 0;
                barrel.position.x = j;
                lid.position.y = 1.22 + (t > 0.7 && shaking ? 0.04 + 0.03 * Math.sin(t * 50) : 0);
            });
            // Flame spitting from under the bulging lid.
            fx.sys({
                tex: 'smoke',
                life: [0.2, 0.35],
                speed: [1.5, 2.5],
                size: [0.25, 0.4],
                rate: 30,
                delay: 0.7,
                duration: blow - 0.7,
                loop: false,
                shape: new CircleEmitter({radius: 0.45, thickness: 0}),
                aim: 'up',
                at: [0, 1.25, 0],
                order: 3,
                b: [tint(PALETTE.fire, fadeOut(0.4))],
            });
            groundBlast(fx, blow, 1.1);
            fireball(fx, {delay: blow + 0.05, size: 0.9, count: 18, speed: [5, 8], spread: 0.25});
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
        build(fx) {
            // Beat one: a white dome.
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: 7,
                burst: 1,
                at: [0, 0.5, 0],
                order: 6,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffe2a0', 1],
                        ],
                        popOut(0.3)
                    ),
                    grow([0, 0.3], [0.3, 1], [1, 1.2]),
                ],
            });
            groundBlast(fx, 0.05, 1.5);
            // Beat two: the fireball climbs into a mushroom column.
            fx.sys({
                tex: 'smoke',
                life: [1.6, 2.2],
                speed: [3, 4],
                size: [1.4, 2],
                rot: true,
                rate: 30,
                delay: 0.3,
                duration: 1.6,
                loop: false,
                shape: new ConeEmitter({radius: 0.5, angle: 0.15}),
                aim: 'up',
                order: 3,
                b: [tint(BLAST, fadeOut(0.5, 0.05)), grow([0, 0.6], [1, 1.8]), drag([0, 1], [1, 0.3]), spin([-1, 1])],
            });
            smoke(fx, {
                at: [0, 5, 0],
                shape: new DonutEmitter({radius: 1.6, donutRadius: 0.6}),
                aim: 'up',
                burst: [[0.9, 30]],
                speed: [0.6, 1.2],
                size: [1.8, 2.4],
                life: [3, 4],
                alpha: 0.6,
                loop: false,
            });
            // Beat three: heavy rocks and fires left burning.
            debris(fx, {count: 10, delay: 0.2, size: [0.35, 0.55], speed: [6, 9]});
            for (const x of [-2.2, 1.8, 0.4]) {
                flames(fx, {
                    at: [x, 0, x * 0.4],
                    radius: 0.2,
                    height: 0.8,
                    size: [0.3, 0.5],
                    rate: 18,
                    delay: 1.2,
                    duration: 5,
                    loop: false,
                });
            }
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
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.25,
                size: 3,
                burst: 1,
                color: '#ffd27a',
                at: [0, 0.03, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            debris(fx, {
                count: 20,
                color: ['#3a2a1e', '#6a4a30'],
                speed: [6, 10],
                shape: new ConeEmitter({radius: 0.3, angle: 0.45}),
                size: [0.15, 0.3],
            });
            fx.sys({
                tex: 'square',
                blend: 'alpha',
                life: [0.8, 1.4],
                speed: [5, 11],
                size: [0.06, 0.1],
                rot: true,
                burst: [[0, 60]],
                color: ['#3a2a1e', '#7a5a3a'],
                shape: new ConeEmitter({radius: 0.3, angle: 0.4}),
                aim: 'up',
                order: 2,
                b: [gravity(14), spin([-8, 8])],
            });
            smoke(fx, {
                at: [0, 0.3, 0],
                burst: [[0, 18]],
                speed: [2, 4],
                spread: 0.4,
                size: [1, 1.5],
                life: [1.8, 2.6],
                color: ['#6a5040', '#8a7058'],
                alpha: 0.7,
                loop: false,
                grows: 2.6,
            });
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.6, thickness: 1}),
                burst: [[0.1, 14]],
                speed: [1.5, 2.5],
                size: [0.8, 1.2],
                color: '#7a6050',
                alpha: 0.6,
                loop: false,
                aim: 'up',
            });
            decal(fx, {size: 3, life: 3.4, color: '#1a120c', alpha: 0.85});
        },
    },
    {
        id: 'explosions/firework-burst',
        name: 'Firework burst',
        loop: false,
        period: 3.6,
        build(fx) {
            const shell = fx.sys({
                tex: 'dot',
                mode: RenderMode.Trail,
                trail: 16,
                life: 0.8,
                speed: 7.5,
                size: 0.1,
                burst: 1,
                color: '#ffd27a',
                aim: 'up',
                shape: new ConeEmitter({radius: 0, angle: 0.02}),
                world: true,
                order: 3,
                b: [
                    tint([
                        ['#ffffff', 0],
                        ['#ffb84a', 1],
                    ]),
                    gravity(7),
                ],
            });
            const stars = starBurst(
                fx,
                [
                    ['#ffffff', 0],
                    ['#ff6ad5', 0.15],
                    ['#b04aff', 0.6],
                    ['#3a1a8a', 1],
                ],
                60,
                [4, 5],
                2.2
            );
            const core = fx.sys({
                tex: 'glint',
                life: [0.5, 0.9],
                speed: [0.5, 1.5],
                size: [0.3, 0.5],
                burst: [[0, 12]],
                loop: false,
                world: true,
                color: '#ffd23a',
                shape: new SphereEmitter({radius: 0.2}),
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            const pop = fx.sys({
                tex: 'glow',
                life: 0.2,
                size: 3,
                burst: [[0, 1]],
                loop: false,
                world: true,
                color: '#ffe8c0',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            subEmit(shell, stars);
            subEmit(shell, core);
            subEmit(shell, pop);
        },
    },
    {
        id: 'explosions/firework-rocket',
        name: 'Firework rocket',
        loop: false,
        period: 3.8,
        build(fx) {
            const rocket = fx.sys({
                tex: 'dot',
                life: 1,
                speed: 7.5,
                size: 0.14,
                burst: 1,
                color: '#fff3c0',
                aim: 'up',
                shape: new ConeEmitter({radius: 0, angle: 0.04}),
                world: true,
                order: 4,
                b: [gravity(5)],
            });
            // The sparkling gold trail: one emission born with the rocket, following it for its flight.
            const fizz = fx.sys({
                tex: 'dot',
                life: [0.4, 0.8],
                speed: [0.3, 1],
                size: [0.04, 0.07],
                rate: 90,
                duration: 1,
                loop: false,
                world: true,
                shape: new SphereEmitter({radius: 0.05}),
                order: 3,
                b: [
                    tint(
                        [
                            ['#fff3a6', 0],
                            ['#ffb84a', 0.5],
                            ['#8a3a10', 1],
                        ],
                        flicker()
                    ),
                    gravity(2),
                ],
            });
            subEmit(rocket, fizz, 'birth');
            // The palm: heavy gold fronds that droop on long trails.
            const fronds = starBurst(
                fx,
                [
                    ['#ffffff', 0],
                    ['#ffe08a', 0.2],
                    ['#ffb03a', 0.7],
                    ['#6a2a0a', 1],
                ],
                26,
                [5.5, 6.5],
                4,
                26
            );
            subEmit(rocket, fronds);
        },
    },
    {
        id: 'explosions/grenade',
        name: 'Grenade',
        loop: false,
        period: 4.8,
        build(fx) {
            const blow = 1.9;
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
            flash(fx, {at: [0, 0.5, 0], size: 4, delay: blow});
            shockwave(fx, {size: 6, delay: blow, life: 0.4});
            sparks(fx, {
                at: [0, 0.3, 0],
                count: 50,
                delay: blow,
                speed: [9, 14],
                stretch: 0.1,
                gravity: 3,
                palette: [
                    ['#ffffff', 0],
                    ['#ffe2a0', 0.3],
                    ['#ff8a2a', 1],
                ],
            });
            fireball(fx, {delay: blow, size: 0.7, count: 14});
            smoke(fx, {
                at: [0, 0.5, 0],
                burst: [[0, 10]],
                delay: blow + 0.2,
                speed: [0.8, 1.6],
                size: [0.9, 1.3],
                alpha: 0.5,
                loop: false,
            });
            decal(fx, {size: 2.4, life: 2.2, delay: blow, alpha: 0.8});
        },
    },
    {
        id: 'explosions/implosion',
        name: 'Implosion',
        loop: false,
        period: 2.2,
        build(fx) {
            const at: [number, number, number] = [0, 1.6, 0];
            // Streaks rushing inward from a sphere around the centre.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.5,
                speed: -6,
                size: [0.06, 0.1],
                rate: 120,
                duration: 0.9,
                loop: false,
                color: '#c8d8ff',
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
                duration: 0.9,
                loop: false,
                color: '#3a3448',
                shape: new SphereEmitter({radius: 2.7, thickness: 0.2}),
                at,
                order: 2,
            });
            // Rings contracting.
            for (const d of [0, 0.3, 0.6]) {
                fx.sys({
                    tex: 'ring',
                    life: 0.5,
                    size: 5,
                    burst: [[d, 1]],
                    color: '#9ab0ff',
                    at,
                    order: 4,
                    b: [tint([['#ffffff', 0]], fadeOut(0.7, 0.3)), grow([0, 1], [1, 0.05])],
                });
            }
            // A dark sphere collapsing onto a crushed white point.
            fx.sys({
                tex: 'glow',
                blend: 'alpha',
                life: 1.1,
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
                life: 0.3,
                size: 0.6,
                burst: [[0.95, 1]],
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            // The pop.
            flash(fx, {at, size: 3, delay: 1.3, life: 0.15});
            fx.sys({
                tex: 'ring',
                life: 0.3,
                size: 4,
                burst: [[1.3, 1]],
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            sparks(fx, {
                at,
                count: 24,
                delay: 1.3,
                speed: [6, 9],
                gravity: 0,
                palette: [
                    ['#ffffff', 0],
                    ['#9ab0ff', 1],
                ],
            });
        },
    },
    {
        id: 'explosions/nuke',
        name: 'Nuke',
        loop: false,
        period: 9,
        build(fx) {
            fx.sys({
                tex: 'glow',
                life: 0.6,
                size: 9,
                burst: 1,
                at: [0, 1, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.25))],
            });
            // The stem: fire rising in a thin column.
            fx.sys({
                tex: 'smoke',
                life: [1.2, 1.6],
                speed: [3, 3.6],
                size: [0.5, 0.7],
                rot: true,
                rate: 40,
                delay: 0.2,
                duration: 3,
                loop: false,
                shape: new ConeEmitter({radius: 0.3, angle: 0.03}),
                aim: 'up',
                order: 3,
                b: [
                    tint(
                        [
                            ['#ffe2a0', 0],
                            ['#ff8a2a', 0.3],
                            ['#8a2a17', 0.7],
                            ['#3a2a2a', 1],
                        ],
                        fadeOut(0.6, 0.1)
                    ),
                    grow([0, 0.8], [1, 1.4]),
                    drag([0, 1], [1, 0.4]),
                ],
            });
            // The cap: a rolling torus of fire and smoke, glowing from inside.
            fx.sys({
                tex: 'smoke',
                life: [2.4, 3.2],
                speed: [0, 0.15],
                size: [0.9, 1.3],
                rot: true,
                rate: 45,
                delay: 0.6,
                duration: 3.5,
                loop: false,
                shape: new DonutEmitter({radius: 1.2, donutRadius: 0.5}),
                aim: 'up',
                at: [0, 4.4, 0],
                order: 3,
                b: [
                    tint(
                        [
                            ['#fff3a6', 0],
                            ['#ff8a2a', 0.2],
                            ['#a83a1a', 0.5],
                            ['#3a2a30', 1],
                        ],
                        fadeOut(0.55, 0.1)
                    ),
                    orbit(1.2, [0, 0, 1]),
                    grow([0, 0.8], [1, 1.4]),
                    spin([-0.5, 0.5]),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: 0.6,
                size: [3, 4],
                rate: 8,
                delay: 0.6,
                duration: 3.5,
                loop: false,
                color: '#ff9a3a',
                alpha: 0.5,
                at: [0, 4.4, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // The white skirt flash, and a dust surge sweeping the floor.
            shockwave(fx, {size: 8, delay: 0.1, life: 0.7, alpha: 0.9});
            fx.sys({
                tex: 'ring',
                life: 0.8,
                size: 5,
                burst: [[1.4, 1]],
                at: [0, 3.8, 0],
                mode: RenderMode.HorizontalBillBoard,
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.3], [1, 1])],
            });
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.8, thickness: 0}),
                aim: 'up',
                burst: [[0.2, 40]],
                speed: [3.5, 4.5],
                size: [0.8, 1.1],
                life: [1.6, 2],
                color: '#8a7a6a',
                alpha: 0.55,
                loop: false,
                spread: 0,
                grows: 2,
            });
            decal(fx, {size: 6, life: 8.5, alpha: 0.8});
        },
    },
    {
        id: 'explosions/plasma-explosion',
        name: 'Plasma explosion',
        loop: false,
        period: 2.2,
        build(fx) {
            const at: [number, number, number] = [0, 1.5, 0];
            flash(fx, {at, size: 4, color: '#e7c8ff'});
            // A ball of plasma swelling into a thinning shell.
            fx.sys({
                tex: 'glow',
                life: 0.9,
                size: 4.5,
                burst: 1,
                at,
                color: '#b07aff',
                order: 3,
                b: [tint(PALETTE.plasma, popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            fx.sys({
                tex: 'ring',
                life: 0.9,
                size: 4.5,
                burst: 1,
                at,
                color: '#d8b8ff',
                order: 4,
                b: [tint(PALETTE.plasma, popOut(0.3)), grow([0, 0.2], [1, 1.1])],
            });
            shockwave(fx, {size: 7, life: 0.5, color: '#9a5cff'});
            fx.sys({
                tex: 'shock',
                life: 0.45,
                size: 6,
                burst: [[0.05, 1]],
                at,
                mode: RenderMode.BillBoard,
                color: '#c8a0ff',
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            // Arcs crackling off it: short trails thrown out and jittered hard.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.Trail,
                trail: 10,
                life: [0.2, 0.35],
                speed: [4, 6],
                size: [0.05, 0.08],
                burst: [
                    [0, 14],
                    [0.15, 10],
                    [0.3, 8],
                ],
                world: true,
                shape: new SphereEmitter({radius: 0.5, thickness: 0}),
                at,
                order: 5,
                b: [tint(PALETTE.electric, popOut(0.4)), wobble(10, 3)],
            });
            fx.sys({
                tex: 'dot',
                life: [0.4, 0.8],
                speed: [1, 3],
                size: [0.06, 0.1],
                burst: [[0, 30]],
                shape: new SphereEmitter({radius: 1}),
                at,
                order: 4,
                b: [tint(PALETTE.plasma, flicker()), drag([0, 1], [1, 0.2])],
            });
        },
    },
    {
        id: 'explosions/small-explosion',
        name: 'Explosion',
        loop: false,
        period: 5.4,
        build(fx) {
            groundBlast(fx, 0, 1);
            // Burning brands thrown out that land and keep burning.
            const brands = fx.sys({
                tex: 'dot',
                life: [0.8, 1.1],
                speed: [4, 6],
                size: 0.12,
                burst: [[0, 5]],
                loop: false,
                color: '#ffb84a',
                shape: new ConeEmitter({radius: 0.2, angle: 0.8}),
                aim: 'up',
                world: true,
                order: 4,
                b: [gravity(10)],
            });
            const burn = fx.sys({
                tex: 'flame',
                life: [0.4, 0.6],
                speed: [0.6, 1],
                size: [0.3, 0.45],
                rate: 14,
                duration: 3,
                loop: false,
                world: true,
                shape: new SphereEmitter({radius: 0.05}),
                aim: 'up',
                order: 3,
                b: [tint(PALETTE.fire, fadeOut(0.5))],
            });
            subEmit(brands, burn, 'birth');
            embers(fx, {at: [0, 0.6, 0], rate: 20, duration: 1.5, loop: false, delay: 0.3, speed: [2, 4]});
        },
    },
    {
        id: 'explosions/smoke-bomb',
        name: 'Smoke bomb',
        loop: false,
        period: 5.6,
        build(fx) {
            const pop = 0.9;
            const can = fx.prop(shapes.cylinder(fx.scene, 0.35, 0.18), {at: [0, 0.18, 0], color: '#4a4a5a'});
            fx.every((t) => can.setEnabled(t < pop + 0.1));
            sparks(fx, {
                at: [0, 0.4, 0],
                rate: 30,
                duration: pop,
                loop: false,
                speed: [0.8, 1.6],
                gravity: 3,
                life: [0.2, 0.35],
                shape: new SphereEmitter({radius: 0.02}),
            });
            flash(fx, {at: [0, 0.4, 0], size: 1.6, delay: pop, color: '#e8e0ff'});
            const SMOKE: [string, string] = ['#6a6278', '#9a92a8'];
            smoke(fx, {
                at: [0, 0.4, 0],
                burst: [[0, 30]],
                delay: pop,
                speed: [1.5, 3.5],
                spread: 1.2,
                size: [1.3, 1.8],
                life: [2.6, 3.6],
                color: SMOKE,
                alpha: 0.75,
                loop: false,
                grows: 2.4,
            });
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                aim: 'up',
                burst: [[0, 24]],
                delay: pop,
                speed: [2.5, 3.5],
                size: [1, 1.4],
                life: [2.4, 3.2],
                color: SMOKE,
                alpha: 0.65,
                loop: false,
                spread: 0,
            });
            smoke(fx, {
                at: [0, 1.2, 0],
                shape: new SphereEmitter({radius: 1.6}),
                rate: 10,
                delay: pop + 0.3,
                duration: 1.6,
                life: [2, 2.8],
                speed: [0.2, 0.5],
                size: [1.6, 2.2],
                color: SMOKE,
                alpha: 0.5,
                loop: false,
            });
        },
    },
];
