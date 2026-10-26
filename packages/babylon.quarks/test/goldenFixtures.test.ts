/**
 * Real effect files, as other tools and earlier releases wrote them, in `fixtures/`: three.quarks
 * (`Object3D.toJSON`), the Unity exporter, and the `serializeEffect` of each published babylon.quarks
 * from 0.27.0 on (written from the first ones, one file per format version and release). Images are file names instead of the data URIs the originals embed. Each
 * must load with only the warnings its snapshot holds (an exporter's unembedded texture) and save to
 * the format it holds; a change to what is read or written shows up here as a snapshot diff.
 */
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import * as fs from 'fs';
import * as path from 'path';
import {loadPlugin} from 'quarks.core';
import {MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';
import {QuarksLoader} from '../src/QuarksLoader';
import {serializeEffect} from '../src/QuarksSerializer';

const FIXTURES = path.join(__dirname, 'fixtures');
const fixtures = fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.json'));
const read = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

/**
 * `actual` with each number replaced by the one in `expected` when they agree to 1e-6: a node's
 * matrix goes through a decomposition each save, which moves the last bits of its entries.
 */
function closeTo(actual: unknown, expected: unknown): unknown {
    if (typeof actual === 'number' && typeof expected === 'number') {
        return Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected)) ? expected : actual;
    }
    if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
        const out: Record<string, unknown> = Array.isArray(actual) ? ([] as never) : {};
        for (const key of Object.keys(actual)) {
            out[key] = closeTo((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]);
        }
        return out;
    }
    return actual;
}

describe('golden fixtures', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeAll(() => loadPlugin(MeshSurfaceEmitterPlugin));

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    /** The effect loaded from `json`, saved again, and the format warnings the load gave. */
    const resave = (json: unknown) => {
        const warnings: string[] = [];
        const loader = new QuarksLoader(scene, {onFormatWarning: (message, at) => warnings.push(`${message} @ ${at}`)});
        const root = loader.parse(json);
        const saved = JSON.parse(JSON.stringify(serializeEffect(root)));
        QuarksLoader.disposeEffect(root);
        return {saved, warnings};
    };

    it('has the files from every writer', () => {
        expect(fixtures.map((name) => name.split('.')[0]).sort()).toEqual(
            expect.arrayContaining(['babylon', 'three', 'unity-exporter'])
        );
    });

    it.each(fixtures)('%s loads, with the warnings it has, and saves to the format of today', (name) => {
        const {saved, warnings} = resave(read(name));
        expect({warnings, saved}).toMatchSnapshot();
    });

    it.each(fixtures)('%s saves the same again, warning no more, once loaded from what it saved', (name) => {
        const first = resave(read(name));
        const second = resave(first.saved);
        // The saved file may order its images differently, so only the messages are compared.
        const messages = (warnings: string[]) => warnings.map((warning) => warning.replace(/ @ .*$/, ''));
        expect(messages(second.warnings)).toEqual(messages(first.warnings));
        expect(closeTo(second.saved, first.saved)).toEqual(first.saved);
    });

    // A release's save of an effect, read today, must be the effect its original file is read as
    // today: the format migrations carry each older version to the current meaning.
    const releaseSaves = fixtures
        .filter((name) => name.startsWith('babylon.quarks-'))
        .map((name) => [name, name.split('.').slice(-2)[0]] as const);

    it('has a save from every published release since 0.27', () => {
        const releases = new Set(
            releaseSaves.map(([name]) => name.slice('babylon.quarks-'.length).split('.').slice(0, 3).join('.'))
        );
        expect([...releases].sort()).toEqual(expect.arrayContaining(['0.27.0', '0.28.0', '0.29.0', '0.30.0']));
    });

    it.each(releaseSaves)('%s loads as the file it was written from', (name, effect) => {
        const original = fixtures.find((other) => !other.startsWith('babylon') && other.endsWith(`.${effect}.json`))!;
        const today = resave(read(original)).saved;
        expect(closeTo(resave(read(name)).saved, today)).toEqual(today);
    });
});
