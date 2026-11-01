import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {BoxEmitter, CircleEmitter, ConeEmitter, HemisphereEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    curve,
    fadeOut,
    flicker,
    gravity,
    grow,
    holdFrame,
    lathe,
    lifeFrames,
    orbit,
    popOut,
    spin,
    tint,
    wobble,
} from './kit';
import {PALETTE, arcs, decal, flash, pool, shockwave, smoke, sparks} from './recipes';
import {type FxBuilder, type FxDef, shapes} from './stage';

const BOLT = '#bfe6ff';
const ZAP = PALETTE.electric;

/** A crackling core: a hot glow that flickers. */
function core(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        parent?: FxBuilder['root'];
        size?: number;
        color?: string;
        delay?: number;
        duration?: number;
        loop?: boolean;
    }
) {
    return fx.sys({
        tex: 'glow',
        life: [0.1, 0.2],
        size: [(o.size ?? 1) * 0.8, (o.size ?? 1) * 1.2],
        rate: 30,
        color: o.color ?? '#9ad4ff',
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: 4,
        b: [tint([['#ffffff', 0]], flicker())],
    });
}

function zapSparks(fx: FxBuilder, o: Parameters<typeof sparks>[1]) {
    return sparks(fx, {palette: ZAP, gravity: 6, speed: [4, 8], life: [0.2, 0.45], ...o});
}

/** pixelfx's lightning category, rebuilt as 3D particle effects. */
export const lightning: FxDef[] = [
    {
        id: 'lightning/ball-lightning',
        name: 'Ball lightning',
        loop: true,
        period: 4,
        build(fx) {
            const ball = fx.node('ball', [0, 1.6, 0]);
            const ground = fx.node('ground', [0, 0, 0]);
            fx.every((t) => {
                const a = (t / 4) * Math.PI * 2;
                ball.position.set(Math.sin(a) * 2.2, 1.5 + Math.sin(a * 2) * 0.9, Math.sin(a * 3) * 0.8);
                ground.position.set(ball.position.x, 0, ball.position.z);
            });
            core(fx, {parent: ball, size: 1.2});
            fx.sys({tex: 'glow', life: 0.3, size: 0.5, rate: 20, color: '#ffffff', parent: ball, order: 5});
            // Arcs spat off its skin: bolts from points around the ball back to its centre.
            arcs(fx, {
                to: ball,
                parent: ball,
                shape: new SphereEmitter({radius: 0.9, thickness: 0}),
                rate: 18,
                width: [0.15, 0.25],
            });
            fx.sys({
                tex: 'dot',
                life: [0.6, 1],
                speed: [0.1, 0.3],
                size: [0.05, 0.08],
                rate: 40,
                world: true,
                shape: new SphereEmitter({radius: 0.3}),
                parent: ball,
                order: 3,
                b: [tint(ZAP, fadeOut(0.4, 0.02))],
            });
            // It zaps the floor when it dips low (twice a loop, at its lowest points).
            arcs(fx, {
                to: ball,
                parent: ground,
                burst: [
                    [0.65, 4],
                    [2.65, 4],
                ],
                life: [0.1, 0.25],
                width: [0.25, 0.35],
            });
            for (const time of [0.65, 2.65]) {
                zapSparks(fx, {
                    parent: ground,
                    at: [0, 0.1, 0],
                    count: 12,
                    time,
                    aim: 'up',
                    shape: new ConeEmitter({radius: 0.1, angle: 1}),
                    loop: true,
                });
            }
        },
    },
    {
        id: 'lightning/chain-lightning',
        name: 'Chain lightning',
        loop: false,
        period: 2.2,
        build(fx) {
            fx.character([-3, 0, 0], 1.8, '#2a2d3a');
            const hand = fx.node('hand', [-2.5, 1.3, 0]);
            const targets = [
                [-0.9, 0, 0.5],
                [0.9, 0, -0.6],
                [2.8, 0, 0.3],
            ].map(([x, y, z], i) => {
                fx.character([x, y, z], 1.3, '#35303a');
                return {node: fx.node(`target${i}`, [x, 0.9, z]), floor: fx.node(`floor${i}`, [x, 0, z])};
            });
            const links = [hand, ...targets.map((t) => t.node)];
            for (let i = 0; i < 3; i++) {
                const start = 0.2 + i * 0.22;
                // The arc from the previous link to this target, flickering until the chain snaps.
                arcs(fx, {
                    parent: links[i],
                    to: links[i + 1],
                    delay: start,
                    duration: 1.3 - i * 0.22,
                    loop: false,
                    rate: 30,
                    width: [0.3, 0.45],
                });
                flash(fx, {parent: targets[i].node, size: 1.8, delay: start, color: '#c7f1ff'});
                arcs(fx, {
                    parent: targets[i].floor,
                    to: targets[i].node,
                    delay: start,
                    duration: 0.35,
                    loop: false,
                    rate: 20,
                    width: [0.15, 0.25],
                });
                zapSparks(fx, {parent: targets[i].node, count: 16, delay: start});
            }
            core(fx, {parent: hand, size: 0.8, delay: 0.1, duration: 1.4, loop: false});
        },
    },
    {
        id: 'lightning/charge-up',
        name: 'Charge up',
        loop: false,
        period: 2.7,
        build(fx) {
            fx.character([-0.6, 0, 0], 1.8, '#2a2d3a');
            const hand = fx.node('hand', [0, 1.4, 0]);
            const release = 1.8;
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.14, length: 1},
                life: 0.4,
                speed: -5,
                size: [0.05, 0.08],
                rate: 70,
                duration: release,
                loop: false,
                shape: new SphereEmitter({radius: 2, thickness: 0}),
                parent: hand,
                order: 4,
                b: [tint(ZAP, fadeOut(0.8, 0.3))],
            });
            arcs(fx, {
                parent: hand,
                to: hand,
                shape: new SphereEmitter({radius: 1.4, thickness: 0}),
                rate: 14,
                duration: release,
                loop: false,
                width: [0.15, 0.25],
            });
            // The core swells and pulses faster toward the release.
            fx.sys({
                tex: 'glow',
                life: release,
                size: 1.6,
                burst: 1,
                color: '#9ad4ff',
                parent: hand,
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0.4, 0],
                            [1, 0.4],
                            [0.5, 0.55],
                            [1, 0.7],
                            [0.5, 0.8],
                            [1, 0.88],
                            [0.6, 0.94],
                            [1, 1],
                        ]
                    ),
                    grow([0, 0.2], [1, 1.2]),
                ],
            });
            core(fx, {parent: hand, size: 0.6, duration: release, loop: false});
            // Rings of charge closing in on the core, quicker as it nears the release.
            const rings = fx.sys({
                tex: 'ring',
                life: 0.45,
                size: [1.6, 2],
                rate: 0,
                duration: release,
                loop: false,
                color: '#62a8ff',
                parent: hand,
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.3)), grow([0, 1], [1, 0.25])],
            });
            rings.emissionOverTime = curve([0, 0], [0.3, 2], [0.7, 5], [1, 9]);
            flash(fx, {parent: hand, size: 4, delay: release, color: '#e6f8ff'});
            // The release throws a shell of charge out round the caster, and a ring along the floor.
            fx.sys({
                tex: 'ring',
                life: 0.35,
                size: 3,
                burst: [[0, 1]],
                delay: release,
                loop: false,
                color: '#9ad4ff',
                parent: hand,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.3], [1, 1.4])],
            });
            shockwave(fx, {at: [0, 0.03, 0], size: 6, delay: release, color: '#9ad4ff', life: 0.45});
            arcs(fx, {
                parent: hand,
                to: hand,
                shape: new SphereEmitter({radius: 3, thickness: 0}),
                burst: [[release, 10]],
                life: [0.15, 0.25],
                width: [0.35, 0.5],
            });
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 4.5,
                burst: [[release, 1]],
                color: BOLT,
                parent: hand,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            zapSparks(fx, {parent: hand, count: 40, delay: release, speed: [6, 10]});
        },
    },
    {
        id: 'lightning/electrified',
        name: 'Electrified',
        loop: true,
        period: 2,
        build(fx) {
            const body = fx.character([0, 0, 0], 1.8, '#2c2f40');
            // Its own material, so the jolts light this body only.
            const material = (body.material as StandardMaterial).clone('electrified-body');
            body.material = material;
            const crawl = fx.node('crawl', [0, 1, 0]);
            let jump = 0;
            fx.every((t, dt) => {
                // The arcs' end hops about the body; the body flares on each jolt.
                jump -= dt;
                if (jump <= 0) {
                    jump = 0.08;
                    // Over the near side of the body, where the camera sees it.
                    crawl.position.set((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 1.5, 0.34);
                }
                // A faint electric sheen all the time, the whole body flaring on each jolt.
                const jolt = t % 0.7 < 0.08 ? 1 : 0;
                material.emissiveColor.set(0.08 + 0.35 * jolt, 0.08 + 0.6 * jolt, 0.22 + 0.8 * jolt);
            });
            // Arcs crawling over the body and leaping across it, from its sides and front to the hop point.
            arcs(fx, {
                to: crawl,
                at: [0, 0.95, 0.3],
                shape: new BoxEmitter({width: 0.9, height: 1.7, depth: 0.15}),
                rate: 45,
                width: [0.5, 0.75],
            });
            // On every jolt a few long arcs leap off the body into the air around it.
            arcs(fx, {
                to: crawl,
                at: [0, 1, 0.35],
                shape: new BoxEmitter({width: 1.9, height: 2, depth: 0.3}),
                burst: [
                    [0, 4],
                    [0.7, 4],
                    [1.4, 4],
                ],
                width: [0.6, 0.85],
                life: [0.08, 0.14],
            });
            zapSparks(fx, {at: [0, 0.9, 0], rate: 25, shape: new SphereEmitter({radius: 0.5}), speed: [2, 4]});
            fx.sys({
                tex: 'glow',
                life: 0.1,
                size: [2, 2.4],
                burst: [
                    [0, 1],
                    [0.7, 1],
                    [1.4, 1],
                ],
                color: '#5ab8ff',
                alpha: 0.6,
                at: [0, 1, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            // The feet ground out to the floor.
            const feet = fx.node('feet', [0, 0.15, 0]);
            arcs(fx, {
                to: feet,
                shape: new CircleEmitter({radius: 0.8, thickness: 0}),
                aim: 'up',
                rate: 12,
                width: [0.2, 0.3],
            });
            pool(fx, {color: '#5ab8ff', size: 2.4, alpha: 0.25});
        },
    },
    {
        id: 'lightning/lightning-strike',
        name: 'Lightning strike',
        loop: false,
        period: 3.2,
        view: {height: 2.6, distance: 14},
        build(fx) {
            // lightning-strike.js in 3D: a sigil charges on the floor (0-0.6 s), forked leaders creep down
            // from the sky (0.6-0.95 s), the bolt slams in (1 s) and flickers in its channel to 1.7 s, arcs race
            // out along the cracks, sparks and embers spray, then the channel crumbles to sparks (2-2.6 s).
            const hit = 1;
            const sky = fx.node('sky', [0.4, 9, 0]);
            const floor = fx.node('floor', [0, 0, 0]);
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.1,
                size: 1.8,
                burst: 1,
                color: '#7ac4ff',
                at: [0, 0.03, 0],
                order: 2,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.5],
                            [1, 0.9],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.6], [0.5, 1], [1, 1.1]),
                    spin(1.5),
                ],
            });
            // The leaders: branching arcs stepping down from the cloud before the strike.
            const step = fx.node('leader', [0.2, 5, 0]);
            fx.every((t) => {
                const k = Math.min(1, Math.max(0, (t - 0.6) / 0.38));
                step.position.y = 9 - 7.6 * k;
            });
            arcs(fx, {
                parent: sky,
                to: step,
                shape: new SphereEmitter({radius: 0.8, thickness: 0}),
                rate: 30,
                delay: 0.6,
                duration: 0.38,
                loop: false,
                width: [0.12, 0.2],
                color: '#8a7aff',
            });
            arcs(fx, {
                parent: floor,
                to: sky,
                delay: hit,
                duration: 0.7,
                loop: false,
                rate: 30,
                width: [0.55, 0.9],
                life: [0.05, 0.1],
            });
            // The channel crumbling: sparks hanging along where the bolt was, falling and going out.
            fx.sys({
                tex: 'dot',
                life: [0.3, 0.6],
                speed: [0, 0.2],
                size: [0.05, 0.09],
                rate: 120,
                delay: 1.75,
                duration: 0.6,
                loop: false,
                shape: new BoxEmitter({width: 0.3, height: 8, depth: 0.1}),
                at: [0.2, 4.5, 0],
                world: true,
                order: 4,
                b: [tint(ZAP, flicker()), gravity(1)],
            });
            sparks(fx, {
                at: [0, 0.15, 0],
                count: 30,
                delay: hit,
                speed: [2, 6],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 1.3}),
                palette: PALETTE.ember,
                gravity: 8,
            });
            flash(fx, {at: [0, 1, 0], size: 7, delay: hit, life: 0.3});
            shockwave(fx, {size: 6, delay: hit, color: BOLT, life: 0.4});
            // Arcs racing out along the cracks.
            arcs(fx, {
                parent: floor,
                to: floor,
                shape: new CircleEmitter({radius: 2.6, thickness: 0}),
                aim: 'up',
                burst: [
                    [hit, 6],
                    [hit + 0.12, 5],
                ],
                life: [0.12, 0.2],
                width: [0.2, 0.3],
            });
            decal(fx, {
                tex: 'crack',
                blend: 'add',
                size: 4,
                color: '#7ac4ff',
                alpha: 1,
                life: 1.6,
                delay: hit,
                colors: [
                    ['#ffffff', 0],
                    ['#5ab8ff', 0.3],
                    ['#1a2a6a', 1],
                ],
            });
            decal(fx, {size: 2.6, life: 1.8, delay: hit, alpha: 0.75});
            zapSparks(fx, {
                at: [0, 0.2, 0],
                count: 30,
                delay: hit,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 1.1}),
            });
            smoke(fx, {at: [0, 0.3, 0], burst: [[0, 8]], delay: hit + 0.2, alpha: 0.4, life: [1.2, 1.8], loop: false});
        },
    },
    {
        id: 'lightning/plasma-ball',
        name: 'Plasma ball',
        loop: true,
        period: 3,
        build(fx) {
            // plasma-ball.js in 3D: a glass globe on a dark stand; a white-hot core; eight or so violet
            // tendrils reaching from it to the glass and slowly wandering round, each touching the glass with
            // a bright foot; the glass itself rimmed in magenta and lit faintly from within.
            const center: [number, number, number] = [0, 1.9, 0];
            fx.prop(shapes.cylinder(fx.scene, 0.8, 0.35, 0.6), {at: [0, 0.4, 0], color: '#2e2442'});
            const globe: Array<[number, number]> = [];
            for (let i = 0; i <= 24; i++) {
                const lat = -Math.PI / 2 + (i / 24) * Math.PI;
                globe.push([Math.max(0.001, Math.cos(lat)), Math.sin(lat)]);
            }
            for (const [face, alpha, order] of [
                ['back', 0.35, 1],
                ['front', 0.8, 7],
            ] as Array<['back' | 'front', number, number]>) {
                fx.sys({
                    tex: 'square',
                    geo: lathe(globe, 48),
                    blend: 'add',
                    life: 1e4,
                    size: 1.12,
                    burst: 1,
                    loop: false,
                    color: '#7a3ad0',
                    alpha,
                    at: center,
                    order,
                    look: {renderFace: face, rim: {color: [0.95, 0.6, 1], power: 2.6, strength: 1, mode: 'fade'}},
                });
            }
            const coreNode = fx.node('core', center);
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: 2.6,
                rate: 4,
                color: '#8a4ad8',
                alpha: 0.3,
                parent: coreNode,
                order: 2,
            });
            core(fx, {parent: coreNode, size: 0.9, color: '#f0d0ff'});
            // Tendrils from the core to the glass: bolts from points on the globe to its centre, wandering round.
            const touch = new SphereEmitter({radius: 1.08, thickness: 0});
            fx.sys({
                beam: coreNode,
                life: [0.5, 0.9],
                size: [0.4, 0.55],
                rate: 12,
                color: '#e0b0ff',
                shape: touch,
                parent: coreNode,
                order: 5,
                b: [
                    tint(PALETTE.plasma, [
                        [0, 0],
                        [1, 0.1],
                        [0.8, 0.5],
                        [1, 0.8],
                        [0, 1],
                    ]),
                    orbit([-0.9, 0.9]),
                ],
            });
            // Bright feet on the glass.
            fx.sys({
                tex: 'glow',
                life: [0.4, 0.8],
                size: [0.35, 0.55],
                rate: 14,
                color: '#f4d8ff',
                shape: touch,
                parent: coreNode,
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), orbit([-0.9, 0.9])],
            });
            pool(fx, {color: '#9a5cff', size: 3.4, alpha: 0.4});
        },
    },
    {
        id: 'lightning/spark-arc',
        name: 'Spark arc',
        loop: true,
        period: 2,
        build(fx) {
            for (const side of [-1, 1]) {
                fx.prop(shapes.cylinder(fx.scene, 3.2, 0.05), {
                    at: [side * 0.6, 1.6, 0],
                    rotate: [0, 0, -side * 0.22],
                    color: '#8a6a4a',
                });
            }
            const left = fx.node('left', [-0.25, 0.2, 0]);
            const right = fx.node('right', [0.25, 0.2, 0]);
            fx.every((t) => {
                // The arc climbs the rods and stretches as they spread, then snaps back down.
                const k = t / 2;
                const y = 0.2 + k * 2.9;
                const x = 0.2 + y * 0.22;
                left.position.set(-x, y + Math.sin(t * 40) * 0.03, 0);
                right.position.set(x, y + Math.cos(t * 37) * 0.03, 0);
            });
            arcs(fx, {parent: left, to: right, rate: 40, width: [0.2, 0.3]});
            fx.sys({
                tex: 'glow',
                life: 0.1,
                size: [0.8, 1.1],
                rate: 20,
                color: '#9ad4ff',
                parent: left,
                at: [0, 0, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            zapSparks(fx, {parent: right, rate: 10, speed: [1, 3], shape: new SphereEmitter({radius: 0.05})});
            flash(fx, {at: [0, 0.3, 0], size: 1.2, color: '#c7f1ff', loop: true, life: 0.12});
        },
    },
    {
        id: 'lightning/storm-cloud',
        name: 'Storm cloud',
        loop: true,
        period: 3,
        view: {height: 2.4, distance: 13},
        build(fx) {
            // storm-cloud.js in 3D: a dark cloud boiling overhead, billows lit on top, a flat dark base with
            // ragged scud under it; discharges flicker inside; rain slants down; once a loop a bolt cracks to
            // the floor (1.8 s) with a splash of sparks.
            const base = 4;
            // The cloud's billows: puffs held at their fullest frame, living longer than a loop and
            // rolling slowly, so it boils without ever thinning. Dark beneath, lit on top.
            for (const [y, width, height, count, size, colors, order] of [
                [0.2, 4.2, 0.3, 26, [2.0, 2.8], ['#1a1828', '#24223a'], 1],
                [0.75, 3.4, 0.5, 22, [1.9, 2.6], ['#2e2c48', '#3c3a5c'], 2],
                [1.3, 2.4, 0.4, 14, [1.6, 2.2], ['#4a4a70', '#5c5c86'], 3],
            ] as Array<[number, number, number, number, [number, number], [string, string], number]>) {
                fx.sys({
                    image: 'smoke-puff',
                    randomTile: false,
                    blend: 'alpha',
                    life: 6,
                    speed: [0.02, 0.08],
                    size,
                    rot: true,
                    burst: [[0, count]],
                    rate: count / 6,
                    color: colors,
                    alpha: 1,
                    shape: new BoxEmitter({width, height, depth: 1.2}),
                    at: [0, base + y, 0],
                    order,
                    b: [
                        holdFrame(7),
                        tint(
                            [['#ffffff', 0]],
                            [
                                [0, 0],
                                [1, 0.08],
                                [1, 0.9],
                                [0, 1],
                            ]
                        ),
                        spin([-0.15, 0.15]),
                        wobble(0.3, 0.15),
                    ],
                });
            }
            // Ragged scud trailing under the base.
            smoke(fx, {
                at: [0, base - 0.1, 0],
                shape: new BoxEmitter({width: 4, height: 0.1, depth: 1}),
                rate: 5,
                speed: [0.1, 0.25],
                size: [0.7, 1.1],
                life: [1.6, 2.4],
                color: '#1c1a2c',
                alpha: 0.7,
                aim: 'down',
                spread: 0.4,
                grows: 1.4,
            });
            // Discharges flickering inside the cloud.
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: [0.08, 0.16],
                size: [1.6, 2.4],
                rate: 6,
                color: '#9ab8ff',
                alpha: 0.5,
                shape: new BoxEmitter({width: 3.2, height: 0.6, depth: 0.6}),
                at: [0, base + 0.7, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // Slanted rain.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.09, length: 1},
                life: 0.42,
                speed: 9.5,
                size: 0.03,
                rate: 140,
                color: '#8ab4e8',
                alpha: 0.7,
                shape: new BoxEmitter({width: 4, height: 0.1, depth: 1.4}),
                aim: 'down',
                rotate: [0, 0, 0.18],
                at: [0, base - 0.1, 0],
                order: 3,
            });
            // Splashes where the rain lands.
            fx.sys({
                tex: 'dot',
                life: [0.1, 0.2],
                speed: [0.6, 1.2],
                size: [0.03, 0.05],
                rate: 60,
                color: '#8ab4e8',
                shape: new BoxEmitter({width: 4.4, height: 0, depth: 1.4}),
                aim: 'up',
                rotate: [0, 0, 0.0],
                at: [0.6, 0.02, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.05)), gravity(6)],
            });
            const cloud = fx.node('cloud', [0.6, base, 0]);
            const strike = fx.node('strike', [0.9, 0, 0]);
            arcs(fx, {parent: strike, to: cloud, burst: [[1.8, 1, 6, 0.045]], width: [0.45, 0.6], life: [0.05, 0.1]});
            flash(fx, {at: [0.8, 2, 0], size: 6, time: 1.8, loop: true, life: 0.25});
            zapSparks(fx, {
                parent: strike,
                at: [0, 0.1, 0],
                count: 14,
                time: 1.8,
                loop: true,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1}),
            });
        },
    },
    {
        id: 'lightning/tesla-coil',
        name: 'Tesla coil',
        loop: true,
        period: 2.4,
        build(fx) {
            fx.prop(shapes.cylinder(fx.scene, 2, 0.32), {at: [0, 1, 0], color: '#a8602a'});
            fx.prop(shapes.cylinder(fx.scene, 0.2, 0.55), {at: [0, 0.1, 0], color: '#2a2a33'});
            fx.prop(shapes.torus(fx.scene, 0.55, 0.3), {at: [0, 2.25, 0], color: '#b8bcc8'});
            const top = fx.node('top', [0, 2.25, 0]);
            // Volleys of branching arcs lashing out from the torus.
            arcs(fx, {
                parent: top,
                to: top,
                shape: new HemisphereEmitter({radius: 2.2, thickness: 0}),
                aim: 'up',
                burst: [
                    [0, 4],
                    [0.3, 3],
                    [0.6, 4],
                    [1.2, 5],
                    [1.5, 3],
                    [1.9, 4],
                ],
                life: [0.12, 0.25],
                width: [0.2, 0.35],
            });
            // Now and then one strikes the floor in a spray of sparks.
            const ground = fx.node('ground', [1.6, 0, 0.4]);
            arcs(fx, {parent: ground, to: top, burst: [[1.2, 3]], life: [0.1, 0.2], width: [0.3, 0.4]});
            zapSparks(fx, {
                parent: ground,
                at: [0, 0.1, 0],
                count: 18,
                time: 1.2,
                loop: true,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1}),
            });
            core(fx, {parent: top, size: 1.2, color: '#7ac4ff'});
            pool(fx, {color: '#5ab8ff', size: 3.4, alpha: 0.2});
        },
    },
    {
        id: 'lightning/thunderclap',
        name: 'Thunderclap',
        loop: false,
        period: 1.9,
        build(fx) {
            // thunderclap.js in 3D: the caster claps and a dome of charge swells round them (0 to 0.3 s),
            // crawling with forks; it bursts into a ring racing out over the floor, cyan streaks flung up,
            // dust rolling outward and embers left glowing on the ground; one last bolt runs down the caster
            // (0.6 s); the dust thins by 1.5 s and the scorch fades.
            fx.character([0, 0, 0], 1.8, '#2a2d3a');
            const R = 2.1;
            const hemi: Array<[number, number]> = [];
            for (let i = 0; i <= 12; i++) {
                const lat = (i / 12) * (Math.PI / 2);
                hemi.push([Math.cos(lat), Math.sin(lat)]);
            }
            // The dome: a shell whose faces fade toward the camera, so only its rim glows.
            for (const [face, alpha, order] of [
                ['back', 0.45, 1],
                ['front', 0.9, 6],
            ] as Array<['back' | 'front', number, number]>) {
                fx.sys({
                    tex: 'square',
                    geo: lathe(hemi, 48),
                    blend: 'add',
                    life: 0.36,
                    size: R,
                    burst: 1,
                    color: '#4a8cff',
                    alpha,
                    order,
                    look: {renderFace: face, rim: {color: [0.8, 0.96, 1], power: 2.2, strength: 1, mode: 'fade'}},
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#7ac4ff', 0.5],
                            ],
                            [
                                [0, 0],
                                [1, 0.1],
                                [1, 0.75],
                                [0, 1],
                            ]
                        ),
                        grow([0, 0.35], [0.45, 0.95], [1, 1.08]),
                    ],
                });
            }
            flash(fx, {at: [0, 1, 0], size: 5});
            flash(fx, {at: [0, 0.4, 0], size: 6, time: 0.3, color: '#bfe6ff'});
            // Forks crawling over the inside of the dome, out from the caster's chest.
            const chest = fx.node('chest', [0, 1.1, 0]);
            arcs(fx, {
                to: chest,
                shape: new HemisphereEmitter({radius: R * 0.9, thickness: 0.15}),
                aim: 'up',
                burst: [
                    [0, 6],
                    [0.06, 6],
                    [0.12, 7],
                    [0.2, 7],
                ],
                life: [0.08, 0.16],
                width: [0.5, 0.75],
            });
            // The dome bursts: a ring racing out, a softer shock under it.
            shockwave(fx, {tex: 'ring', size: 7, life: 0.55, color: '#9ac4ff', delay: 0.3});
            shockwave(fx, {size: 5, life: 0.4, color: '#5a8cff', alpha: 0.5, delay: 0.3});
            // Dust rolling out along the floor, slowing.
            fx.sys({
                image: 'smoke-puff',
                randomTile: false,
                blend: 'alpha',
                life: [0.9, 1.3],
                speed: [2.5, 4],
                size: [0.5, 0.8],
                rot: true,
                color: '#6a6472',
                alpha: 0.55,
                burst: [[0.3, 26]],
                shape: new CircleEmitter({radius: 0.8, thickness: 0}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.2, 0],
                order: 2,
                soft: true,
                b: [lifeFrames(16), grow([0, 0.8], [1, 1.6]), spin([-0.6, 0.6]), airDrag(3)],
            });
            // Embers left glowing on the floor.
            fx.sys({
                tex: 'dot',
                life: [0.5, 0.9],
                speed: [1, 3],
                size: [0.05, 0.08],
                burst: [[0.3, 36]],
                color: ['#ffb040', '#ff5a1a'],
                shape: new CircleEmitter({radius: 0.5, thickness: 0}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.04, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], flicker()), airDrag(4)],
            });
            // Cyan streaks flung up and out.
            zapSparks(fx, {
                at: [0, 0.3, 0],
                count: 34,
                speed: [6, 10],
                time: 0.3,
                shape: new HemisphereEmitter({radius: 0.6}),
            });
            // One last bolt running down the caster.
            const head = fx.node('head', [0.05, 1.9, 0.1]);
            const feet = fx.node('feet', [0, 0.05, 0.15]);
            arcs(fx, {
                parent: head,
                to: feet,
                burst: [
                    [0.6, 1],
                    [0.72, 1],
                ],
                life: [0.08, 0.12],
                width: [0.35, 0.5],
            });
            decal(fx, {
                tex: 'crack',
                blend: 'add',
                size: 5,
                color: '#7ac4ff',
                alpha: 0.8,
                life: 1.2,
                delay: 0.3,
                colors: [
                    ['#ffffff', 0],
                    ['#5ab8ff', 0.3],
                    ['#1a2a6a', 1],
                ],
            });
        },
    },
    {
        id: 'lightning/zap-hit',
        name: 'Zap hit',
        loop: false,
        period: 2.2,
        build(fx) {
            const point = fx.node('point', [0.6, 1.3, 0]);
            const from = fx.node('from', [-3, 1.6, 0]);
            fx.prop(shapes.box(fx.scene, 0.5, 2.6, 1.2), {at: [1, 1.3, 0], color: '#3a3542'});
            arcs(fx, {parent: from, to: point, duration: 0.3, loop: false, rate: 40, width: [0.3, 0.4]});
            // A knot of tiny zigzags overloading the hit point.
            arcs(fx, {
                parent: point,
                to: point,
                shape: new SphereEmitter({radius: 0.5, thickness: 0}),
                rate: 40,
                duration: 0.5,
                loop: false,
                width: [0.08, 0.14],
            });
            flash(fx, {parent: point, size: 2});
            fx.sys({
                tex: 'crack',
                blend: 'add',
                life: 0.8,
                size: 1.8,
                burst: 1,
                color: '#7ac4ff',
                parent: point,
                at: [-0.15, 0, 0],
                rotate: [0, Math.PI / 2, 0],
                mode: RenderMode.VerticalBillBoard,
                order: 3,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#3a6aff', 0.4],
                            ['#2a1a4a', 1],
                        ],
                        popOut(0.3)
                    ),
                ],
            });
            zapSparks(fx, {parent: point, count: 20, aim: 'left', shape: new ConeEmitter({radius: 0.05, angle: 1})});
            smoke(fx, {
                parent: point,
                burst: [[0.15, 6]],
                color: '#b8c8e8',
                alpha: 0.35,
                size: [0.3, 0.5],
                speed: [0.4, 0.8],
                life: [1, 1.5],
                loop: false,
            });
        },
    },
];
