import {CircleEmitter, ConeEmitter, ConstantValue, RenderMode, SphereEmitter, Vector3Function} from 'babylon.quarks';
import {ballProfile, flatRing, held, window} from './arcane';
import {airDrag, fadeOut, flicker, gravity, grow, lathe, orbit, popOut, spin, tint, wobble} from './kit';
import {FLAT, clods, dust, light, star, type At} from './parts';
import {decal, shockwave, type Ramp} from './recipes';
import {between, hero, puffs} from './spawn';
import {type FxBuilder, type FxDef} from './stage';

const GOLD = ['#3b1d2a', '#7a3a2c', '#c4652e', '#f0a040', '#ffd25e', '#fff0a0', '#fffbe0', '#ffffff'];
const GREEN = ['#0e2a24', '#14472f', '#1d6e3a', '#2f9a45', '#5cc654', '#a0e46c', '#dcffb4', '#ffffff'];
const WARM = ['#3d2027', '#7d3f35', '#c97a4a', '#f2b46a', '#ffd994', '#fff0cf', '#fffaf2', '#ffffff'];
const FEATHER = ['#4a4560', '#7a7494', '#aaa5c2', '#d6d3e6', '#f4f3fa', '#ffffff'];
const SHINE: Ramp = [
    ['#ffffff', 0],
    [GOLD[6], 0.2],
    [GOLD[5], 0.5],
    [GOLD[4], 1],
];
const SPROUT: Ramp = [
    ['#ffffff', 0],
    [GREEN[6], 0.2],
    [GREEN[5], 0.5],
    [GREEN[4], 1],
];

/** A cone of light from `top` (radius `r0`) down to the floor (radius `r1`), drawn back and front. */
function lightCone(
    fx: FxBuilder,
    o: {
        top: number;
        r0: number;
        r1: number;
        color: string;
        alpha?: number;
        life?: number;
        time?: number;
        loop?: boolean;
        parent?: FxBuilder['root'];
    }
) {
    const geo = lathe(
        [
            [o.r1, 0],
            [o.r0, o.top],
        ],
        40
    );
    const a = o.alpha ?? 1;
    return (['back', 'front'] as const).map((face) =>
        fx.sys({
            image: 'light-column',
            geo,
            blend: 'add',
            loop: o.loop ?? false,
            life: o.life ?? 1e4,
            size: 1,
            burst: [[o.time ?? 0, 1]],
            color: o.color,
            alpha: (face === 'back' ? 0.35 : 0.6) * a,
            parent: o.parent,
            order: face === 'back' ? 2 : 6,
            look: {
                renderFace: face,
                scalingMode: 'hierarchy',
                rim: {color: [1, 0.8, 0.4], power: 2.2, strength: 1, mode: 'fade'},
            },
            b: [
                tint(
                    [['#ffffff', 0]],
                    o.life
                        ? fadeOut(0.7, 0.15)
                        : [
                              [1, 0],
                              [1, 1],
                          ]
                ),
            ],
        })
    );
}

export const holy: FxDef[] = [
    {
        id: 'holy/blessing',
        name: 'Blessing',
        loop: true,
        period: 3,
        view: {height: 2},
        build(fx) {
            fx.character([0, 0, 0]);
            // A soft cone of light rests on the character from above.
            lightCone(fx, {top: 5, r0: 0.25, r1: 0.95, color: GOLD[4], alpha: 1.2});
            // Sparkles drift down through it, twinkling, and wink out on the head and shoulders.
            fx.sys({
                tex: 'glint',
                life: [1.6, 2.2],
                speed: [1.2, 1.6],
                size: [0.12, 0.28],
                rate: 9,
                color: [GOLD[6], '#ffffff'],
                shape: new ConeEmitter({radius: 0.5, angle: 0.05, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 4.6, 0],
                order: 7,
                b: [tint(SHINE, flicker()), wobble(1, 0.2)],
            });
            fx.sys({
                tex: 'dot',
                life: [1.8, 2.4],
                speed: [1, 1.4],
                size: [0.03, 0.05],
                rate: 20,
                color: GOLD[6],
                shape: new ConeEmitter({radius: 0.6, angle: 0.05, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 4.6, 0],
                order: 6,
                b: [tint(SHINE, fadeOut(0.7, 0.2))],
            });
            held(fx, fx.node('crown', [0, 1.85, 0]), {size: 1.2, color: GOLD[5], alpha: 0.35});
            light(fx, {at: [0, 0.05, 0], size: 2.6, color: GOLD[5], floor: true, life: 3, alpha: 0.5, loop: true});
        },
    },
    {
        id: 'holy/divine-shield',
        name: 'Divine shield',
        loop: true,
        period: 2.4,
        build(fx) {
            fx.character([0, 0, 0]);
            const R = 1.25;
            const bubble = fx.node('bubble', [0, 0.95, 0]);
            // A thin gold film with a bright rim.
            const ball = lathe(ballProfile(), 40);
            for (const [face, alpha, order] of [
                ['back', 0.15, 2],
                ['front', 0.35, 6],
            ] as const) {
                fx.sys({
                    geo: ball,
                    tex: 'white',
                    blend: 'add',
                    life: 1e4,
                    size: R,
                    burst: [[0, 1]],
                    color: GOLD[4],
                    alpha,
                    parent: bubble,
                    order,
                    look: {
                        renderFace: face,
                        scalingMode: 'hierarchy',
                        rim: {color: [1.4, 1, 0.4], power: 3, strength: 1, mode: 'fade'},
                    },
                });
            }
            // Meridians turning like a slow globe.
            const globe = fx.node('globe', [0, 0, 0], bubble);
            fx.every((t) => {
                globe.rotation.y = (t / 2.4) * Math.PI * 0.5;
            });
            for (let i = 0; i < 4; i++) {
                const m = fx.node('meridian', [0, 0, 0], globe);
                m.rotation.set(Math.PI / 2, (i / 4) * Math.PI, 0);
                m.rotation.set(0, (i / 4) * Math.PI, Math.PI / 2);
                fx.sys({
                    geo: flatRing(R - 0.012, R + 0.012, 64),
                    tex: 'white',
                    blend: 'add',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color: GOLD[5],
                    alpha: 0.45,
                    parent: m,
                    order: 5,
                    look: {renderFace: 'both'},
                });
            }
            fx.sys({
                geo: flatRing(R - 0.015, R + 0.015, 64),
                tex: 'white',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: GOLD[5],
                alpha: 0.5,
                parent: bubble,
                order: 5,
                look: {renderFace: 'both'},
            });
            // A sheen sweeping across.
            const sheen = fx.node('sheen', [0, 0, R * 0.8], bubble);
            fx.every((t) => {
                const k = (t / 2.4) % 1;
                sheen.position.x = -R + 2 * R * k;
                sheen.position.z = Math.sqrt(Math.max(0, R * R - sheen.position.x ** 2)) * 0.9;
            });
            held(fx, sheen, {size: 1.2, color: GOLD[6], alpha: 0.3, order: 7});
            // Sparkles winking on it.
            fx.sys({
                tex: 'glint',
                life: [0.3, 0.6],
                size: [0.12, 0.26],
                rate: 10,
                color: [GOLD[6], '#ffffff'],
                shape: new SphereEmitter({radius: R, thickness: 0}),
                parent: bubble,
                order: 8,
                b: [tint(SHINE, popOut(0.2)), spin(2)],
            });
            light(fx, {at: [0, 0.05, 0], size: 3.2, color: GOLD[4], floor: true, life: 2.4, alpha: 0.4, loop: true});
        },
    },
    {
        id: 'holy/feather-burst',
        name: 'Feather burst',
        loop: false,
        period: 3,
        view: {height: 1.6},
        build(fx) {
            const at: At = [0, 1.6, 0];
            // A white puff pops.
            star(fx, {
                at,
                size: 2,
                life: 0.25,
                tex: 'glow',
                ramp: [
                    ['#ffffff', 0],
                    ['#fff0c0', 1],
                ],
            });
            puffs(fx, {
                at,
                count: 8,
                time: 0.03,
                speed: [0.8, 1.6],
                size: [0.4, 0.7],
                life: [0.5, 0.8],
                color: [FEATHER[4], FEATHER[5]],
            });
            // Feathers thrown out brake hard, then rock side to side as they sink and fade.
            fx.sys({
                tex: 'streak',
                blend: 'alpha',
                loop: false,
                life: [2, 2.7],
                speed: [5, 8],
                size: [0.3, 0.45],
                burst: [[0.05, 26]],
                rot: true,
                color: [FEATHER[5], FEATHER[4]],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                at,
                world: true,
                order: 5,
                b: [
                    tint([['#ffffff', 0]], fadeOut(0.7, 0.02)),
                    airDrag(6),
                    gravity(0.9),
                    wobble(1.4, 1.1),
                    spin([-2.5, 2.5]),
                ],
            });
            // Down drifting after them.
            fx.sys({
                tex: 'dot',
                loop: false,
                life: [1.8, 2.6],
                speed: [1, 2.5],
                size: [0.03, 0.05],
                burst: [[0.08, 30]],
                color: FEATHER[5],
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
                at,
                world: true,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.05)), airDrag(4), gravity(0.4), wobble(1.5, 0.8)],
            });
            light(fx, {at: [0, 0.05, 0], size: 3.4, color: '#fff0c0', floor: true, life: 0.6, alpha: 0.35});
        },
    },
    {
        id: 'holy/halo',
        name: 'Halo',
        loop: true,
        period: 2,
        build(fx) {
            fx.character([0, 0, 0]);
            const halo = fx.node('halo', [0, 2.05, 0]);
            fx.every((t) => {
                halo.position.y = 2.05 + Math.sin((t / 2) * Math.PI * 2) * 0.03;
            });
            // A ring of gold light over the head, with a glint running round it.
            fx.sys({
                geo: flatRing(0.3, 0.37, 48),
                tex: 'white',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: GOLD[5],
                parent: halo,
                order: 6,
                look: {renderFace: 'both'},
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 1.1,
                burst: [[0, 1]],
                color: GOLD[4],
                alpha: 0.35,
                parent: halo,
                order: 3,
            });
            const spinNode = fx.node('spin', [0, 0, 0], halo);
            fx.every((t) => {
                spinNode.rotation.y = -t * Math.PI;
            });
            const rider = fx.node('rider', [0.335, 0, 0], spinNode);
            fx.sys({tex: 'glint', life: 0.05, size: 0.35, rate: 60, color: '#ffffff', parent: rider, order: 8});
            // Fine dust sifts down from it, and the head catches its light.
            fx.sys({
                tex: 'dot',
                life: [0.8, 1.3],
                speed: [0.2, 0.4],
                size: [0.025, 0.04],
                rate: 14,
                color: GOLD[6],
                shape: new ConeEmitter({radius: 0.33, angle: 0.05, thickness: 0.2}),
                rotate: [Math.PI / 2, 0, 0],
                parent: halo,
                world: true,
                order: 5,
                b: [tint(SHINE, fadeOut(0.5, 0.1))],
            });
            held(fx, fx.node('head', [0, 1.62, 0.15]), {size: 0.9, color: GOLD[5], alpha: 0.3, order: 7});
        },
    },
    {
        id: 'holy/heal-aoe',
        name: 'Heal (area)',
        loop: false,
        period: 2.9,
        build(fx) {
            const P = 2.9;
            const LAND = 0.4;
            const REACH = 3.4;
            // A seed of green light sinks into the floor.
            const seed = fx.node('seed', [0, 1.6, 0]);
            fx.every((t) => {
                seed.position.y = 1.6 * (1 - between(t, 0.05, LAND) ** 2);
            });
            const s = fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.05,
                size: 0.7,
                rate: 0,
                color: GREEN[6],
                parent: seed,
                order: 7,
            });
            window(s, P, 0.05, LAND, 60);
            fx.sys({
                tex: 'dot',
                world: true,
                loop: false,
                life: 0.3,
                size: 0.12,
                rate: 0,
                color: GREEN[5],
                parent: seed,
                order: 6,
                b: [tint(SPROUT, popOut(0.1))],
            }).emissionOverTime = s.emissionOverTime;
            star(fx, {at: [0, 0.1, 0], size: 1.6, life: 0.3, time: LAND, ramp: SPROUT});
            // A soft ring rolls out; the floor glows where it passes.
            const ring = fx.node('ring', [0, 0.03, 0]);
            fx.every((t) => {
                const k = between(t, LAND, LAND + 1.0);
                ring.scaling.setAll(Math.max(0.01, REACH * (1 - (1 - k) ** 2)));
            });
            fx.sys({
                geo: flatRing(0.965, 1, 64),
                tex: 'white',
                blend: 'add',
                loop: false,
                life: 1.6,
                size: 1,
                burst: [[LAND, 1]],
                color: GREEN[5],
                parent: ring,
                order: 4,
                look: {renderFace: 'both', scalingMode: 'hierarchy'},
                b: [tint(SPROUT, fadeOut(0.6, 0.02))],
            });
            fx.sys({
                geo: flatRing(0.001, 1, 48),
                tex: 'glow',
                blend: 'add',
                loop: false,
                life: 1.8,
                size: 1,
                burst: [[LAND, 1]],
                color: GREEN[3],
                alpha: 0.35,
                parent: ring,
                order: 1,
                look: {renderFace: 'both', scalingMode: 'hierarchy'},
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.05))],
            });
            // Plus signs sprout and float up.
            const plus = fx.sys({
                tex: 'plus',
                loop: false,
                life: [0.8, 1.3],
                speed: [0.6, 1.1],
                size: [0.15, 0.3],
                rate: 0,
                color: [GREEN[5], GREEN[6]],
                shape: new ConeEmitter({radius: REACH, angle: 0.05, thickness: 1}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 0.1, 0],
                order: 6,
                b: [tint(SPROUT, fadeOut(0.5, 0.15)), wobble(1, 0.2)],
            });
            window(plus, P, LAND + 0.2, LAND + 1.4, 30);
            light(fx, {at: [0, 0.05, 0], size: 7, color: GREEN[4], floor: true, life: 1.8, alpha: 0.35, time: LAND});
        },
    },
    {
        id: 'holy/heal',
        name: 'Heal',
        loop: false,
        period: 2.2,
        build(fx) {
            const P = 2.2;
            const RISE0 = 0.35;
            const RISE1 = 1.0;
            // The body, drained, its colour restored as the hoop passes.
            hero(fx, {
                period: P,
                colors: [
                    ['#5a5464', 0],
                    ['#5a5464', RISE0 / P],
                    ['#ffffff', RISE1 / P],
                    ['#ffffff', 1],
                ],
            });
            // Petals of light bloom under the feet.
            fx.sys({
                tex: 'burst',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: 1.3,
                size: 1.8,
                burst: [[0.05, 1]],
                color: WARM[5],
                at: [0, 0.03, 0],
                order: 3,
                b: [tint(SHINE, fadeOut(0.6, 0.1)), grow([0, 0.2], [0.3, 1], [1, 1.1]), spin(0.8)],
            });
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.6, 1],
                speed: [0.4, 0.9],
                size: [0.3, 0.5],
                burst: [[0.1, 8]],
                rot: true,
                color: [WARM[5], WARM[6]],
                shape: new ConeEmitter({radius: 0.5, angle: 0.05, thickness: 0.5}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 0.05, 0],
                order: 5,
                b: [tint(SHINE, fadeOut(0.5, 0.1))],
            });
            // A hoop of light rises up the body, leaving sparkles.
            const hoop = fx.node('hoop', [0, 0, 0]);
            fx.every((t) => {
                hoop.position.y = 0.1 + 1.85 * between(t, RISE0, RISE1);
            });
            const ring = fx.sys({
                geo: flatRing(0.5, 0.58, 48),
                tex: 'white',
                blend: 'add',
                loop: false,
                life: 0.05,
                size: 1,
                rate: 0,
                color: WARM[6],
                parent: hoop,
                order: 7,
                look: {renderFace: 'both'},
            });
            window(ring, P, RISE0, RISE1 + 0.08, 60);
            const glints = fx.sys({
                tex: 'glint',
                world: true,
                loop: false,
                life: [0.4, 0.8],
                size: [0.1, 0.2],
                rate: 0,
                color: ['#ffffff', WARM[6]],
                shape: new CircleEmitter({radius: 0.54, thickness: 0}),
                rotate: FLAT,
                parent: hoop,
                order: 7,
                b: [tint(SHINE, popOut(0.3))],
            });
            window(glints, P, RISE0, RISE1, 50);
            // Motes spiral up and pop into tiny hearts.
            const motes = fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.6, 0.9],
                speed: [1.2, 1.8],
                size: [0.05, 0.08],
                rate: 0,
                color: WARM[6],
                shape: new ConeEmitter({radius: 0.5, angle: 0.05, thickness: 0.3}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 1, 0],
                order: 6,
                b: [tint(SHINE, fadeOut(0.8, 0.1)), orbit(4, [0, 0, 1])],
            });
            window(motes, P, RISE1 - 0.1, RISE1 + 0.4, 16);
            const hearts = fx.sys({
                tex: 'heart',
                loop: false,
                life: [0.5, 0.8],
                speed: [0.3, 0.6],
                size: [0.18, 0.28],
                rate: 0,
                color: ['#ffffff', WARM[5]],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                at: [0, 2.2, 0],
                order: 8,
                b: [tint(SHINE, fadeOut(0.6, 0.05)), grow([0, 0.3], [0.2, 1.2], [0.35, 1], [1, 1])],
            });
            window(hearts, P, RISE1 + 0.25, RISE1 + 0.7, 12);
            light(fx, {at: [0, 0.05, 0], size: 3, color: WARM[4], floor: true, life: 1.5, alpha: 0.45, time: 0.05});
        },
    },
    {
        id: 'holy/holy-pillar',
        name: 'Holy pillar',
        loop: false,
        period: 3.6,
        view: {height: 2.4, distance: 13},
        build(fx) {
            const P = 3.6;
            const OPEN = 0.35;
            const FAN = 0.7;
            const FOLD = 2.3;
            const sun: At = [0, 5, -0.3];
            // A sun opens at the top.
            const sunNode = fx.node('sun', sun);
            fx.every((t) => {
                const k = t < FOLD + 0.4 ? between(t, 0.1, OPEN) : 1 - between(t, FOLD + 0.4, FOLD + 0.8);
                sunNode.scaling.setAll(Math.max(0.01, k));
            });
            fx.sys({
                tex: 'glow',
                loop: false,
                life: P - 0.2,
                size: 2.6,
                burst: [[0.1, 1]],
                color: GOLD[5],
                parent: sunNode,
                order: 4,
                look: {scalingMode: 'hierarchy'},
            });
            fx.sys({
                tex: 'burst',
                loop: false,
                life: P - 0.2,
                size: 1.6,
                burst: [[0.1, 1]],
                color: '#ffffff',
                parent: sunNode,
                order: 5,
                look: {scalingMode: 'hierarchy'},
                b: [spin(0.6)],
            });
            // A fan of shafts converges on the mark, pulsing; then the fan folds shut.
            const mark = fx.node('mark', [0, 0.05, 0]);
            const SHAFTS = 7;
            for (let i = 0; i < SHAFTS; i++) {
                const a = ((i - (SHAFTS - 1) / 2) / (SHAFTS - 1)) * 2.4;
                const from = fx.node('from', sun);
                fx.every((t) => {
                    const open = between(t, OPEN, FAN) * (1 - between(t, FOLD, FOLD + 0.35));
                    from.position.set(
                        sun[0] + Math.sin(a) * 2.6 * open,
                        sun[1] - (1 - Math.cos(a)) * 1.2 * open,
                        sun[2] + Math.cos(a * 1.7) * 0.6 * open
                    );
                });
                const shaft = fx.sys({
                    parent: from,
                    beam: mark,
                    tex: 'white',
                    life: 0.05,
                    size: 0.12,
                    rate: 0,
                    color: GOLD[5],
                    alpha: 0.35,
                    order: 6,
                });
                window(shaft, P, OPEN, FOLD + 0.35, 60);
                const haze = fx.sys({
                    parent: from,
                    beam: mark,
                    tex: 'white',
                    life: [0.3, 0.5],
                    size: [0.35, 0.5],
                    rate: 0,
                    color: GOLD[4],
                    alpha: 0.12,
                    order: 5,
                    b: [tint([['#ffffff', 0]], flicker())],
                });
                window(haze, P, OPEN, FOLD + 0.35, 8);
            }
            // A sigil burns on the floor.
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: FOLD + 0.8 - FAN,
                size: 2.4,
                burst: [[FAN, 1]],
                color: GOLD[5],
                at: [0, 0.03, 0],
                order: 3,
                b: [tint(SHINE, fadeOut(0.8, 0.1)), spin(0.5)],
            });
            star(fx, {at: [0, 0.2, 0], size: 2, life: 0.3, time: FAN, tex: 'glow', ramp: SHINE});
            const motes = fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.6, 1.1],
                speed: [0.6, 1.5],
                size: [0.1, 0.22],
                rate: 0,
                color: [GOLD[6], '#ffffff'],
                shape: new ConeEmitter({radius: 0.9, angle: 0.05, thickness: 1}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 0.1, 0],
                order: 7,
                b: [tint(SHINE, fadeOut(0.5, 0.1))],
            });
            window(motes, P, FAN, FOLD + 0.3, 14);
            decal(fx, {
                at: [0, 0.012, 0],
                size: 1.6,
                color: GOLD[2],
                blend: 'add',
                alpha: 0.5,
                life: 1.2,
                delay: FOLD + 0.4,
            });
            light(fx, {at: [0, 0.05, 0], size: 5, color: GOLD[4], floor: true, life: FOLD, alpha: 0.5, time: FAN});
        },
    },
    {
        id: 'holy/resurrection',
        name: 'Resurrection',
        loop: false,
        period: 4.8,
        view: {height: 1.8, distance: 12},
        build(fx) {
            const P = 4.8;
            const POUR = 0.25;
            const LIFE0 = 0.8;
            const STAND = 1.5;
            const WINGS = 1.75;
            const BEAT = 2.8;
            const SCATTER = 3.4;
            // The fallen lies on the floor until life climbs back up it and it rises.
            const body = fx.node('body', [0, 0, 0]);
            fx.every((t) => {
                const k = between(t, LIFE0 + 0.4, STAND);
                const e = k * k * (3 - 2 * k);
                body.rotation.z = (1 - e) * (Math.PI / 2);
                body.position.set((1 - e) * 0.9, (1 - e) * 0.38, 0);
            });
            hero(fx, {
                period: P,
                parent: body,
                colors: [
                    ['#5a5464', 0],
                    ['#5a5464', LIFE0 / P],
                    ['#ffffff', STAND / P],
                    ['#ffffff', 1],
                ],
            });
            hero(fx, {
                period: P,
                parent: body,
                time: LIFE0,
                life: 1.4,
                blend: 'add',
                lighting: 'unlit',
                color: GOLD[5],
                from: 'feet',
                cut: [
                    [0, 0],
                    [1, 0.5],
                    [0, 1],
                ],
                edge: [2, 1.6, 0.8],
                edgeWidth: 0.1,
                order: 4,
            });
            // Light pours down on it.
            lightCone(fx, {top: 5.5, r0: 0.3, r1: 1.2, color: GOLD[5], life: SCATTER - POUR + 0.4, time: POUR});
            // Wings of light unfold, one great wingbeat, then they scatter into feathers.
            for (const side of [-1, 1]) {
                const wing = fx.node('wing', [side * 0.2, 1.35, -0.15]);
                fx.every((t) => {
                    const open = between(t, WINGS, WINGS + 0.45);
                    const beat = Math.sin(Math.PI * between(t, BEAT, BEAT + 0.5)) * 0.6;
                    wing.scaling.setAll(Math.max(0.01, open));
                    wing.rotation.z = side * (-0.3 + beat * 0.6);
                    wing.rotation.y = side * beat * 0.4;
                });
                for (let i = 0; i < 7; i++) {
                    const a = 0.15 + i * 0.2;
                    const len = 2.4 - i * 0.18;
                    fx.sys({
                        tex: 'streak',
                        loop: false,
                        life: SCATTER - WINGS,
                        size: len,
                        burst: [[WINGS, 1]],
                        rot: side > 0 ? a : Math.PI - a,
                        color: i < 2 ? '#ffffff' : GOLD[5],
                        alpha: 1,
                        at: [side * Math.cos(a) * len * 0.45, Math.sin(a) * len * 0.45, 0],
                        parent: wing,
                        order: 5,
                        look: {scalingMode: 'hierarchy'},
                        b: [
                            tint(SHINE, [
                                [1, 0],
                                [1, 0.9],
                                [0, 1],
                            ]),
                        ],
                    });
                }
                fx.sys({
                    tex: 'streak',
                    blend: 'add',
                    world: true,
                    loop: false,
                    life: [1, 1.5],
                    speed: [0.6, 1.6],
                    size: [0.2, 0.35],
                    rot: true,
                    burst: [[SCATTER, 14]],
                    color: [GOLD[5], '#ffffff'],
                    shape: new SphereEmitter({radius: 0.8, thickness: 1}),
                    at: [side * 0.8, 0.5, 0],
                    parent: wing,
                    order: 6,
                    b: [tint(SHINE, fadeOut(0.5, 0.02)), airDrag(2), gravity(0.6), wobble(1.2, 0.6), spin([-2, 2])],
                });
            }
            // A halo forms over the head.
            const halo = fx.node('halo', [0, 2.05, 0]);
            fx.sys({
                geo: flatRing(0.28, 0.34, 48),
                tex: 'white',
                blend: 'add',
                loop: false,
                life: P - WINGS - 0.2,
                size: 1,
                burst: [[WINGS + 0.2, 1]],
                color: GOLD[5],
                parent: halo,
                order: 6,
                look: {renderFace: 'both'},
                b: [tint(SHINE, fadeOut(0.85, 0.1)), grow([0, 0.2], [0.15, 1])],
            });
            star(fx, {at: [0, 1.2, 0.2], size: 2.4, life: 0.35, time: STAND, tex: 'glow', ramp: SHINE});
            light(fx, {at: [0, 0.05, 0], size: 4, color: GOLD[4], floor: true, life: SCATTER, alpha: 0.5, time: POUR});
        },
    },
    {
        id: 'holy/smite',
        name: 'Smite',
        loop: false,
        period: 2.8,
        view: {height: 2},
        build(fx) {
            const DROP = 0.55;
            const HIT = 0.62;
            // A glint marks the spot.
            star(fx, {at: [0, 0.15, 0], size: 0.7, life: 0.4, time: 0.05, ramp: SHINE});
            // A bolt of light drops like a hammer.
            const sky = fx.node('sky', [0, 7, 0]);
            const tip = fx.node('tip', [0, 7, 0]);
            fx.every((t) => {
                tip.position.y = 7 - 7 * between(t, DROP, HIT);
            });
            const bolt = fx.sys({
                parent: sky,
                beam: tip,
                tex: 'white',
                life: 0.05,
                size: 0.22,
                rate: 0,
                color: GOLD[6],
                order: 7,
            });
            window(bolt, 2.8, DROP, HIT + 0.25, 60);
            const core = fx.sys({
                parent: sky,
                beam: tip,
                tex: 'white',
                life: 0.05,
                size: 0.1,
                rate: 0,
                color: '#ffffff',
                order: 8,
            });
            window(core, 2.8, DROP, HIT + 0.25, 60);
            // A white flash, a shockwave over the floor.
            star(fx, {at: [0, 0.4, 0], size: 3.4, life: 0.3, time: HIT, tex: 'glow', ramp: SHINE});
            star(fx, {at: [0, 0.3, 0], size: 2, life: 0.22, time: HIT, tex: 'burst', ramp: SHINE});
            shockwave(fx, {at: [0, 0.04, 0], size: 6, life: 0.6, color: GOLD[5], delay: HIT});
            // Stone chips flying, and cracks that glow and cool.
            clods(fx, {
                at: [0, 0.1, 0],
                count: 14,
                color: ['#5a5066', '#7a7086'],
                delay: HIT,
                speed: [2.5, 5],
                shape: new ConeEmitter({radius: 0.3, angle: 0.8}),
                aim: 'up',
            });
            dust(fx, {
                at: [0, 0.1, 0],
                size: [0.4, 0.7],
                life: [0.8, 1.4],
                burst: [[HIT, 10]],
                speed: [1, 2.5],
                color: '#6a6070',
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                rotate: FLAT,
                drag: 3,
            });
            decal(fx, {
                at: [0, 0.012, 0],
                tex: 'crack',
                size: 2.4,
                color: '#0a0806',
                alpha: 0.8,
                life: 2,
                delay: HIT,
                rot: 0.8,
            });
            decal(fx, {
                at: [0, 0.014, 0],
                tex: 'crack',
                size: 2.4,
                color: '#ffffff',
                blend: 'add',
                alpha: 1,
                life: 1.6,
                delay: HIT,
                rot: 0.8,
                colors: [
                    ['#ffffff', 0],
                    [GOLD[5], 0.2],
                    [GOLD[3], 0.6],
                    [GOLD[1], 1],
                ],
                alphas: popOut(0.3),
            });
            light(fx, {at: [0, 0.05, 0], size: 6, color: GOLD[4], floor: true, life: 0.8, alpha: 0.6, time: HIT});
        },
    },
    {
        id: 'holy/sunburst',
        name: 'Sunburst',
        loop: true,
        period: 4,
        view: {height: 1.8},
        build(fx) {
            const sun = fx.node('sun', [0, 1.8, 0]);
            fx.every((t) => {
                sun.scaling.setAll(1 + Math.sin((t / 4) * Math.PI * 4) * 0.06);
            });
            // A white-hot core in a gold corona.
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 3.2,
                burst: [[0, 1]],
                color: GOLD[4],
                alpha: 0.15,
                parent: sun,
                order: 2,
                look: {scalingMode: 'hierarchy'},
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 0.7,
                burst: [[0, 1]],
                color: '#ffffff',
                parent: sun,
                order: 6,
                look: {scalingMode: 'hierarchy'},
            });
            fx.sys({
                tex: 'glow',
                life: 0.8,
                size: [1, 1.3],
                rate: 3,
                color: GOLD[6],
                alpha: 0.3,
                parent: sun,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // Long and short rays turning slowly round it, breathing: thin streaks through the core.
            for (let i = 0; i < 8; i++) {
                const long = i % 2 === 0;
                const ray = fx.sys({
                    tex: 'streak',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    rot: (i / 8) * Math.PI,
                    color: long ? GOLD[6] : GOLD[5],
                    alpha: long ? 0.9 : 0.6,
                    parent: sun,
                    order: 4,
                    look: {scalingMode: 'hierarchy'},
                    b: [spin(0.18)],
                });
                const len = long ? 5.2 : 3.2;
                ray.startSize = new Vector3Function(
                    new ConstantValue(len),
                    new ConstantValue(len * 0.12),
                    new ConstantValue(1)
                );
            }
            // Glints running out along them, winking at the tips.
            fx.sys({
                tex: 'glint',
                life: [0.7, 1.1],
                speed: [1.4, 2.2],
                size: [0.14, 0.26],
                rate: 7,
                color: ['#ffffff', GOLD[6]],
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                parent: sun,
                order: 7,
                b: [
                    tint(SHINE, [
                        [0.4, 0],
                        [1, 0.6],
                        [1, 0.8],
                        [0, 1],
                    ]),
                    grow([0, 0.6], [0.85, 1], [0.92, 1.8], [1, 0.4]),
                ],
            });
            light(fx, {at: [0, 0.05, 0], size: 4, color: GOLD[4], floor: true, life: 4, alpha: 0.4, loop: true});
        },
    },
];
