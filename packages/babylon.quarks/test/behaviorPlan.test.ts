import {ApplyForce, Behavior, ConstantValue, Particle, PiecewiseBezier, SizeOverLife} from 'quarks.core';
import {BehaviorPlan} from '../src/system/BehaviorPlan';

/** A custom behavior that borrows a built-in's type string but writes the colour. */
class PaintingForce extends ApplyForce {
    update(particle: Particle, delta: number): void {
        super.update(particle, delta);
        particle.color.w = 0.5;
    }
}

describe('BehaviorPlan', () => {
    const force = () => new ApplyForce({x: 0, y: 1, z: 0}, new ConstantValue(1));

    it('knows a built-in force writes neither size nor colour', () => {
        const plan = new BehaviorPlan();
        plan.steps([force()]);
        expect([plan.changesSize, plan.changesColor]).toEqual([false, false]);
        plan.steps([force(), new SizeOverLife(new PiecewiseBezier())]);
        expect([plan.changesSize, plan.changesColor]).toEqual([true, false]);
    });

    it('assumes a custom behavior writes anything, whatever its type says', () => {
        const plan = new BehaviorPlan();
        const painting: Behavior = new PaintingForce({x: 0, y: 1, z: 0}, new ConstantValue(1));
        expect(painting.type).toBe('ApplyForce');
        plan.steps([painting]);
        expect([plan.changesSize, plan.changesColor]).toEqual([true, true]);
    });
});
