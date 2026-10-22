import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Bezier, ConstantValue, IntervalValue, PiecewiseBezier} from 'babylon.quarks';
import {EffectBinding} from '../src/core/binding';
import {computeStartOffset, computeTimelineRows, computeTimelineSpan} from '../src/core/timeline';
import {makeSystem, useScene} from './helpers';

describe('timeline', () => {
    const scene = useScene();

    it('reads a start delay without sampling the generator', () => {
        expect(computeStartOffset(new ConstantValue(0.5))).toEqual({value: 0.5, startOffsetVariable: false});
        expect(computeStartOffset(new IntervalValue(0.8, 0.2))).toEqual({value: 0.2, startOffsetVariable: false});
        expect(computeStartOffset(new PiecewiseBezier([[new Bezier(0, 0, 1, 1), 0]]))).toEqual({
            value: 0,
            startOffsetVariable: true,
        });
    });

    it('flattens groups and emitters into rows in tree order', () => {
        const root = new TransformNode('fx', scene.get());
        const main = makeSystem(scene.get(), {duration: 2, startDelay: new ConstantValue(0.5)});
        main.emitter.name = 'main';
        main.emitter.parent = root;
        const group = new TransformNode('sparks', scene.get());
        group.parent = root;
        const sub = makeSystem(scene.get(), {looping: false});
        sub.emitter.name = 'sub';
        sub.emitter.parent = group;
        const oneShot = makeSystem(scene.get());
        oneShot.onlyUsedByOther = true;
        oneShot.emitter.parent = group;
        const binding = new EffectBinding(main, [sub, oneShot], root);

        const rows = computeTimelineRows(binding);
        expect(rows.map((row) => [row.kind, row.name, row.depth])).toEqual([
            ['group', 'fx', 0],
            ['track', 'main', 1],
            ['group', 'sparks', 1],
            ['track', 'sub', 2],
            ['track', 'particleEmitter', 2],
        ]);
        const track = rows[1];
        expect(track.kind === 'track' && track).toMatchObject({
            isRoot: false,
            removable: true,
            startOffset: 0.5,
            startOffsetVariable: false,
            duration: 2,
            looping: true,
        });
        expect(rows[3]).toMatchObject({removable: true, looping: false});
        expect(rows[4]).toMatchObject({removable: true});
    });

    it('marks the root track and keeps a lone main system', () => {
        const main = makeSystem(scene.get());
        const rows = computeTimelineRows(new EffectBinding(main));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({kind: 'track', isRoot: true, removable: false});
        // With only a one-shot beside it, the main system still cannot go.
        const oneShot = makeSystem(scene.get());
        oneShot.onlyUsedByOther = true;
        oneShot.emitter.parent = main.emitter;
        expect(computeTimelineRows(new EffectBinding(main, [oneShot]))[0]).toMatchObject({removable: false});
    });

    it('spans the worst-case tail of every track', () => {
        const streaming = makeSystem(scene.get(), {
            duration: 2,
            startDelay: new ConstantValue(1),
            startLife: new IntervalValue(0.5, 1.5),
        });
        const bursting = makeSystem(scene.get(), {
            duration: 10,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [
                {time: 0.5, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
                {time: 2, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
            ],
            startLife: new ConstantValue(3),
        });
        bursting.emitter.parent = streaming.emitter;
        const binding = new EffectBinding(streaming, [bursting]);
        // streaming: 1 + 2 + 1.5 = 4.5; bursting: 0 + 2 + 3 = 5.
        expect(computeTimelineSpan(computeTimelineRows(binding))).toBe(5);
    });

    it('falls back to the duration and a unit life for other generators, and never spans zero', () => {
        const curve = new PiecewiseBezier([[new Bezier(0, 0, 1, 1), 0]]);
        const silent = makeSystem(scene.get(), {duration: 2, emissionOverTime: curve, startLife: curve});
        expect(computeTimelineSpan(computeTimelineRows(new EffectBinding(silent)))).toBe(3);
        const perMetre = makeSystem(scene.get(), {
            duration: 4,
            emissionOverTime: new ConstantValue(0),
            emissionOverDistance: new ConstantValue(2),
            startLife: new ConstantValue(0),
        });
        expect(computeTimelineSpan(computeTimelineRows(new EffectBinding(perMetre)))).toBe(4);
        expect(computeTimelineSpan([])).toBe(0.01);
    });
});
