import {
    BoxEmitFrom,
    BoxEmitter,
    ConstantValue,
    EdgeEmitter,
    EmissionState,
    EmitterFromJSON,
    EmitterMode,
    IParticleSystem,
    SpriteParticle,
} from '../../src';

const emissionState = (): EmissionState => ({
    isBursting: false,
    burstParticleIndex: 0,
    burstParticleCount: 0,
    burstIndex: 0,
    burstWaveIndex: 0,
    time: 0,
    waitEmiting: 0,
    travelDistance: 0,
});

/** Positions (as fractions of the half-size on each axis) and velocities of `count` new particles. */
function sample(emitter: BoxEmitter, count = 3000) {
    const half = [emitter.width / 2, emitter.height / 2, emitter.depth / 2];
    const out: Array<{a: number[]; v: number[]}> = [];
    for (let i = 0; i < count; i++) {
        const p = new SpriteParticle();
        p.startSpeed = 2;
        emitter.initialize(p, emissionState());
        out.push({
            a: [p.position.x / half[0], p.position.y / half[1], half[2] > 0 ? p.position.z / half[2] : 0],
            v: [p.velocity.x, p.velocity.y, p.velocity.z],
        });
    }
    return out;
}

const onFace = (x: number) => Math.abs(Math.abs(x) - 1) < 1e-9;

describe('BoxEmitter', () => {
    test('fills the volume and moves every particle along +Z', () => {
        const points = sample(new BoxEmitter({width: 4, height: 2, depth: 6}));
        for (const {a, v} of points) {
            for (const c of a) expect(Math.abs(c)).toBeLessThanOrEqual(1);
            expect(v).toEqual([0, 0, 2]);
        }
        const inner = points.filter(({a}) => a.every((c) => Math.abs(c) < 0.5)).length;
        // An eighth of a uniformly filled box lies inside the half-size box.
        expect(inner / points.length).toBeGreaterThan(0.09);
        expect(inner / points.length).toBeLessThan(0.16);
    });

    test('a box with no depth is a flat rectangle', () => {
        for (const {a} of sample(new BoxEmitter({width: 4, height: 2, depth: 0}), 200)) {
            expect(a[2]).toBe(0);
        }
    });

    test('shell keeps particles on a face, picking each axis about equally', () => {
        const points = sample(new BoxEmitter({width: 4, height: 2, depth: 6, emitFrom: BoxEmitFrom.Shell}));
        const perAxis = [0, 0, 0];
        for (const {a} of points) {
            const faces = a.map(onFace);
            expect(faces.some(Boolean)).toBe(true);
            perAxis[faces.indexOf(true)]++;
        }
        for (const n of perAxis) expect(n / points.length).toBeGreaterThan(0.28);
    });

    test('edge keeps two coordinates on the faces', () => {
        for (const {a} of sample(new BoxEmitter({width: 4, height: 2, depth: 6, emitFrom: BoxEmitFrom.Edge}))) {
            expect(a.filter(onFace).length).toBeGreaterThanOrEqual(2);
        }
    });

    test('thickness sinks half the shell particles up to twice its share of the half-size', () => {
        const emitter = new BoxEmitter({
            width: 4,
            height: 2,
            depth: 6,
            emitFrom: BoxEmitFrom.Shell,
            boxThickness: [0.2, 0, 0],
        });
        // Particles on an X face are the ones with Y and Z off their faces.
        const xFace = sample(emitter, 6000).filter(({a}) => !onFace(a[1]) && !onFace(a[2]));
        const sunk = xFace.filter(({a}) => !onFace(a[0]));
        for (const {a} of sunk) expect(Math.abs(a[0])).toBeGreaterThanOrEqual(0.6 - 1e-9);
        expect(sunk.length / xFace.length).toBeGreaterThan(0.4);
        expect(sunk.length / xFace.length).toBeLessThan(0.6);
    });

    test('round-trips through JSON and clone', () => {
        const emitter = new BoxEmitter({
            width: 4,
            height: 2,
            depth: 6,
            emitFrom: BoxEmitFrom.Edge,
            boxThickness: [0.1, 0.2, 0.3],
        });
        const json = emitter.toJSON();
        expect(json).toEqual({
            type: 'box',
            width: 4,
            height: 2,
            depth: 6,
            emitFrom: BoxEmitFrom.Edge,
            boxThickness: [0.1, 0.2, 0.3],
        });
        expect((EmitterFromJSON(json, {} as any) as BoxEmitter).toJSON()).toEqual(json);
        expect(emitter.clone().toJSON()).toEqual(json);
        // The clone owns its thickness.
        (emitter.clone() as BoxEmitter).boxThickness[0] = 9;
        expect(emitter.boxThickness[0]).toBe(0.1);
    });

    test('defaults to a unit volume box', () => {
        const json = BoxEmitter.fromJSON({type: 'box'}).toJSON();
        expect(json).toEqual({
            type: 'box',
            width: 1,
            height: 1,
            depth: 1,
            emitFrom: BoxEmitFrom.Volume,
            boxThickness: [0, 0, 0],
        });
        new BoxEmitter().update({} as IParticleSystem, 0.1);
    });
});

describe('EdgeEmitter', () => {
    test('emits along X within the radius, moving along +Y', () => {
        const emitter = new EdgeEmitter({radius: 3});
        for (let i = 0; i < 500; i++) {
            const p = new SpriteParticle();
            p.startSpeed = 2;
            emitter.initialize(p, emissionState());
            expect(Math.abs(p.position.x)).toBeLessThanOrEqual(3);
            expect(p.position.y).toBe(0);
            expect(p.position.z).toBe(0);
            expect([p.velocity.x, p.velocity.y, p.velocity.z]).toEqual([0, 2, 0]);
        }
    });

    test('loop mode sweeps from -radius toward +radius', () => {
        const emitter = new EdgeEmitter({radius: 2, mode: EmitterMode.Loop, speed: new ConstantValue(1)});
        const system = {emissionState: {time: 0}, duration: 1} as unknown as IParticleSystem;
        const xs: number[] = [];
        for (let i = 0; i < 3; i++) {
            const p = new SpriteParticle();
            emitter.initialize(p, emissionState());
            xs.push(p.position.x);
            emitter.update(system, 0.25);
        }
        expect(xs).toEqual([-2, -1, 0]);
    });

    test('round-trips through JSON and clone', () => {
        const emitter = new EdgeEmitter({
            radius: 0.5,
            mode: EmitterMode.PingPong,
            spread: 0.1,
            speed: new ConstantValue(3),
        });
        const json = emitter.toJSON();
        expect(json.type).toBe('edge');
        expect((EmitterFromJSON(json, {} as any) as EdgeEmitter).toJSON()).toEqual(json);
        expect(emitter.clone().toJSON()).toEqual(json);
        expect(EdgeEmitter.fromJSON({type: 'edge'}).toJSON()).toEqual(new EdgeEmitter().toJSON());
    });
});
