/** @jest-environment jsdom */
import {
    Bezier,
    ChangeEmitDirection,
    ConstantValue,
    FrameOverLife,
    GravityForce,
    IntervalValue,
    LimitSpeedOverLife,
    PiecewiseBezier,
    RandomBetweenCurves,
    SizeBySpeed,
    SpeedOverLife,
    Vector3Function,
} from 'babylon.quarks';
import {EffectBinding} from '../../src/core/binding';
import {findBehavior} from '../../src/core/colors';
import {
    AttractorModule,
    EmitDirectionModule,
    LimitSpeedOverLifeModule,
    SizeBySpeedModule,
    SpeedOverLifeModule,
    TextureSheetModule,
} from '../../src/react/behaviorModules';
import {makeSystem, useScene} from '../helpers';
import {click, controlsOf, hasRow, moduleToggle, mount, Mounted, openModule, pick, rowOf, type} from './dom';

describe('Texture Sheet Animation module', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('plays the sheet by life or by frame rate, over a segment, from a random start frame', () => {
        const system = makeSystem(scene.get(), {uTileCount: 4, vTileCount: 2});
        const binding = new EffectBinding(system);
        const element = () => <TextureSheetModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const {container} = mounted;
        openModule(container, 'Texture Sheet Animation');
        const frames = () => findBehavior<FrameOverLife>(system.behaviors, 'FrameOverLife')!;

        expect(hasRow(container, 'Time mode')).toBe(false);
        click(controlsOf(rowOf(container, 'Animate frames'))[0]);
        expect(frames().isPlain()).toBe(true);
        expect(hasRow(container, 'FPS')).toBe(false);

        type(controlsOf(rowOf(container, 'Cycles'))[0], '3');
        expect(frames().cycles).toBe(3);

        // FPS mode starts with the whole sheet as the segment.
        pick(controlsOf(rowOf(container, 'Time mode'))[0], 'fps');
        expect(frames().fps).toBe(12);
        expect(frames().frameCount).toBe(8);
        expect(hasRow(container, 'Cycles')).toBe(false);
        type(controlsOf(rowOf(container, 'FPS'))[0], '24');
        type(controlsOf(rowOf(container, 'Frame count'))[0], '5');
        click(controlsOf(rowOf(container, 'Loop'))[0]);
        click(controlsOf(rowOf(container, 'Random frame'))[0]);
        expect(frames()).toMatchObject({fps: 24, frameCount: 5, loop: false, random: true});

        click(controlsOf(rowOf(container, 'Start frame'))[0]);
        expect(frames().startFrame).toEqual(new IntervalValue(0, 8));
        type(controlsOf(rowOf(container, 'Start frame'))[1], '3');
        expect(frames().startFrame).toEqual(new IntervalValue(0, 3));
        click(controlsOf(rowOf(container, 'Start frame'))[0]);
        expect(frames().startFrame).toBeUndefined();

        pick(controlsOf(rowOf(container, 'Time mode'))[0], 'life');
        expect(frames().fps).toBe(0);
        expect(frames().frameCount).toBe(5);

        // A start frame needs a segment to wrap into: enabling it on a plain sheet sets one.
        type(controlsOf(rowOf(container, 'Frame count'))[0], '0');
        click(controlsOf(rowOf(container, 'Start frame'))[0]);
        expect(frames().frameCount).toBe(8);
        // A loaded constant start frame shows as its count and is replaced by a range on edit.
        frames().startFrame = new ConstantValue(4);
        binding.markChanged();
        expect((controlsOf(rowOf(container, 'Start frame'))[1] as HTMLInputElement).value).toBe('4');
        type(controlsOf(rowOf(container, 'Start frame'))[1], '2');
        expect(frames().startFrame).toEqual(new IntervalValue(0, 2));
    });
});

describe('Attractor module', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('adds a point gravity with its centre and strength', () => {
        const system = makeSystem(scene.get());
        const binding = new EffectBinding(system);
        const element = () => <AttractorModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const {container} = mounted;
        const section = openModule(container, 'Attractor');
        click(moduleToggle(section));
        const attractor = () => findBehavior<GravityForce>(system.behaviors, 'GravityForce')!;
        expect(attractor().magnitude).toBe(1);
        type(controlsOf(rowOf(container, 'Center'))[1], '2');
        type(controlsOf(rowOf(container, 'Strength'))[0], '5');
        expect([attractor().center.x, attractor().center.y, attractor().center.z]).toEqual([0, 2, 0]);
        expect(attractor().magnitude).toBe(5);
        click(moduleToggle(section));
        expect(findBehavior(system.behaviors, 'GravityForce')).toBeUndefined();
    });
});

describe('Randomize Direction module', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('offers no curve for the angle, which is sampled once per particle', () => {
        const system = makeSystem(scene.get());
        const binding = new EffectBinding(system);
        const element = () => <EmitDirectionModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const section = openModule(mounted.container, 'Randomize Direction');
        click(moduleToggle(section));
        const direction = () => findBehavior<ChangeEmitDirection>(system.behaviors, 'ChangeEmitDirection')!;
        expect(direction()).toBeDefined();
        const mode = controlsOf(rowOf(mounted.container, 'Angle (rad)'))[0] as HTMLSelectElement;
        expect(Array.from(mode.options).map((o) => o.value)).toEqual(['constant', 'random']);
        pick(mode, 'constant');
        expect(direction().angle).toBeInstanceOf(ConstantValue);
    });
});

describe('Speed over Lifetime module', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('shows both curves of an imported Random Between Two Curves and keeps them through a switch', () => {
        const system = makeSystem(scene.get());
        const flat = (v: number) => new PiecewiseBezier([[new Bezier(v, v, v, v), 0]]);
        system.addBehavior(new SpeedOverLife(new RandomBetweenCurves(flat(0.5), flat(2))));
        const binding = new EffectBinding(system);
        const element = () => <SpeedOverLifeModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const section = openModule(mounted.container, 'Speed over Lifetime');
        expect(section.querySelectorAll('svg[width]')).toHaveLength(2);
        const speed = () => findBehavior<SpeedOverLife>(system.behaviors, 'SpeedOverLife')!.speed;
        click(controlsOf(rowOf(section, 'Two curves'))[0]);
        expect(speed()).toBeInstanceOf(PiecewiseBezier);
        click(controlsOf(rowOf(section, 'Two curves'))[0]);
        expect(speed()).toBeInstanceOf(RandomBetweenCurves);
    });
});

describe('Separate Axes', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('gives Limit Speed over Lifetime a limit per axis and a space', () => {
        const system = makeSystem(scene.get());
        system.addBehavior(new LimitSpeedOverLife(new PiecewiseBezier([[new Bezier(2, 2, 2, 2), 0]]), 0.5));
        const binding = new EffectBinding(system);
        const element = () => <LimitSpeedOverLifeModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const section = openModule(mounted.container, 'Limit Speed over Lifetime');
        const limit = () => findBehavior<LimitSpeedOverLife>(system.behaviors, 'LimitSpeedOverLife')!;
        expect(hasRow(section, 'Space')).toBe(false);

        click(controlsOf(rowOf(section, 'Separate axes'))[0]);
        const speed = limit().speed as Vector3Function;
        expect(speed).toBeInstanceOf(Vector3Function);
        expect((speed.y as PiecewiseBezier).toJSON()).toEqual(
            new PiecewiseBezier([[new Bezier(2, 2, 2, 2), 0]]).toJSON()
        );
        expect(section.querySelectorAll('svg[width]')).toHaveLength(3);
        pick(controlsOf(rowOf(section, 'Space'))[0], 'world');
        expect(limit().space).toBe('world');

        click(controlsOf(rowOf(section, 'Separate axes'))[0]);
        expect(limit().speed).toBeInstanceOf(PiecewiseBezier);
        expect(hasRow(section, 'Space')).toBe(false);
    });

    it('gives Size by Speed a curve per axis', () => {
        const system = makeSystem(scene.get());
        system.addBehavior(
            new SizeBySpeed(new PiecewiseBezier([[new Bezier(1, 1, 1, 1), 0]]), new IntervalValue(0, 5))
        );
        const binding = new EffectBinding(system);
        const element = () => <SizeBySpeedModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const section = openModule(mounted.container, 'Size by Speed');
        click(controlsOf(rowOf(section, 'Separate axes'))[0]);
        expect(findBehavior<SizeBySpeed>(system.behaviors, 'SizeBySpeed')!.size).toBeInstanceOf(Vector3Function);
    });
});
