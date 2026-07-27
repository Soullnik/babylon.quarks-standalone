import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Bezier, ConstantColor, ConstantValue, PiecewiseBezier, PointEmitter, SizeOverLife, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/** Mirrors GasMissileFire core layer: rate 5 / life 0.2 / prewarm. */
function createGasMissileFireCore(scene: Scene): ParticleSystem {
    const system = new ParticleSystem({
        scene,
        looping: true,
        prewarm: true,
        duration: 1,
        startLife: new ConstantValue(0.2),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(2.5),
        startColor: new ConstantColor(new Vector4(1, 0.516, 0, 1)),
        emissionOverTime: new ConstantValue(5),
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
    });
    system.emitter.name = 'GasMissileFire';
    return system;
}

/** Mirrors WhiteGlobe: delayed SizeOverLife first key (Unity export quirk). */
function createWhiteGlobe(scene: Scene): ParticleSystem {
    const system = new ParticleSystem({
        scene,
        looping: true,
        prewarm: true,
        duration: 1,
        startLife: new ConstantValue(0.2),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.7),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(5),
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
        behaviors: [
            new SizeOverLife(
                new PiecewiseBezier([
                    [new Bezier(0.85625, 0.85625, 1, 1), 0.0034129619598388672],
                    [new Bezier(1, 1, 0.85625, 0.85625), 0.5051194429397583],
                ])
            ),
        ],
    });
    system.emitter.name = 'WhiteGlobe';
    return system;
}

function mountSystems(scene: Scene, systems: ParticleSystem[]) {
    const renderer = new BatchedRenderer('flicker-test', scene);
    for (const system of systems) {
        renderer.addSystem(system);
        system.play();
    }
    return renderer;
}

function simulate(
    systems: ParticleSystem[],
    renderer: BatchedRenderer,
    frameCount: number,
    deltaForFrame: (frame: number) => number
) {
    const gapsByName = new Map<string, number>();
    const minCountByName = new Map<string, number>();
    const minSizeByName = new Map<string, number>();

    for (const system of systems) {
        const name = system.emitter.name;
        gapsByName.set(name, 0);
        minCountByName.set(name, Number.POSITIVE_INFINITY);
        minSizeByName.set(name, Number.POSITIVE_INFINITY);
    }

    for (let frame = 0; frame < frameCount; frame++) {
        renderer.update(deltaForFrame(frame));

        for (const system of systems) {
            const name = system.emitter.name;
            const count = system.particleNum;
            minCountByName.set(name, Math.min(minCountByName.get(name)!, count));
            if (count === 0) {
                gapsByName.set(name, gapsByName.get(name)! + 1);
            }

            let minSize = Number.POSITIVE_INFINITY;
            for (let i = 0; i < count; i++) {
                minSize = Math.min(minSize, system.particles[i].size.x);
            }
            if (count > 0) {
                minSizeByName.set(name, Math.min(minSizeByName.get(name)!, minSize));
            }
        }
    }

    return {gapsByName, minCountByName, minSizeByName};
}

describe('GasMissileFire flicker regressions', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    it('keeps inline GasMissileFire-like layers populated after prewarm at 60fps', () => {
        const systems = [createGasMissileFireCore(scene), createWhiteGlobe(scene)];
        const renderer = mountSystems(scene, systems);
        const {gapsByName, minCountByName, minSizeByName} = simulate(systems, renderer, 3600, () => 1 / 60);

        for (const system of systems) {
            const name = system.emitter.name;
            expect(minCountByName.get(name)).toBeGreaterThan(0);
            expect(gapsByName.get(name)).toBe(0);
            expect(minSizeByName.get(name)).toBeGreaterThan(0);
        }

        renderer.dispose();
    });

    it('keeps inline GasMissileFire-like layers populated with variable delta', () => {
        const systems = [createGasMissileFireCore(scene), createWhiteGlobe(scene)];
        const renderer = mountSystems(scene, systems);
        const {gapsByName} = simulate(systems, renderer, 7200, (frame) => {
            const base = 1 / 60;
            const wobble = Math.sin(frame * 0.17) * 0.004;
            return Math.max(1 / 240, base + wobble);
        });

        for (const system of systems) {
            expect(gapsByName.get(system.emitter.name)).toBe(0);
        }

        renderer.dispose();
    });
});
