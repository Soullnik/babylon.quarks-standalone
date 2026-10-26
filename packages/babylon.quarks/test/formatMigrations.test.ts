import {FORMAT_MIGRATIONS, upgradeEffectNodes} from '../src/formatMigrations';
import {QUARKS_FORMAT_VERSION, QuarksNodeJSON} from '../src/QuarksSerializer';

/** A document whose root holds `children`. */
const document = (...children: QuarksNodeJSON[]) => ({
    object: {uuid: 'root', type: 'Group', children} as QuarksNodeJSON,
});
const emitter = (ps: Record<string, unknown>): QuarksNodeJSON =>
    ({uuid: 'e', type: 'ParticleEmitter', ps}) as unknown as QuarksNodeJSON;
const prefab = (types: string[]): QuarksNodeJSON =>
    ({
        uuid: 'p',
        type: 'QuarksPrefab',
        animationData: types.map((type, i) => ({type, start: i, duration: 1})),
    }) as unknown as QuarksNodeJSON;

describe('format migrations', () => {
    it('step through every version that changed meaning, ending at the current one', () => {
        const versions = FORMAT_MIGRATIONS.map((step) => step.to);
        expect(versions).toEqual([...versions].sort((a, b) => a - b));
        expect(new Set(versions).size).toBe(versions.length);
        expect(versions[versions.length - 1]).toBe(QUARKS_FORMAT_VERSION);
    });

    it('give a system from before format 2 the Scaling Mode that keeps its look', () => {
        for (const from of [0, 1]) {
            const upgraded = upgradeEffectNodes(document(emitter({scalingMode: 'local'}), emitter({})), from);
            expect(upgraded.object.children!.map((node) => node.ps!.scalingMode)).toEqual(['hierarchy', 'hierarchy']);
        }
    });

    it('leave a format 2 system its Scaling Mode', () => {
        const upgraded = upgradeEffectNodes(document(emitter({})), 2);
        expect(upgraded.object.children![0].ps!.scalingMode).toBeUndefined();
    });

    it("name a prefab's 'three' track 'clip' and drop three.quarks' version, below format 3", () => {
        const upgraded = upgradeEffectNodes(
            document(prefab(['three', 'ps', 'clip']), emitter({version: '3.0', looping: false})),
            2
        );
        const [p, e] = upgraded.object.children!;
        expect(p.animationData!.map((track) => track.type)).toEqual(['clip', 'ps', 'clip']);
        expect(e.ps).toEqual({looping: false});
    });

    it('reach nested nodes', () => {
        const nested = document({uuid: 'g', type: 'Group', children: [emitter({})]} as QuarksNodeJSON);
        const upgraded = upgradeEffectNodes(nested, 1);
        expect(upgraded.object.children![0].children![0].ps!.scalingMode).toBe('hierarchy');
    });

    it('copy what they change and leave the document they were given as it was', () => {
        const original = document(emitter({version: '3.0'}), prefab(['three']));
        const before = JSON.stringify(original);
        const upgraded = upgradeEffectNodes(original, 0);
        expect(JSON.stringify(original)).toBe(before);
        expect(upgraded).not.toBe(original);
    });

    it('return a document of the current format or newer as it is', () => {
        const current = document(emitter({}));
        expect(upgradeEffectNodes(current, QUARKS_FORMAT_VERSION)).toBe(current);
        expect(upgradeEffectNodes(current, QUARKS_FORMAT_VERSION + 1)).toBe(current);
    });

    it('pass over a node that is not an object, for its reader to warn about', () => {
        const odd = {object: {uuid: 'root', type: 'Group', children: [null, 'x']} as unknown as QuarksNodeJSON};
        expect(upgradeEffectNodes(odd, 0).object.children).toEqual([null, 'x']);
    });
});
