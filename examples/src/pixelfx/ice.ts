import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CircleEmitter, ConeEmitter, type ParticleSystem, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    type SysOptions,
    airDrag,
    curve,
    drag,
    fadeOut,
    flicker,
    floorBounce,
    gem,
    gravity,
    grow,
    lathe,
    lifeFrames,
    orbit,
    popOut,
    quad,
    spike,
    spin,
    tint,
    wobble,
} from './kit';
import {PALETTE, decal, flash, pool, shockwave, smoke, windBand} from './recipes';
import {type FxBuilder, type FxDef, shapes} from './stage';
import {image} from './textures';

const FROST = '#bfeaff';

/** Glints flashing on and off over a surface: the shine of ice. */
function glints(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        radius?: number;
        rate?: number;
        size?: [number, number];
        delay?: number;
        duration?: number;
        loop?: boolean;
        parent?: FxBuilder['root'];
    }
) {
    return fx.sys({
        tex: 'glint',
        life: [0.3, 0.5],
        size: o.size ?? [0.3, 0.55],
        rot: [-0.2, 0.2],
        rate: o.rate ?? 6,
        shape: new SphereEmitter({radius: o.radius ?? 0.6, thickness: 0.2}),
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: 6,
        b: [tint([['#ffffff', 0]], flicker()), grow([0, 0.3], [0.5, 1], [1, 0.2])],
    });
}

/**
 * Glassy ice blades bursting up out of the floor: see-through spikes leaning every way, white as
 * they form, lit on their facets with a bright rim, then sinking back. `grow` keys shape their life.
 */
function blades(
    fx: FxBuilder,
    o: Omit<SysOptions, 'geo' | 'tex' | 'size' | 'b'> & {size: [number, number]; grow: Array<[number, number]>}
): ParticleSystem[] {
    return (
        [
            [0.06, 0.4],
            [0.22, 0.35],
            [0.42, 0.25],
        ] as Array<[number, number]>
    ).map(([lean, share]) => {
        const scaled = (n: SysOptions['rate']) => (typeof n === 'number' ? n * share : n);
        return fx.sys({
            ...o,
            geo: spike(lean),
            tex: 'white',
            blend: 'alpha',
            upright: true,
            rate: scaled(o.rate),
            rateOverDistance: scaled(o.rateOverDistance),
            burst: Array.isArray(o.burst)
                ? o.burst.map(([t, n]) => [t, Math.max(1, Math.round((n as number) * share))] as [number, number])
                : o.burst,
            size: o.size,
            alpha: o.alpha ?? 0.85,
            order: o.order ?? 3,
            look: {
                lighting: 'fixed',
                rim: {color: [0.86, 0.98, 1], power: 2, strength: 0.9, mode: 'add'},
                ...o.look,
            },
            b: [
                tint(
                    [
                        ['#ffffff', 0],
                        ['#dcfbff', 0.06],
                        ['#62c8f4', 0.4],
                        ['#3a8bd8', 1],
                    ],
                    fadeOut(0.85, 0.01)
                ),
                grow(...o.grow),
            ],
        });
    });
}

/**
 * Chunks and splinters of clear ice flung out: see-through crystals that tumble, glint at their rims,
 * hop off the floor and skid to a stop, then melt. World space, so they bounce where they land.
 */
function iceChunks(fx: FxBuilder, o: Omit<SysOptions, 'geo' | 'tex' | 'b' | 'life'> & {life?: SysOptions['life']}) {
    for (const [geo, share, scale] of [
        [gem(), 0.45, 1],
        [spike(0.1, 3), 0.55, 1.6],
    ] as const) {
        const count = typeof o.burst === 'number' ? o.burst : 0;
        const size = o.size as [number, number];
        fx.sys({
            ...o,
            geo,
            tex: 'white',
            blend: 'alpha',
            tumble: o.tumble ?? 9,
            life: o.life ?? [1.4, 2],
            size: [size[0] * scale, size[1] * scale],
            burst: [[0, Math.max(1, Math.round(count * share))]],
            loop: false,
            world: true,
            alpha: 0.9,
            order: o.order ?? 3,
            look: {lighting: 'fixed', rim: {color: [0.86, 0.98, 1], power: 2, strength: 1, mode: 'add'}},
            b: [
                tint(
                    [
                        ['#ffffff', 0],
                        ['#a6ecff', 0.1],
                        ['#62c8f4', 1],
                    ],
                    fadeOut(0.8, 0.01)
                ),
                gravity(12),
                floorBounce(0.35),
                grow([0, 1], [0.85, 1], [1, 0]),
            ],
        });
    }
}

/** Snowflakes spun out, drifting down as they slow. */
function flakes(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        burst?: [number, number][];
        rate?: number;
        speed?: [number, number];
        size?: [number, number];
        delay?: number;
        duration?: number;
        loop?: boolean;
        shape?: SphereEmitter | ConeEmitter | CircleEmitter;
        aim?: 'up' | 'down';
        fall?: number;
        life?: [number, number];
    }
) {
    return fx.sys({
        tex: 'flake',
        life: o.life ?? [1.6, 2.4],
        speed: o.speed ?? [2, 4],
        size: o.size ?? [0.2, 0.35],
        rot: true,
        burst: o.burst,
        rate: o.burst ? undefined : o.rate,
        shape: o.shape ?? new SphereEmitter({radius: 0.2}),
        aim: o.aim,
        at: o.at,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: 4,
        b: [
            tint(PALETTE.ice.slice(0, 3), fadeOut(0.6, 0.05)),
            spin([-3, 3]),
            drag([0, 1], [0.3, 0.15], [1, 0.05]),
            gravity(o.fall ?? 0.8),
            wobble(1, 0.4),
        ],
    });
}

/** pixelfx's ice category, rebuilt as 3D particle effects. */
export const ice: FxDef[] = [
    {
        id: 'ice/blizzard-vortex',
        name: 'Blizzard vortex',
        loop: true,
        period: 2,
        view: {height: 1.9, distance: 12},
        build(fx) {
            // blizzard-vortex.js in 3D: a leaning funnel of snow-filled air (80 px high, 4 px at the foot to
            // 32 px at the mouth), wind streaks and flakes orbiting it in front and behind, snow boiling at
            // its foot, cold light in its throat, snow thrown off the mouth, a swept drift on the floor.
            const HT = 3.2;
            const radius = (h: number) => (4 + 28 * Math.pow(Math.min(1, h / HT), 1.35)) * 0.04;
            const profile: Array<[number, number]> = [];
            for (let i = 0; i <= 24; i++) {
                const h = (i / 24) * 1.1 * HT;
                profile.push([radius(h) * (1 + Math.max(0, h / HT - 0.84) * 0.8), h]);
            }
            const funnel = fx.node('funnel');
            fx.every((t) => {
                // One full sway a loop, leaning a little.
                const a = (t / 2) * Math.PI * 2;
                funnel.rotation.z = -0.03 + 0.06 * Math.sin(a) + 0.02 * Math.sin(a * 2);
                funnel.rotation.x = 0.03 * Math.cos(a);
            });
            const body = {
                image: 'blizzard-band',
                geo: lathe(profile, 48),
                blend: 'alpha',
                life: 1e4,
                size: 1,
                burst: 1,
                loop: false,
                parent: funnel,
            } as const;
            const surface = {
                mapUV: {scroll: [1, 0] as [number, number]},
                uvDistortion: {
                    map: image(fx.scene, 'noise').texture,
                    strength: 0.02,
                    mapUV: {tiling: [3, 2] as [number, number], scroll: [0.5, -1] as [number, number]},
                },
            };
            // Snow-filled air, faint: the wind bands carry the shape.
            fx.sys({...body, color: '#8fb8dc', alpha: 0.3, order: 2, look: {...surface, renderFace: 'back'}});
            fx.sys({
                ...body,
                alpha: 0.4,
                order: 5,
                look: {
                    ...surface,
                    renderFace: 'front',
                    rim: {color: [0.86, 0.98, 1], power: 2.5, strength: 0.7, mode: 'add'},
                },
            });
            // Wind bands spinning up it, faster low down where it is narrow.
            for (let i = 0; i < 10; i++) {
                const u = (i + 0.5) / 10;
                windBand(fx, {
                    radius: radius(u * HT) * 1.06,
                    turns: 1.6 * (1.45 - u),
                    width: 0.06,
                    rate: 7,
                    life: [0.5, 0.9],
                    colors: i % 3 === 0 ? ['#62c8f4', '#dcfbff'] : ['#a6ecff', '#ffffff'],
                    at: [0, u * HT, 0],
                    parent: funnel,
                });
            }
            // Cold light in its throat.
            for (const [h, size, color, alpha] of [
                [0.45, 3.2, '#3a8bd8', 0.35],
                [0.15, 1.5, '#62c8f4', 0.45],
                [0.03, 0.8, '#ffffff', 0.35],
            ] as Array<[number, number, string, number]>) {
                fx.sys({
                    tex: 'glow',
                    life: 0.5,
                    size,
                    rate: 6,
                    color,
                    alpha,
                    parent: funnel,
                    at: [0, h * HT + 0.1, 0],
                    order: 1,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [0.7, 0],
                                [1, 0.5],
                                [0.7, 1],
                            ]
                        ),
                    ],
                });
            }
            // Wind streaks: arcs of snowy air whirling round the funnel and climbing it, a white head and
            // a fading tail; trails orbiting the axis, so the far half passes behind the body.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.Trail,
                trail: 14,
                life: [0.5, 0.9],
                speed: [2, 3.6],
                size: [0.05, 0.08],
                rate: 58,
                shape: new ConeEmitter({radius: 0.2, angle: 0.36, thickness: 0.1}),
                aim: 'up',
                parent: funnel,
                world: true,
                order: 4,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#dcfbff', 0.4],
                            ['#a6ecff', 1],
                        ],
                        fadeOut(0.7, 0.1)
                    ),
                    orbit(9, [0, 0, 1]),
                ],
            });
            // Snow and ice carried round: flakes rising on a spiral, faster low down, flung out at the top.
            fx.sys({
                tex: 'flake',
                life: [0.9, 1.6],
                speed: [1.2, 2.6],
                size: [0.07, 0.14],
                rot: true,
                rate: 76,
                shape: new ConeEmitter({radius: 0.24, angle: 0.4, thickness: 0.4}),
                aim: 'up',
                parent: funnel,
                world: true,
                order: 4,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#dcfbff', 0.6],
                            ['#62c8f4', 1],
                        ],
                        fadeOut(0.8, 0.1)
                    ),
                    orbit(8, [0, 0, 1]),
                    spin([-4, 4]),
                ],
            });
            // One in five a bigger glinting crystal.
            fx.sys({
                tex: 'glint',
                life: [0.9, 1.6],
                speed: [1.2, 2.6],
                size: [0.18, 0.28],
                rate: 15,
                shape: new ConeEmitter({radius: 0.24, angle: 0.4, thickness: 0.4}),
                aim: 'up',
                parent: funnel,
                world: true,
                color: '#dcfbff',
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), orbit(8, [0, 0, 1])],
            });
            // Snow boiling at its foot: soft puffs spinning round the base, swelling and fading.
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.36, thickness: 0.3}),
                rate: 12,
                speed: [0.3, 0.6],
                color: '#dcfbff',
                alpha: 0.5,
                size: [0.35, 0.6],
                life: [0.8, 1.2],
                grows: 3,
            });
            // Snow thrown off the mouth, spreading into a thin cloud.
            smoke(fx, {
                at: [0, HT + 0.1, 0],
                parent: funnel,
                shape: new CircleEmitter({radius: 1.1, thickness: 0.3}),
                rate: 10,
                speed: [0.2, 0.5],
                color: '#dcfbff',
                alpha: 0.25,
                size: [0.6, 1],
                life: [0.9, 1.3],
            });
            // A drift on the floor, swept round.
            decal(fx, {size: 2.6, color: '#dcfbff', alpha: 0.45, life: 1e4});
            pool(fx, {color: '#3a8bd8', size: 3.6, alpha: 0.25});
        },
    },
    {
        id: 'ice/freeze',
        name: 'Freeze',
        loop: false,
        period: 4.4,
        build(fx) {
            // freeze.js in 3D: frost lines race in along the floor (0.16 s) and climb the character
            // (0.14-0.62 s); a faceted crystal sets round it from the floor up (0.6 s), light slides over
            // its facets (1.12-1.82 s), it cracks (2.2, 2.34 s), flashes white (2.46 s) and bursts (2.52 s)
            // into tumbling shards and ice dust; the character thaws (0.36 s), the floor frost melts by 3.7 s.
            const SEAL = 0.6;
            const CRACK = [2.2, 2.34];
            const BURST = 2.52;
            const body = fx.character([0, 0, 0], 1.8, '#2b2e3c');
            const bodyMat = (body.material as StandardMaterial).clone('frozen-body');
            body.material = bodyMat;
            const block = fx.node('block');
            fx.every((t) => {
                const frost =
                    t < 0.14 ? 0 : t < 0.62 ? (t - 0.14) / 0.48 : t < BURST ? 1 : Math.max(0, 1 - (t - BURST) / 0.36);
                bodyMat.emissiveColor.set(0.3 * frost, 0.62 * frost, 0.85 * frost);
                // It jolts as each crack runs.
                const j = CRACK.some((c) => t > c && t < c + 0.08) ? 0.03 * Math.sin(t * 120) : 0;
                block.position.x = j;
            });
            // The crystal: seven facets over straight sides, a crown narrowing to a point.
            const crystal = {
                geo: lathe(
                    [
                        [0.66, 0],
                        [0.72, 1.45],
                        [0.52, 1.9],
                        [0.2, 2.25],
                        [0, 2.4],
                    ],
                    7
                ),
                tex: 'white',
                life: BURST - SEAL,
                size: 1,
                burst: 1,
                delay: SEAL,
                loop: false,
                parent: block,
            } as const;
            fx.sys({
                ...crystal,
                blend: 'alpha',
                color: '#2c58aa',
                alpha: 0.35,
                order: 1,
                look: {renderFace: 'back'},
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.12],
                            [1, 1],
                        ]
                    ),
                ],
            });
            // The near facets, set pane by pane from the floor up: an erosion cut climbing the mask with a
            // white edge where the ice is forming; brighter where the faces turn from the camera.
            fx.sys({
                ...crystal,
                blend: 'alpha',
                color: '#62c8f4',
                alpha: 0.3,
                order: 4,
                look: {
                    renderFace: 'front',
                    rim: {color: [0.86, 0.98, 1], power: 2.5, strength: 0.55, mode: 'add'},
                    erosion: {
                        mask: image(fx.scene, 'gradient').texture,
                        softness: 0.02,
                        edgeWidth: 0.08,
                        edgeColor: [2, 2.4, 2.6],
                    },
                },
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.25],
                            [1, 1],
                        ]
                    ),
                ],
            });
            // Light sliding up the facets while it holds: an additive layer whose only light is its edge band.
            fx.sys({
                ...crystal,
                life: 0.7,
                delay: 1.12,
                blend: 'add',
                color: '#000000',
                order: 5,
                look: {
                    renderFace: 'front',
                    erosion: {
                        mask: image(fx.scene, 'gradient').texture,
                        softness: 0.03,
                        edgeWidth: 0.12,
                        edgeColor: [0.9, 1.3, 1.5],
                    },
                },
                b: [
                    tint(
                        [['#000000', 0]],
                        [
                            [0.02, 0],
                            [0.84, 1],
                        ]
                    ),
                ],
            });
            glints(fx, {at: [0, 1.2, 0], radius: 0.75, rate: 9, delay: 1.1, duration: 1.4, loop: false});
            // Frost racing in along the floor to the feet, then the crust it leaves, melting from 2.95 s.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: 0.16,
                speed: -9,
                size: [0.04, 0.06],
                burst: [[0, 40]],
                loop: false,
                shape: new CircleEmitter({radius: 1.5, thickness: 0.05}),
                aim: 'up',
                at: [0, 0.03, 0],
                color: '#dcfbff',
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.05))],
            });
            decal(fx, {
                tex: 'glow',
                blend: 'add',
                size: 3,
                color: FROST,
                life: 3.6,
                delay: 0.12,
                alphas: [
                    [0, 0],
                    [0.6, 0.04],
                    [0.6, 0.78],
                    [0, 1],
                ],
            });
            decal(fx, {
                tex: 'crack',
                blend: 'add',
                size: 2.2,
                color: '#a6ecff',
                life: 3.6,
                delay: 0.12,
                rot: true,
                alphas: [
                    [0, 0],
                    [0.9, 0.04],
                    [0.9, 0.78],
                    [0, 1],
                ],
            });
            // Rime climbing the character.
            fx.sys({
                tex: 'dot',
                life: [0.5, 0.8],
                speed: [1.2, 2.2],
                size: [0.04, 0.07],
                rate: 60,
                duration: 0.62,
                loop: false,
                color: FROST,
                shape: new CircleEmitter({radius: 0.32, thickness: 0.3}),
                aim: 'up',
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5)), drag([0, 1], [1, 0.3])],
            });
            // The cracks: white lines racing over the near face.
            for (const c of CRACK) {
                fx.sys({
                    tex: 'crack',
                    blend: 'add',
                    life: BURST - c,
                    size: 1.4,
                    rot: true,
                    burst: [[0, 1]],
                    delay: c,
                    loop: false,
                    parent: block,
                    at: [0, 1.1, 0.75],
                    color: '#e6f8ff',
                    order: 6,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [0.8, 1],
                            ]
                        ),
                        grow([0, 0.4], [0.1, 1], [1, 1.1]),
                    ],
                });
            }
            flash(fx, {at: [0, 1.2, 0], size: 4, delay: 2.46, life: 0.14, color: '#ffffff'});
            iceChunks(fx, {
                burst: 34,
                delay: BURST,
                at: [0, 1.1, 0],
                shape: new SphereEmitter({radius: 0.7}),
                speed: [2.5, 5.5],
                size: [0.12, 0.34],
                life: [0.8, 1.3],
            });
            fx.sys({
                tex: 'glint',
                life: [0.3, 0.6],
                speed: [1, 3],
                size: [0.2, 0.35],
                burst: [[0, 14]],
                delay: BURST,
                loop: false,
                at: [0, 1.2, 0],
                color: '#dcfbff',
                shape: new SphereEmitter({radius: 0.6}),
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), gravity(3)],
            });
            smoke(fx, {
                at: [0, 0.4, 0],
                burst: [[0, 12]],
                delay: BURST,
                color: '#dcfbff',
                alpha: 0.5,
                loop: false,
                spread: 1.4,
                speed: [0.8, 1.6],
                size: [0.5, 0.8],
            });
            flakes(fx, {at: [0, 1.2, 0], burst: [[0, 16]], delay: BURST, loop: false});
            pool(fx, {color: '#3a8bd8', size: 3, alpha: 0.25});
        },
    },
    {
        id: 'ice/frost-breath',
        name: 'Frost breath',
        loop: true,
        period: 1.2,
        build(fx) {
            // frost-breath.js in 3D: a cone of turbulent cold air streaming right (spread 0.21 rad, 170 px
            // long) from a white-hot mouth; frost puffs billow out, swell and sag, wind streaks race through,
            // ice crystals tumble and glint, snow is carried along.
            fx.character([-2.6, 0, 0], 1.8, '#2a3040');
            const mouth: [number, number, number] = [-2.25, 1.55, 0];
            const L = 6.8;
            const cone = fx.node('cone', mouth);
            cone.rotation.z = -Math.PI / 2;
            const profile: Array<[number, number]> = [];
            for (let i = 0; i <= 16; i++) {
                const x = (i / 16) * L;
                profile.push([0.1 + x * Math.tan(0.21) * 1.08, x]);
            }
            // The gust: the snow-air texture streaming out along the cone, seen through from both sides.
            const gust = {
                image: 'blizzard-band',
                geo: lathe(profile, 32),
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: 1,
                loop: false,
                parent: cone,
                alpha: 0.6,
                look: {
                    // Thinning out along its length: an erosion cut held still, softened over the whole cone.
                    erosion: {mask: image(fx.scene, 'gradient').texture, softness: 0.45},
                    mapUV: {tiling: [1, 0.6] as [number, number], scroll: [0.2, 0] as [number, number]},
                    uvDistortion: {
                        map: image(fx.scene, 'noise').texture,
                        strength: 0.05,
                        mapUV: {tiling: [2, 3] as [number, number], scroll: [0, -2.5] as [number, number]},
                    },
                },
            } as const;
            fx.sys({...gust, color: '#3a6a98', order: 1, look: {...gust.look, renderFace: 'back'}});
            fx.sys({...gust, color: '#6aa8d0', order: 3, look: {...gust.look, renderFace: 'front'}});
            const out = {
                aim: 'right',
                at: mouth,
                world: true,
            } as const;
            // Big slow billows behind, smaller quicker bright ones in front.
            for (const [rate, speed, size, life, color, order, alpha] of [
                [10, [7, 9], [1.4, 2.2], [1, 1.25], '#62c8f4', 2, 0.8],
                [8.5, [7.6, 10.4], [0.9, 1.4], [0.7, 0.95], '#a6ecff', 4, 0.95],
            ] as Array<[number, [number, number], [number, number], [number, number], string, number, number]>) {
                fx.sys({
                    ...out,
                    image: 'smoke-puff',
                    randomTile: false,
                    blend: 'alpha',
                    life,
                    speed,
                    size,
                    rot: true,
                    rate,
                    color,
                    alpha,
                    shape: new ConeEmitter({radius: 0.05, angle: 0.19}),
                    order,
                    b: [lifeFrames(16, 0.8), airDrag(1.5), gravity(0.36), spin([-0.6, 0.6])],
                });
            }
            // Wind streaks: a white head, a pale body, a cool tail.
            fx.sys({
                ...out,
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.04, length: 1},
                life: [0.22, 0.36],
                speed: [11, 15],
                size: [0.05, 0.07],
                rate: 22,
                shape: new ConeEmitter({radius: 0.08, angle: 0.19}),
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#dcfbff', 0.5],
                            ['#62c8f4', 1],
                        ],
                        fadeOut(0.75, 0.05)
                    ),
                    airDrag(0.9),
                ],
            });
            // Snow carried along, swaying.
            fx.sys({
                ...out,
                tex: 'dot',
                life: [0.8, 1.1],
                speed: [4.8, 7.6],
                size: [0.04, 0.06],
                rate: 15,
                color: '#dcfbff',
                shape: new ConeEmitter({radius: 0.08, angle: 0.23}),
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.85, 0.05)), airDrag(1.5), gravity(0.5), wobble(2, 0.4)],
            });
            // Ice crystals tumbling through, glinting as they turn.
            fx.sys({
                ...out,
                mesh: 'shard',
                tumble: 12,
                life: [0.65, 0.9],
                speed: [6, 9.2],
                size: [0.08, 0.12],
                rate: 7.5,
                color: ['#a6ecff', '#ffffff'],
                shape: new ConeEmitter({radius: 0.05, angle: 0.21}),
                order: 5,
                b: [airDrag(1.1), gravity(0.36)],
            });
            fx.sys({
                ...out,
                tex: 'glint',
                life: [0.65, 0.9],
                speed: [6, 9.2],
                size: [0.18, 0.28],
                rate: 5,
                color: '#dcfbff',
                shape: new ConeEmitter({radius: 0.05, angle: 0.21}),
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), airDrag(1.1), gravity(0.36)],
            });
            // The mouth: a white-hot core, a flickering jet of cold.
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: [1.6, 1.9],
                rate: 15,
                color: '#62c8f4',
                at: mouth,
                order: 6,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0.7, 0],
                            [0.85, 0.5],
                            [0.7, 1],
                        ]
                    ),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: [0.45, 0.6],
                rate: 15,
                color: '#ffffff',
                at: mouth,
                order: 7,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                ...out,
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: [0.05, 0.1],
                speed: [5, 8],
                size: [0.06, 0.09],
                rate: 40,
                color: '#ffffff',
                shape: new ConeEmitter({radius: 0.03, angle: 0.08}),
                order: 7,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.05))],
            });
        },
    },
    {
        id: 'ice/frost-nova',
        name: 'Frost nova',
        loop: false,
        period: 5,
        build(fx) {
            fx.character([0, 0, 0], 1.8, '#2a3040');
            // Frost spirals into a spinning snowflake under the caster.
            fx.sys({
                tex: 'flake',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.9,
                size: 2.4,
                burst: 1,
                color: FROST,
                at: [0, 0.04, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.7, 0.3)), grow([0, 0.1], [1, 1]), spin(5)],
            });
            fx.sys({
                tex: 'dot',
                life: 0.6,
                speed: -3,
                size: [0.05, 0.08],
                rate: 60,
                duration: 0.6,
                loop: false,
                color: FROST,
                shape: new CircleEmitter({radius: 2, thickness: 0}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 4,
                b: [orbit(3, [0, 0, 1])],
            });
            // The wave: three rings of ice crystals bursting up round the caster, melting back later.
            shockwave(fx, {size: 8, delay: 0.75, color: '#bfeaff', life: 0.6});
            [1.4, 2.3, 3.2].forEach((radius, i) => {
                blades(fx, {
                    life: 2.2 - i * 0.2,
                    // Knee high at most, as in the original (8 to 20 px), the inner ring tallest.
                    size: [0.45 - i * 0.1, 0.8 - i * 0.17],
                    burst: [[0.8 + i * 0.12, 16 + i * 10]],
                    shape: new CircleEmitter({radius, thickness: 0.25}),
                    aim: 'up',
                    grow: [
                        [0, 0],
                        [0.08, 1.15],
                        [0.15, 1],
                        [0.75, 1],
                        [1, 0],
                    ],
                });
            });
            glints(fx, {at: [0, 0.5, 0], radius: 3, rate: 8, delay: 1, duration: 1.4, loop: false});
            flakes(fx, {
                at: [0, 2.5, 0],
                rate: 12,
                delay: 0.9,
                duration: 1.6,
                loop: false,
                speed: [0.2, 0.6],
                fall: 0.6,
                shape: new SphereEmitter({radius: 2.5}),
            });
            decal(fx, {blend: 'add', size: 7, color: FROST, alpha: 0.45, life: 2.5, delay: 0.8});
        },
    },
    {
        id: 'ice/ice-crystal',
        name: 'Ice crystal',
        loop: true,
        period: 3,
        build(fx) {
            // The crystal turned from pixelfx's own sprite (traced: 31 px tall, a short point below, a
            // long one above, 19 px across), a six-sided prism, half as big again.
            const crystal = fx.node('crystal', [0, 1.7, 0]);
            fx.sys({
                geo: lathe(
                    [
                        [0.001, -0.47],
                        [0.29, -0.1],
                        [0.27, 0.1],
                        [0.001, 0.46],
                    ],
                    6
                ),
                tex: 'white',
                blend: 'alpha',
                loop: false,
                life: 1e4,
                size: 1.5,
                burst: 1,
                color: '#9ad8ff',
                alpha: 0.9,
                parent: crystal,
                order: 3,
                look: {
                    lighting: 'fixed',
                    scalingMode: 'hierarchy',
                    rim: {color: [0.5, 0.85, 1], power: 1.5, strength: 1, mode: 'add'},
                },
            });
            fx.every((t, dt) => {
                crystal.rotation.y += dt * 0.8;
                crystal.position.y = 1.7 + 0.12 * Math.sin((t / 3) * Math.PI * 2);
            });
            glints(fx, {at: [0, 1.7, 0], radius: 0.6, rate: 5});
            fx.sys({
                tex: 'dot',
                life: [2, 3],
                speed: [0.1, 0.3],
                size: [0.04, 0.06],
                rate: 10,
                color: FROST,
                shape: new SphereEmitter({radius: 1.3, thickness: 0.3}),
                at: [0, 1.7, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3)), orbit(1.2)],
            });
            fx.sys({
                tex: 'glow',
                life: 0.8,
                size: [2.2, 2.6],
                rate: 4,
                color: '#6ac7f0',
                alpha: 0.35,
                at: [0, 1.7, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.4))],
            });
            pool(fx, {color: '#6ac7f0', size: 2.8, alpha: 0.3});
        },
    },
    {
        id: 'ice/ice-lance',
        name: 'Ice lance',
        loop: true,
        period: 1.4,
        build(fx) {
            // ice-lance.js in 3D: a faceted ice spear flying right, a light pulse running through its core,
            // rings of cold air shearing off the tip, frost peeling off into a wake, crystals shed behind.
            const lance = fx.node('lance', [-3, 1.4, 0]);
            fx.every((t) => {
                lance.position.x = -3.4 + (t / 1.4) * 6.8;
            });
            const spear: Pick<SysOptions, 'geo' | 'tex' | 'size' | 'parent' | 'at' | 'rotate'> = {
                geo: lathe(
                    [
                        [0, -0.35],
                        [0.13, 0],
                        [0.11, 0.9],
                        [0, 1.45],
                    ],
                    6
                ),
                tex: 'white',
                size: 1.35,
                parent: lance,
                at: [-0.95, 0, 0],
                rotate: [0, 0, -Math.PI / 2],
            };
            fx.sys({
                ...spear,
                blend: 'alpha',
                life: 1.4,
                burst: 1,
                color: '#62c8f4',
                alpha: 0.85,
                order: 4,
                look: {lighting: 'fixed', rim: {color: [0.86, 0.98, 1], power: 1.6, strength: 1.2, mode: 'add'}},
            });
            // The pulse: a band of light running up the spear to the tip, four times a pass.
            fx.sys({
                ...spear,
                blend: 'add',
                life: 0.3,
                burst: [[0, 1, 4, 0.35]],
                color: '#000000',
                order: 5,
                look: {
                    erosion: {
                        mask: image(fx.scene, 'gradient').texture,
                        softness: 0.04,
                        edgeWidth: 0.2,
                        edgeColor: [1, 1.6, 1.9],
                    },
                },
                b: [
                    tint(
                        [['#000000', 0]],
                        [
                            [0.02, 0],
                            [0.98, 1],
                        ]
                    ),
                ],
            });
            // Rings of cold air sheared off the tip, left behind in the world.
            fx.sys({
                tex: 'ring',
                geo: quad(),
                life: 0.35,
                size: 0.7,
                rate: 10,
                world: true,
                color: '#e6f8ff',
                parent: lance,
                at: [0.6, 0, 0],
                rotate: [0, Math.PI / 2, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.6], [1, 1.6])],
            });
            smoke(fx, {
                parent: lance,
                at: [-0.6, 0, 0],
                world: true,
                rate: 30,
                life: [0.5, 0.8],
                speed: [0.1, 0.3],
                size: [0.3, 0.45],
                color: '#e8f6ff',
                alpha: 0.45,
            });
            fx.sys({
                tex: 'glint',
                life: [0.4, 0.7],
                speed: [0.2, 0.6],
                size: [0.15, 0.25],
                rate: 20,
                world: true,
                shape: new SphereEmitter({radius: 0.15}),
                parent: lance,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker()), gravity(3)],
            });
        },
    },
    {
        id: 'ice/ice-shatter',
        name: 'Ice shatter',
        loop: false,
        period: 3.2,
        build(fx) {
            // ice-shatter.js in 3D: a block of ice takes a hit from the left (0.26 s) and jolts, cracks race
            // over its faces (0.26, 0.4 s), it shivers (0.54 s), flashes white (0.62 s) and bursts (0.68 s)
            // into chunks that tumble, bounce and skid off in a roll of ice dust.
            const HIT = 0.26;
            const CRACKS = [0.26, 0.4];
            const FLASH = 0.62;
            const BURST = 0.68;
            const block = fx.prop(shapes.box(fx.scene, 1.4, 1.4, 1.4), {
                at: [0, 0.7, 0],
                color: '#9ad8ff',
                glow: '#2a6a98',
                alpha: 0.8,
            });
            const glow = (block.material as StandardMaterial).emissiveColor.clone();
            fx.every((t) => {
                block.setEnabled(t < BURST || t > 3);
                const jolt = t > HIT && t < HIT + 0.12 ? 0.08 * (1 - (t - HIT) / 0.12) : 0;
                const shiver = t > 0.54 && t < BURST ? 0.03 * Math.sin(t * 140) : 0;
                block.position.x = jolt + shiver;
                // White as it flashes.
                const w = t > FLASH && t < BURST ? 1 : 0;
                (block.material as StandardMaterial).emissiveColor.set(
                    glow.r + w * (1 - glow.r),
                    glow.g + w * (1 - glow.g),
                    glow.b + w * (1 - glow.b)
                );
            });
            // The blow from the left: a streak and a white burst where it lands.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.14,
                speed: 16,
                size: 0.2,
                burst: [[0.12, 1]],
                at: [-3, 0.8, 0],
                aim: 'right',
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            flash(fx, {at: [-0.75, 0.8, 0.2], size: 1.6, delay: HIT, life: 0.14, color: '#ffffff'});
            for (const c of CRACKS) {
                fx.sys({
                    tex: 'crack',
                    blend: 'add',
                    life: BURST - c,
                    size: 1.2,
                    rot: true,
                    burst: [[0, 1]],
                    delay: c,
                    loop: false,
                    at: [-0.1, 0.75, 0.72],
                    color: '#e6f8ff',
                    order: 6,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [1, 1],
                            ]
                        ),
                        grow([0, 0.3], [0.15, 1], [1, 1.1]),
                    ],
                });
            }
            flash(fx, {at: [0, 0.8, 0], size: 3.2, delay: FLASH, life: 0.16, color: '#ffffff'});
            // The chunks: clear blocks and splinters thrown off up and to the right, hopping and skidding.
            iceChunks(fx, {
                burst: 36,
                size: [0.18, 0.4],
                speed: [2.5, 6],
                delay: BURST,
                at: [0, 0.7, 0],
                shape: new ConeEmitter({radius: 0.5, angle: 0.9, thickness: 1}),
                aim: 'up',
                rotate: [0, 0, -0.5],
            });
            glints(fx, {at: [0.3, 0.6, 0], radius: 1.4, rate: 18, delay: BURST, duration: 0.8, loop: false});
            // Ice dust rolling off along the floor.
            smoke(fx, {
                at: [0, 0.3, 0],
                burst: [[0, 14]],
                delay: BURST,
                color: '#dcfbff',
                alpha: 0.45,
                spread: 1.4,
                speed: [1.2, 2.4],
                size: [0.5, 0.9],
                loop: false,
            });
            decal(fx, {blend: 'add', size: 2.6, color: FROST, alpha: 0.5, life: 2.2, delay: BURST});
        },
    },
    {
        id: 'ice/ice-spikes',
        name: 'Ice spikes',
        loop: false,
        period: 3.4,
        build(fx) {
            const runner = fx.node('front', [-3.2, 0, 0]);
            fx.every((t) => {
                runner.position.x = -3.2 + Math.min(1, t / 0.9) * 6.4;
            });
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.6,
                size: [0.6, 0.9],
                rateOverDistance: 6,
                duration: 0.95,
                loop: false,
                world: true,
                color: FROST,
                alpha: 0.6,
                parent: runner,
                at: [0, 0.03, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.05))],
            });
            // Clusters of blades bursting up behind the frost line in a rising wave, then shattering.
            const wave = blades(fx, {
                life: 1.8,
                size: [0.9, 2],
                rateOverDistance: 7,
                duration: 0.95,
                loop: false,
                world: true,
                shape: new CircleEmitter({radius: 0.45, thickness: 1}),
                aim: 'up',
                parent: runner,
                grow: [
                    [0, 0],
                    [0.1, 1.12],
                    [0.18, 1],
                    [0.96, 1],
                    [1, 0.3],
                ],
            });
            // All of them shatter together (pixelfx at 1.67 s): the later-born live shorter.
            for (const system of wave) system.startLife = curve([0, 1.72], [1, 0.9]);
            flash(fx, {at: [0, 0.8, 0], size: 6, delay: 1.66, color: '#e6f8ff', life: 0.18});
            iceChunks(fx, {
                burst: 30,
                delay: 1.72,
                shape: new CircleEmitter({radius: 3.2, thickness: 1}),
                at: [0, 0.6, 0],
                speed: [2, 4],
                size: [0.15, 0.3],
                life: [0.7, 1],
            });
        },
    },
    {
        id: 'ice/icicle-fall',
        name: 'Icicle fall',
        loop: false,
        period: 3.2,
        view: {height: 1.7, distance: 11},
        build(fx) {
            // icicle-fall.js in 3D: an icicle under a frosted ledge drips and trembles, snaps off its root
            // (0.9 s), drops, stabs the floor and bursts into skidding shards, splinters and rolling frost.
            const top = 3.3;
            fx.prop(shapes.box(fx.scene, 2.4, 0.3, 1.2), {at: [0, top + 0.15, 0], color: '#3a3f4f'});
            // Frost on the ledge's lip and a fringe of small icicles left behind.
            fx.prop(shapes.box(fx.scene, 2.46, 0.06, 1.26), {
                at: [0, top + 0.01, 0],
                color: '#dcfbff',
                glow: '#62c8f4',
            });
            for (const [x, z, h] of [
                [-0.9, 0.3, 0.22],
                [-0.55, -0.2, 0.32],
                [0.45, 0.35, 0.26],
                [0.8, -0.1, 0.18],
                [-0.2, 0.45, 0.16],
            ]) {
                fx.prop(shapes.cylinder(fx.scene, h, 0.06, 0, 6), {
                    at: [x, top - h / 2, z],
                    color: '#a6ecff',
                    glow: '#3a8bd8',
                    alpha: 0.9,
                });
            }
            const icicle = fx.node('icicle', [0, top, 0]);
            fx.prop(shapes.cylinder(fx.scene, 1.5, 0.3, 0, 7), {
                parent: icicle,
                at: [0, -0.75, 0],
                color: '#a6ecff',
                glow: '#3a8bd8',
                alpha: 0.9,
            });
            const snap = 0.9;
            const land = snap + Math.sqrt((2 * (top - 1.5 - 0.1)) / 18);
            fx.every((t) => {
                icicle.setEnabled(t < land);
                const shake = t > 0.5 && t < snap ? 0.03 * Math.sin(t * 80) : 0;
                const k = Math.max(0, t - snap);
                icicle.position.set(shake, top - 0.5 * 18 * k * k, 0);
            });
            // Drips off its tip, and frost puffing from the root as it snaps.
            fx.sys({
                tex: 'dot',
                life: 0.5,
                speed: 0,
                size: 0.07,
                burst: [
                    [0.1, 1],
                    [0.45, 1],
                ],
                color: FROST,
                at: [0, top - 1.5, 0],
                order: 4,
                b: [gravity(14)],
            });
            smoke(fx, {
                at: [0, top - 0.05, 0],
                burst: [[0, 6]],
                delay: snap,
                loop: false,
                color: '#dcfbff',
                alpha: 0.5,
                size: [0.3, 0.5],
                speed: [0.2, 0.6],
                spread: 1.4,
                aim: 'down',
            });
            glints(fx, {at: [0, top - 0.6, 0], radius: 0.3, rate: 6, duration: snap, loop: false});
            const impact: [number, number, number] = [0, 0.2, 0];
            flash(fx, {at: impact, size: 2.2, delay: land, color: '#e6f8ff'});
            shockwave(fx, {at: [0, 0.03, 0], size: 3, delay: land, color: '#a6ecff', life: 0.4});
            iceChunks(fx, {
                burst: 30,
                delay: land,
                at: impact,
                speed: [2, 5],
                size: [0.12, 0.3],
                shape: new ConeEmitter({radius: 0.1, angle: 1.3}),
            });
            smoke(fx, {
                at: impact,
                shape: new CircleEmitter({radius: 0.2, thickness: 1}),
                burst: [[0, 10]],
                delay: land,
                speed: [1.5, 2.5],
                color: '#e8f6ff',
                alpha: 0.5,
                size: [0.4, 0.6],
                loop: false,
                aim: 'up',
                spread: 0,
            });
            decal(fx, {tex: 'crack', blend: 'add', size: 1.8, color: FROST, alpha: 0.8, life: 1.3, delay: land});
        },
    },
    {
        id: 'ice/snowflake-burst',
        name: 'Snowflake burst',
        loop: false,
        period: 3.2,
        build(fx) {
            const at: [number, number, number] = [0, 1.6, 0];
            fx.sys({
                tex: 'dot',
                life: 0.45,
                speed: -4,
                size: [0.05, 0.08],
                rate: 70,
                duration: 0.45,
                loop: false,
                color: FROST,
                shape: new SphereEmitter({radius: 1.8, thickness: 0}),
                at,
                order: 3,
            });
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: 1.6,
                burst: 1,
                color: '#bfeaff',
                at,
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.1)), grow([0, 0.2], [1, 1])],
            });
            flash(fx, {at, size: 2.6, delay: 0.5, color: '#ffffff'});
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 3.4,
                burst: [[0.5, 1]],
                color: FROST,
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            flakes(fx, {
                at,
                burst: [[0.5, 26]],
                loop: false,
                speed: [3, 5],
                size: [0.25, 0.45],
                life: [2, 2.6],
                fall: 0.7,
            });
            glints(fx, {at, radius: 2, rate: 10, delay: 0.7, duration: 1.4, loop: false, size: [0.2, 0.35]});
        },
    },
];
