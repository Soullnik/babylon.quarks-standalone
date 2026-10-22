/** @jest-environment jsdom */
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {RenderMode} from 'babylon.quarks';
import {EffectBinding} from '../../src/core/binding';
import {createChildSystem} from '../../src/core/systems';
import {EffectEditor} from '../../src/react/EffectEditor';
import {makeSystem, useScene} from '../helpers';
import {click, controlsOf, hasRow, moduleTitles, mount, Mounted, openModule, rowOf, type} from './dom';

const MODULES = [
    'Main',
    'Emission',
    'Shape',
    'Randomize Direction',
    'Velocity over Lifetime',
    'Speed over Lifetime',
    'Limit Speed over Lifetime',
    'Inherit Velocity',
    'Force over Lifetime',
    'Gravity',
    'Attractor',
    'Orbit over Lifetime',
    'Color over Lifetime',
    'Color by Speed',
    'Size over Lifetime',
    'Size by Speed',
    'Rotation over Lifetime',
    'Rotation over Lifetime (3D)',
    'Rotation by Speed',
    'Noise',
    'Turbulence',
    'Collision',
    'Width over Trail',
    'Sub Emitters',
    'Texture Sheet Animation',
    'Sequences',
    'Renderer',
];

describe('EffectEditor', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it.each([RenderMode.BillBoard, RenderMode.StretchedBillBoard, RenderMode.Trail, RenderMode.Mesh, RenderMode.Beam])(
        'mounts every module for render mode %s and opens each one',
        (renderMode) => {
            const system = makeSystem(scene.get(), {renderMode});
            const binding = new EffectBinding(system);
            mounted = mount(
                <EffectEditor
                    binding={binding}
                    selectedSystem={system}
                    gizmoTargetNode={system.emitter}
                    gizmoTargetLabel="Emitter"
                />
            );
            const {container} = mounted;
            const titles = moduleTitles(container);
            for (const title of MODULES) {
                expect(titles).toContain(title);
                openModule(container, title);
            }
            // Every behaviour module can be switched on without throwing.
            for (const section of Array.from(container.querySelectorAll('section'))) {
                const toggle = section.querySelector('header input[type=checkbox]');
                if (toggle) {
                    click(toggle);
                }
            }
            expect(system.behaviors.length).toBeGreaterThan(10);
        }
    );

    it('shows the warm-up time only while prewarm is on and clamps a negative entry to 0', () => {
        const system = makeSystem(scene.get());
        const binding = new EffectBinding(system);
        mounted = mount(
            <EffectEditor
                binding={binding}
                selectedSystem={system}
                gizmoTargetNode={system.emitter}
                gizmoTargetLabel="Emitter"
            />
        );
        const {container} = mounted;
        openModule(container, 'Main');
        expect(hasRow(container, 'Warm-up time')).toBe(false);
        click(controlsOf(rowOf(container, 'Prewarm'))[0]);
        expect(system.prewarm).toBe(true);
        type(controlsOf(rowOf(container, 'Warm-up time'))[0], '0.5');
        expect(system.prewarmTime).toBe(0.5);
        type(controlsOf(rowOf(container, 'Warm-up time'))[0], '-2');
        expect(system.prewarmTime).toBe(0);
    });

    it('edits a selected sub-system through the root binding and re-renders on its changes', () => {
        const main = makeSystem(scene.get());
        const binding = new EffectBinding(main);
        const sub = createChildSystem(main);
        binding.addSubSystem(sub);
        const changes: number[] = [];
        binding.subscribe(() => changes.push(binding.getRevision()));
        const group = new TransformNode('group', scene.get());
        mounted = mount(
            <EffectEditor binding={binding} selectedSystem={sub} gizmoTargetNode={group} gizmoTargetLabel="Group" />
        );
        const {container} = mounted;
        expect(container.textContent).toContain('Modules below edit');
        openModule(container, 'Main');
        const wasLooping = sub.looping;
        const mainLooping = main.looping;
        click(controlsOf(rowOf(container, 'Looping'))[0]);
        expect(sub.looping).toBe(!wasLooping);
        expect(main.looping).toBe(mainLooping);
        expect(changes.length).toBeGreaterThan(0);
        // The sub-system's row re-rendered with its new state.
        expect((controlsOf(rowOf(container, 'Looping'))[0] as HTMLInputElement).checked).toBe(!wasLooping);
    });
});
