import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {currentFormatPath, QuarksFormatError, readFormat, readFormatPart, warnFormat} from 'quarks.core';
import {QuarksLoader} from '../src/QuarksLoader';

/** An effect with a group holding a good emitter and one whose second behavior is unknown. */
const effect = () => ({
    object: {
        uuid: 'root',
        type: 'Group',
        children: [
            {uuid: 'a', type: 'ParticleEmitter', ps: {shape: {type: 'point'}}},
            {
                uuid: 'b',
                type: 'ParticleEmitter',
                ps: {
                    shape: {type: 'point'},
                    behaviors: [{type: 'SizeOverLife', size: {type: 'ConstantValue', value: 1}}, {type: 'Bogus'}],
                },
            },
        ],
    },
});

describe('format warnings', () => {
    let engine: NullEngine;
    let scene: Scene;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('name the JSON path of the part they are about', () => {
        new QuarksLoader(scene).parse(effect());
        expect(warn).toHaveBeenCalledWith(
            '[quarks] Unknown behavior "Bogus"; it is skipped. (at object.children[1].ps.behaviors[1])'
        );
    });

    it('name the setting of a system and the shape', () => {
        const json = effect();
        json.object.children[0].ps = {shape: {type: 'nope'}, startLife: {type: 'Wobbly'}} as never;
        new QuarksLoader(scene).parse(json);
        const messages = warn.mock.calls.map(([message]) => message as string);
        expect(messages).toContainEqual(expect.stringContaining('(at object.children[0].ps.shape)'));
        expect(messages).toContainEqual(expect.stringContaining('(at object.children[0].ps.startLife)'));
    });

    it('go to onFormatWarning with the path instead of the console', () => {
        const seen: Array<[string, string]> = [];
        new QuarksLoader(scene, {onFormatWarning: (message, path) => seen.push([message, path])}).parse(effect());
        expect(seen).toEqual([['Unknown behavior "Bogus"; it is skipped.', 'object.children[1].ps.behaviors[1]']]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('make a strict load throw, and leave nothing of the effect in the scene', () => {
        const before = {nodes: scene.transformNodes.length, meshes: scene.meshes.length};
        expect(() => new QuarksLoader(scene, {strict: true}).parse(effect())).toThrow(
            new QuarksFormatError('Unknown behavior "Bogus"; it is skipped. (at object.children[1].ps.behaviors[1])')
        );
        expect({nodes: scene.transformNodes.length, meshes: scene.meshes.length}).toEqual(before);
        expect(warn).not.toHaveBeenCalled();
    });

    it('let a strict load of a clean effect through', () => {
        const json = effect();
        json.object.children[1].ps.behaviors!.pop();
        expect(new QuarksLoader(scene, {strict: true}).parse(json).getChildren()).toHaveLength(2);
    });

    it('name the system a link it cannot make belongs to', () => {
        const json = effect();
        json.object.children[1].ps.behaviors = [{type: 'EmitSubParticleSystem', subParticleSystem: 'gone'}] as never;
        const seen: string[] = [];
        new QuarksLoader(scene, {onFormatWarning: (_message, path) => seen.push(path)}).parse(json);
        expect(seen).toEqual(['object.children[1].ps']);
    });

    it('list every failure of a strict load on the error', () => {
        const json = effect();
        json.object.children[0].ps = {shape: {type: 'nope'}} as never;
        try {
            new QuarksLoader(scene, {strict: true}).parse(json);
            throw new Error('did not throw');
        } catch (error) {
            expect((error as QuarksFormatError).problems).toEqual([
                expect.stringContaining('(at object.children[0].ps.shape)'),
                expect.stringContaining('(at object.children[1].ps.behaviors[1])'),
            ]);
        }
    });

    it('count the other failures in a strict load', () => {
        const json = effect();
        json.object.children[0].ps = {shape: {type: 'nope'}} as never;
        expect(() => new QuarksLoader(scene, {strict: true}).parse(json)).toThrow('(and 1 more)');
    });

    it('report the links a sub emitter or the format version leaves unread', () => {
        const json = {
            metadata: {quarksFormat: 99},
            object: {
                uuid: 'e',
                type: 'ParticleEmitter',
                ps: {shape: {type: 'point'}, behaviors: [{type: 'EmitSubParticleSystem', subParticleSystem: 'gone'}]},
            },
        };
        const seen: string[] = [];
        new QuarksLoader(scene, {onFormatWarning: (message) => seen.push(message)}).parse(json);
        expect(seen).toEqual([expect.stringContaining('format 99'), expect.stringContaining('targeting "gone"')]);
    });
});

describe('readFormat', () => {
    it('restores the options and path of the read around it', () => {
        const outer: string[] = [];
        const inner: string[] = [];
        readFormat({onWarning: (_m, path) => outer.push(path)}, () =>
            readFormatPart('a', () => {
                readFormat({onWarning: (_m, path) => inner.push(path)}, () =>
                    readFormatPart('[0]', () => warnFormat('x'))
                );
                expect(currentFormatPath()).toBe('a');
                warnFormat('y');
            })
        );
        expect(inner).toEqual(['[0]']);
        expect(outer).toEqual(['a']);
        expect(currentFormatPath()).toBe('');
    });

    it('throws in a strict read, with the path', () => {
        expect(() => readFormat({strict: true}, () => readFormatPart('ps', () => warnFormat('bad')))).toThrow(
            new QuarksFormatError('bad (at ps)')
        );
    });
});
