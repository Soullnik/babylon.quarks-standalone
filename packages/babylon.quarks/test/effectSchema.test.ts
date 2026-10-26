/**
 * `schema/effect.schema.json` describes the files this release writes. Every file written today
 * must validate: the golden fixtures and the example effects as saved today, and the Unity
 * exporter's golden output. Every setting a system can write must be named by the schema, and the
 * schema must reject what a reader would warn about.
 */
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import Ajv2020 from 'ajv/dist/2020';
import * as fs from 'fs';
import * as path from 'path';
import {loadPlugin} from 'quarks.core';
import {MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';
import {QuarksLoader} from '../src/QuarksLoader';
import {QUARKS_FORMAT_VERSION, serializeEffect} from '../src/QuarksSerializer';
import {settingJSONKey, SETTINGS} from '../src/system/settingsSchema';

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../schema/effect.schema.json'), 'utf8'));
const validate = new Ajv2020({allErrors: true}).compile(schema);

const errors = (document: unknown): string[] =>
    validate(document) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);

const jsonFiles = (dir: string): string[] =>
    fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(dir, name));

const repo = path.join(__dirname, '../../..');
const fixtures = jsonFiles(path.join(__dirname, 'fixtures'));
const examples = jsonFiles(path.join(repo, 'examples/public')).filter((file) => !file.endsWith('manifest.json'));
const exporterGolden = path.join(repo, 'tools/unity-quarks-exporter/Tests~/golden');
const exporterOutput = [...jsonFiles(exporterGolden), ...jsonFiles(path.join(exporterGolden, 'files'))];

describe('effect schema', () => {
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

    /** `file` loaded and saved again, as this release writes it. */
    const savedToday = (file: string): unknown => {
        const loader = new QuarksLoader(scene, {onFormatWarning: () => {}});
        const root = loader.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
        const saved = JSON.parse(JSON.stringify(serializeEffect(root)));
        QuarksLoader.disposeEffect(root);
        return saved;
    };

    it('is for the format this release writes', () => {
        expect(schema.properties.metadata.properties.quarksFormat.const).toBe(QUARKS_FORMAT_VERSION);
    });

    it.each([...fixtures, ...examples].map((file) => [path.basename(file), file]))(
        '%s, saved today, validates',
        (_name, file) => {
            expect(errors(savedToday(file))).toEqual([]);
        }
    );

    it.each(exporterOutput.map((file) => [path.relative(exporterGolden, file), file]))(
        'the Unity exporter output %s validates',
        (_name, file) => {
            expect(errors(JSON.parse(fs.readFileSync(file, 'utf8')))).toEqual([]);
        }
    );

    it('names every setting a system writes', () => {
        const named = Object.keys(schema.$defs.particleSystem.properties);
        const written = [
            ...SETTINGS.map(settingJSONKey),
            'shape',
            'instancingGeometry',
            'rendererEmitterSettings',
            'material',
            'behaviors',
        ];
        expect(written.filter((key) => !named.includes(key))).toEqual([]);
    });

    describe('rejects', () => {
        /** A document the cases below break, one field at a time. */
        interface Doc {
            metadata: Record<string, unknown>;
            materials: unknown[];
            object?: Record<string, unknown> & {ps?: Record<string, unknown>};
        }
        const valid = (): Doc => ({
            metadata: {version: 4.5, type: 'Object3D', generator: 'test', quarksFormat: QUARKS_FORMAT_VERSION},
            materials: [{uuid: 'm', type: 'QuarksMaterial'}],
            object: {
                uuid: 'e',
                type: 'ParticleEmitter',
                ps: {shape: {type: 'point'}, material: 'm', startLife: {type: 'ConstantValue', value: 2}},
            },
        });

        it('nothing in a minimal valid file', () => {
            expect(errors(valid())).toEqual([]);
        });

        it('nothing in a file that names the schema, which the loader reads without a warning', () => {
            const doc = {$schema: schema.$id, ...valid()};
            expect(errors(doc)).toEqual([]);
            const warnings: string[] = [];
            const root = new QuarksLoader(scene, {onFormatWarning: (w) => warnings.push(String(w))}).parse(doc);
            expect(warnings).toEqual([]);
            QuarksLoader.disposeEffect(root);
        });

        it.each<[string, (doc: Doc) => void]>([
            ['an older format', (doc) => (doc.metadata.quarksFormat = 2)],
            ['a document without a root', (doc) => delete doc.object],
            ['an unknown node type', (doc) => (doc.object!.type = 'Light')],
            ['an emitter without a system', (doc) => delete doc.object!.ps],
            ['a misspelt setting', (doc) => (doc.object!.ps!.startLifetime = {type: 'ConstantValue', value: 1})],
            ['three.quarks’ version line', (doc) => (doc.object!.ps!.version = '3.0')],
            ['an unknown curve type', (doc) => (doc.object!.ps!.startLife = {type: 'Spline', value: 1})],
            ['a curve missing a field', (doc) => (doc.object!.ps!.startLife = {type: 'IntervalValue', a: 1})],
            ['an unknown Scaling Mode', (doc) => (doc.object!.ps!.scalingMode = 'world')],
            ['a shape without a type', (doc) => (doc.object!.ps!.shape = {radius: 1})],
            [
                'a three.js clip track name',
                (doc) => {
                    doc.object = {
                        uuid: 'p',
                        type: 'QuarksPrefab',
                        animationData: [{startTime: 0, duration: 1, type: 'three', targetUUID: 'x', loop: false}],
                    };
                },
            ],
        ])('%s', (_name, change) => {
            const doc = valid();
            change(doc);
            expect(errors(doc)).not.toEqual([]);
        });
    });
});
