import {Behavior, FusionStep, planBehaviorFusion} from 'quarks.core';

/** Built-in behaviors that write a particle's size / colour, and those that touch neither. */
const SIZE_BEHAVIORS = new Set(['SizeOverLife', 'SizeBySpeed']);
const COLOR_BEHAVIORS = new Set(['ColorOverLife', 'ColorBySpeed']);
const INERT_FOR_SIZE_AND_COLOR = new Set([
    'ApplyForce',
    'Noise',
    'TurbulenceField',
    'GravityForce',
    'RotationOverLife',
    'Rotation3DOverLife',
    'RotationBySpeed',
    'SpeedOverLife',
    'FrameOverLife',
    'ForceOverLife',
    'VelocityOverLife',
    'InheritVelocity',
    'OrbitOverLife',
    'WidthOverLength',
    'ChangeEmitDirection',
    'EmitSubParticleSystem',
    'LimitSpeedOverLife',
    'ApplyCollision',
]);

/**
 * How a {@link ParticleSystem}'s behaviors run each step: consecutive behaviors that can be compiled
 * into one loop are merged, and the plan records whether any of them can change a particle's size
 * or colour after birth.
 */
export class BehaviorPlan {
    /** Behaviors the cached plan was built from, compared by identity. */
    private plan?: Array<Behavior>;
    private fusionSteps: Array<FusionStep> = [];
    /**
     * Whether any behavior in the plan can change a particle's size or colour
     * after birth. Only then does a step have to snapshot them for the renderer.
     */
    changesSize = true;
    changesColor = true;

    /**
     * Execution plan for this system's behaviors, rebuilt when the list changes.
     *
     * Consecutive behaviors that can be compiled into one loop are merged, so
     * the particles are walked once instead of once per behavior. The plan is
     * keyed on the behavior instances, not their types: swapping one out has to
     * change the generated code's indices.
     */
    steps(behaviors: Array<Behavior>): Array<FusionStep> {
        const cached = this.plan;
        if (cached !== undefined && cached.length === behaviors.length) {
            let same = true;
            for (let i = 0; i < behaviors.length; i++) {
                if (cached[i] !== behaviors[i]) {
                    same = false;
                    break;
                }
            }
            if (same) {
                return this.fusionSteps;
            }
        }
        this.plan = behaviors.slice();
        this.fusionSteps = planBehaviorFusion(behaviors);
        let changesSize = false;
        let changesColor = false;
        for (let i = 0; i < behaviors.length; i++) {
            const type = behaviors[i].type;
            if (SIZE_BEHAVIORS.has(type)) {
                changesSize = true;
            } else if (COLOR_BEHAVIORS.has(type)) {
                changesColor = true;
            } else if (!INERT_FOR_SIZE_AND_COLOR.has(type)) {
                // Unknown to this list, so it may write anything.
                changesSize = true;
                changesColor = true;
            }
        }
        this.changesSize = changesSize;
        this.changesColor = changesColor;
        return this.fusionSteps;
    }
}
