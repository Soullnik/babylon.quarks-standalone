import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {FunctionValueGenerator, ParticleSystem, ValueGenerator} from 'babylon.quarks';
import {ConstantValue, IntervalValue} from 'babylon.quarks';
import type {EffectBinding} from './binding.js';
import type {EffectTreeNode} from './effectTree.js';

/** Guards against a literally zero-width ruler (e.g. no tracks yet) — not a usability stretch. */
const MIN_TIMELINE_SPAN = 0.01;

/** A timeline row for a group node: a heading over the tracks of the systems under it. */
export interface TimelineGroupRow {
    /** Tells group rows from track rows. */
    kind: 'group';
    /** The group's node. */
    node: TransformNode;
    /** The group's name. */
    name: string;
    /** How deep the group sits in the effect tree; the root's children are 0. */
    depth: number;
}

/** A timeline row for one particle system: a bar from its start delay over its duration. */
export interface TimelineSystemRow {
    /** Tells group rows from track rows. */
    kind: 'track';
    /** The system's emitter node. */
    node: TransformNode;
    /** The system. */
    system: ParticleSystem;
    /** The emitter's name. */
    name: string;
    /** How deep the emitter sits in the effect tree. */
    depth: number;
    /** True for the effect's main system. */
    isRoot: boolean;
    /** False for the one system an effect cannot lose. */
    removable: boolean;
    /** Where the bar starts: the start delay, its lower end when random, in seconds. */
    startOffset: number;
    /** True when the start delay is a curve and the bar's start is only indicative. */
    startOffsetVariable: boolean;
    /** The bar's length, the system's duration in seconds. */
    duration: number;
    /** True when the system loops; its bar runs to the end of the ruler. */
    looping: boolean;
}

/** One row of the focused effect's timeline. */
export type TimelineRow = TimelineGroupRow | TimelineSystemRow;

/**
 * Reads a representative start-delay value for display without invoking the generator's
 * stateful `genValue` (IntervalValue caches its sampled slot on first call and returns NaN
 * on a later call with a fresh memory array, so it can't be safely re-read on every render).
 */
export function computeStartOffset(gen: ValueGenerator | FunctionValueGenerator): {
    value: number;
    startOffsetVariable: boolean;
} {
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
    const rate = system.emissionOverTime instanceof ConstantValue ? system.emissionOverTime.value : null;
    const perMeter = system.emissionOverDistance instanceof ConstantValue ? system.emissionOverDistance.value : null;
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
