import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Quaternion, RotationOverLife, Vector3, Vector4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

test('RotationOverLife spins mesh particles about their local Z', () => {
    const scene = new Scene(new NullEngine());
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        startRotation: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.01, cycle: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Mesh,
    });
    system.addBehavior(new RotationOverLife(new ConstantValue(Math.PI)));
    system.play();
    // 30 steps at π rad/s: a quarter turn.
    for (let i = 0; i < 30; i++) system.update(1 / 60);
    const rotation = system.particles[0].rotation as Quaternion;
    expect(rotation).toBeInstanceOf(Quaternion);
    const forward = new Vector3(1, 0, 0).applyQuaternion(rotation);
    // Emitted at the start of the first step and turned on each of the 30.
    expect(forward.x).toBeCloseTo(0, 1);
    expect(forward.y).toBeCloseTo(1, 1);
    expect(forward.z).toBeCloseTo(0, 5);
    scene.dispose();
});
