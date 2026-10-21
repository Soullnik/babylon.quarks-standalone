import {
    EmitSubParticleSystem,
    IEmitter,
    IParticleSystem,
    Matrix4,
    SpriteParticle,
    SubParticleEmitMode,
} from '../../src';

function setup(mode: SubParticleEmitMode, disposed = false) {
    const translations: number[][] = [];
    const target = {
        duration: 10,
        isDisposed: disposed,
        emit: (_delta: number, _state: unknown, matrix: Matrix4) =>
            translations.push([matrix.elements[12], matrix.elements[13], matrix.elements[14]]),
    };
    const ps = {worldSpace: true, emitter: {matrixWorld: new Matrix4()}} as unknown as IParticleSystem;
    const behavior = new EmitSubParticleSystem(ps, false, {system: target} as unknown as IEmitter, mode);
    const particle = new SpriteParticle();
    particle.life = 1;
    particle.age = 0;
    particle.serial = 1;
    particle.position.set(5, 0, 0);
    return {behavior, particle, translations};
}

describe('EmitSubParticleSystem', () => {
    test('follows its parent while it lives', () => {
        const {behavior, particle, translations} = setup(SubParticleEmitMode.Birth);
        behavior.update(particle, 1 / 60);
        particle.position.set(6, 0, 0);
        particle.age = 0.1;
        behavior.frameUpdate(1 / 60);
        expect(translations[translations.length - 1]).toEqual([6, 0, 0]);
    });

    test('stops following when the parent object is reused for a newborn', () => {
        const {behavior, particle, translations} = setup(SubParticleEmitMode.Birth);
        behavior.update(particle, 1 / 60);
        // The parent died; the system reused its object for a new particle at the origin.
        particle.serial = 2;
        particle.age = 0;
        particle.position.set(0, 0, 0);
        behavior.frameUpdate(1 / 60);
        expect(translations[translations.length - 1]).toEqual([5, 0, 0]);
    });

    test('a Death emission stays where the parent died', () => {
        const {behavior, particle, translations} = setup(SubParticleEmitMode.Death);
        particle.age = 0.99;
        behavior.update(particle, 1 / 60);
        particle.serial = 2;
        particle.age = 0;
        particle.position.set(0, 0, 0);
        behavior.frameUpdate(1 / 60);
        behavior.frameUpdate(1 / 60);
        expect(translations).toEqual([
            [5, 0, 0],
            [5, 0, 0],
        ]);
    });

    test('emits nothing into a disposed target', () => {
        const {behavior, particle, translations} = setup(SubParticleEmitMode.Frame, true);
        behavior.update(particle, 1 / 60);
        behavior.frameUpdate(1 / 60);
        expect(translations).toEqual([]);
    });
});
