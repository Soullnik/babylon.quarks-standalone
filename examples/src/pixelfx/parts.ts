import type {ParticleSystem} from 'babylon.quarks';
import {CircleEmitter, RenderMode} from 'babylon.quarks';
import {airDrag, curve, floorBounce, gravity, grow, lifeFrames, popOut, spin, tint, type SysOptions} from './kit';
import type {Ramp} from './recipes';
import type {FxBuilder} from './stage';

/**
 * Parts shared by the impact, projectile and later categories: dust, clods, sparks that bounce,
 * stars of light, pools of light and comic wedges.
 */

/** White-hot cooling to orange: flares, stars, tracers. */
export const HOT: Ramp = [
    ['#ffffff', 0],
    ['#fff3a6', 0.25],
    ['#ffe26b', 0.5],
    ['#ff8a2a', 1],
];
/** pixelfx's spark ramp, hot to cooling. */
export const SPARK: Ramp = [
    ['#fff3a6', 0],
    ['#ffe26b', 0.3],
    ['#ff8a2a', 0.65],
    ['#f2561d', 1],
];
export const GOLD: Ramp = [
    ['#fff6c4', 0],
    ['#ffe066', 0.35],
    ['#e8b030', 0.7],
    ['#b07a1a', 1],
];
/** A circle lying on the floor (its normal turned up), for things thrown out along the ground. */
export const FLAT: [number, number, number] = [Math.PI / 2, 0, 0];

export type At = [number, number, number];

/**
 * Dust: pixelfx's smoke puff played once over each puff's life, swelling, slowed by the air and
 * lifting a little as it thins.
 */
export function dust(
    fx: FxBuilder,
    o: Pick<SysOptions, 'size' | 'life'> &
        Partial<
            Pick<
                SysOptions,
                | 'at'
                | 'shape'
                | 'aim'
                | 'rotate'
                | 'burst'
                | 'rate'
                | 'world'
                | 'duration'
                | 'loop'
                | 'speed'
                | 'delay'
                | 'order'
                | 'parent'
            >
        > & {
            color: string | [string, string];
            alpha?: number;
            drag?: number;
            lift?: number;
            grows?: number;
            warm?: boolean;
        }
) {
    return fx.sys({
        image: 'smoke-puff',
        randomTile: false,
        blend: 'alpha',
        soft: true,
        rot: true,
        loop: false,
        alpha: o.alpha ?? 0.6,
        order: o.order ?? 2,
        ...o,
        b: [
            lifeFrames(16),
            grow([0, 0.7], [1, o.grows ?? 1.6]),
            spin([-0.5, 0.5]),
            airDrag(o.drag ?? 4),
            gravity(o.lift ?? 0.3, [0, 1, 0]),
            ...(o.warm
                ? [
                      tint(
                          [
                              ['#ffe2b8', 0],
                              ['#ffffff', 0.35],
                          ],
                          [
                              [1, 0],
                              [1, 0.5],
                              [0, 1],
                          ]
                      ),
                  ]
                : []),
        ],
    });
}

/** Lumps knocked loose: lit meshes that arc out, land, bounce and settle, in the world. */
export function clods(
    fx: FxBuilder,
    o: Partial<Pick<SysOptions, 'at' | 'shape' | 'aim' | 'rotate' | 'speed' | 'size' | 'life' | 'delay' | 'parent'>> & {
        count: number;
        color: string | [string, string];
        mesh?: SysOptions['mesh'];
        bounce?: number;
        weight?: number;
    }
) {
    return fx.sys({
        mesh: o.mesh ?? 'rock',
        tumble: 8,
        world: true,
        loop: false,
        burst: [[0, o.count]],
        order: 3,
        ...o,
        life: o.life ?? [1.2, 1.6],
        size: o.size ?? [0.08, 0.14],
        b: [gravity(o.weight ?? 10), airDrag(0.6), floorBounce(o.bounce ?? 0.3), grow([0, 1], [0.85, 1], [1, 0])],
    });
}

/** Sparks that streak along their flight, fall, and bounce off the floor before they die. */
export function hotSparks(
    fx: FxBuilder,
    o: Partial<Pick<SysOptions, 'at' | 'shape' | 'aim' | 'rotate' | 'speed' | 'size' | 'life' | 'delay' | 'parent'>> & {
        count: number;
        time?: number;
        palette?: Ramp;
        weight?: number;
        streak?: number;
    }
) {
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: o.streak ?? 0.45, length: 1},
        world: true,
        loop: false,
        burst: [[o.time ?? 0, o.count]],
        order: 5,
        ...o,
        life: o.life ?? [0.3, 0.6],
        size: o.size ?? [0.04, 0.07],
        b: [tint(o.palette ?? SPARK, popOut(0.55)), gravity(o.weight ?? 9), airDrag(1.5), floorBounce(0.35)],
    });
}

/**
 * Comic wedges on a circle facing the camera, each with its point toward the centre and its fat end
 * out, jabbing out to full length and snapping back. `tex: 'streak'` makes plain flying slivers.
 */
export function wedges(
    fx: FxBuilder,
    o: {
        at: At;
        radius: number;
        count: number;
        size: [number, number];
        color: string;
        time?: number;
        life?: [number, number];
        blend?: 'add' | 'alpha';
        arc?: number;
        turn?: number;
        order?: number;
        reach?: number;
        tex?: 'wedge' | 'streak';
        fly?: number;
    }
) {
    return fx.sys({
        tex: o.tex ?? 'wedge',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0, length: o.reach ?? 3.5},
        blend: o.blend ?? 'alpha',
        loop: false,
        life: o.life ?? [0.12, 0.2],
        // Moving inward puts the head (the point) on the circle and the tail outside it.
        speed: o.fly ? -o.fly : -0.4,
        size: o.size,
        burst: [[o.time ?? 0, o.count]],
        color: o.color,
        shape: new CircleEmitter({radius: o.radius, thickness: 0, arc: o.arc ?? Math.PI * 2}),
        rotate: [0, 0, o.turn ?? 0],
        at: o.at,
        order: o.order ?? 6,
        b: [grow([0, 0], [0.3, 1], [1, 0])],
    });
}

/** A star of light that flashes and fades: a glint or burst texture, its colour cooling down a ramp. */
export function star(
    fx: FxBuilder,
    o: {
        at: At;
        size: number;
        life: number;
        tex?: SysOptions['tex'];
        time?: number;
        ramp?: Ramp;
        rot?: number;
        grows?: Array<[number, number]>;
        order?: number;
        color?: string;
        alpha?: number;
        parent?: SysOptions['parent'];
    }
) {
    return fx.sys({
        tex: o.tex ?? 'glint',
        loop: false,
        life: o.life,
        size: o.size,
        rot: o.rot,
        burst: [[o.time ?? 0, 1]],
        color: o.color,
        alpha: o.alpha,
        at: o.at,
        parent: o.parent,
        order: o.order ?? 7,
        b: [tint(o.ramp ?? HOT, popOut(0.3)), grow(...(o.grows ?? [[0, 1]]))],
    });
}

/** A soft pool of light: on the air at `at`, or laid on the floor with `floor`. */
export function light(
    fx: FxBuilder,
    o: {at?: At; size: number; color: string; alpha?: number; life?: number; time?: number; floor?: boolean}
) {
    return fx.sys({
        tex: 'glow',
        mode: o.floor ? RenderMode.HorizontalBillBoard : undefined,
        loop: false,
        life: o.life ?? 0.35,
        size: o.size,
        burst: [[o.time ?? 0, 1]],
        color: o.color,
        alpha: o.alpha ?? 0.6,
        at: o.at ?? [0, 0.02, 0],
        order: o.floor ? 1 : 2,
        b: [tint([['#ffffff', 0]], popOut(0.2))],
    });
}

/**
 * Emits `rate` per second only between `from` and `to` seconds of a one-shot `period` (the system's
 * duration): a rate of 0 would count the system as finished at once, so the window is a curve.
 */
export function gate(system: ParticleSystem, period: number, from: number, to: number, rate: number): void {
    const a = from / period;
    const b = Math.min(0.998, to / period);
    const keys: Array<[number, number]> =
        a <= 0
            ? [[0, rate]]
            : [
                  [0, 0],
                  [a - 0.001, 0],
                  [a, rate],
              ];
    system.emissionOverTime = curve(...keys, [b, rate], [b + 0.001, 0], [1, 0]);
}
