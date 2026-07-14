import type {ParticleSystem} from 'babylon.quarks';
import {ConstantValue, IntervalValue} from 'babylon.quarks';
import type {FunctionValueGenerator, ValueGenerator} from 'babylon.quarks';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {EffectBinding} from './binding';
import type {EffectTreeNode} from './effectTree';

/** Guards against a literally zero-width ruler (e.g. no tracks yet) — not a usability stretch. */
const MIN_TIMELINE_SPAN = 0.01;

export type TimelineRow =
    | {kind: 'group'; node: TransformNode; name: string; depth: number}
    | {
          kind: 'track';
          node: TransformNode;
          system: ParticleSystem;
          name: string;
          depth: number;
          isRoot: boolean;
          removable: boolean;
          startOffset: number;
          startOffsetVariable: boolean;
          duration: number;
          looping: boolean;
      };

/**
 * Reads a representative start-delay value for display without invoking the generator's
 * stateful `genValue` (IntervalValue caches its sampled slot on first call and returns NaN
 * on a later call with a fresh memory array, so it can't be safely re-read on every render).
 */
export function computeStartOffset(gen: ValueGenerator | FunctionValueGenerator): {value: number; startOffsetVariable: boolean} {
    if (gen instanceof ConstantValue) {
        return {value: gen.value, startOffsetVariable: false};
    }
    if (gen instanceof IntervalValue) {
        return {value: Math.min(gen.a, gen.b), startOffsetVariable: false};
    }
    return {value: 0, startOffsetVariable: true};
}

/**
 * Whether a track can be removed. Sub-systems always can; the designated "main" system can
 * too as long as another top-level system remains to take over that role — being main vs.
 * sub is an internal bookkeeping detail (see EffectBinding.promoteToMain), not something that
 * should make one arbitrary track permanently un-deletable in the UI.
 */
function isRemovable(binding: EffectBinding, system: ParticleSystem): boolean {
    if (binding.subSystems.includes(system)) {
        return true;
    }
    if (system === binding.system) {
        return binding.subSystems.some((s) => !s.onlyUsedByOther);
    }
    return false;
}

/** Flattens the effect's group/emitter tree into display rows, preserving tree-walk order. */
export function computeTimelineRows(binding: EffectBinding): TimelineRow[] {
    const rows: TimelineRow[] = [];
    const walk = (node: EffectTreeNode) => {
        if (node.system) {
            const {value, startOffsetVariable} = computeStartOffset(node.system.startDelay);
            rows.push({
                kind: 'track',
                node: node.node,
                system: node.system,
                name: node.name,
                depth: node.depth,
                isRoot: node.node === binding.root,
                removable: isRemovable(binding, node.system),
                startOffset: value,
                startOffsetVariable,
                duration: node.system.duration,
                looping: node.system.looping,
            });
        } else {
            rows.push({kind: 'group', node: node.node, name: node.name, depth: node.depth});
        }
        node.children.forEach(walk);
    };
    walk(binding.getTree());
    return rows;
}

/** Upper bound on startLife for timeline span (burst/one-shot tail). */
function estimateMaxStartLife(system: ParticleSystem): number {
    const life = system.startLife;
    if (life instanceof ConstantValue) {
        return Math.max(0, life.value);
    }
    if (life instanceof IntervalValue) {
        return Math.max(life.a, life.b);
    }
    return 1;
}

/** When emission is burst-only, the effect window ends at the last burst time, not full duration. */
function estimateEmissionEnd(system: ParticleSystem): number {
    const rate =
        system.emissionOverTime instanceof ConstantValue ? system.emissionOverTime.value : null;
    const perMeter =
        system.emissionOverDistance instanceof ConstantValue ? system.emissionOverDistance.value : null;
    if ((rate != null && rate > 0) || (perMeter != null && perMeter > 0)) {
        return system.duration;
    }
    if (system.emissionBursts.length === 0) {
        return system.duration;
    }
    return Math.max(...system.emissionBursts.map((burst) => burst.time));
}

/**
 * Overall timeline ruler span — worst-case visual tail per track (max startLife, last burst).
 * Actual playback often ends earlier when interval lives sample short or tracks finish out of phase.
 */
export function computeTimelineSpan(rows: TimelineRow[]): number {
    let span = 0;
    for (const row of rows) {
        if (row.kind !== 'track') {
            continue;
        }
        span = Math.max(span, row.startOffset + estimateEmissionEnd(row.system) + estimateMaxStartLife(row.system));
    }
    return Math.max(span, MIN_TIMELINE_SPAN);
}
