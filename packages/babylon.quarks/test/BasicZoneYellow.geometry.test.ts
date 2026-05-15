import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {readFileSync} from 'fs';
import {join} from 'path';
import {QuarksLoader} from '../src/QuarksLoader';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';

describe('BasicZoneYellow.json geometry', () => {
    it('loads GlowCircleEmitter with non-empty instancing indices', () => {
        const jsonPath = join(__dirname, '../../../BasicZoneYellow.json');
        const json = JSON.parse(readFileSync(jsonPath, 'utf8'));

        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const root = loader.parse(json);

        const findEmitter = (node: any, name: string): ParticleEmitter | undefined => {
            if (node.name === name && node instanceof ParticleEmitter) {
                return node;
            }
            for (const child of node.getChildren?.() ?? []) {
                const found = findEmitter(child, name);
                if (found) return found;
            }
            return undefined;
        };

        const emitter = findEmitter(root, 'GlowCircleEmitter');
        expect(emitter).toBeDefined();
        const settings = (emitter!.system as ParticleSystem).getRendererSettings();
        expect(settings.instancingIndices.length).toBe(192);
        expect(settings.instancingGeometry.length / 3).toBe(192);

        scene.dispose();
        engine.dispose();
    });
});
