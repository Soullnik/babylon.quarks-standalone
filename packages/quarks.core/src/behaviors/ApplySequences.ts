import {Bezier, IntervalValue, ValueGeneratorFromJSON} from '../functions';
import type {IntervalValueJSON} from '../functions/FunctionJSON';
import {Vector3} from '../math';
import {Particle} from '../Particle';
import {Sequencer, SequencerFromJSON, SequencerJSON} from '../sequencers/Sequencer';
import {Behavior, BehaviorJSON} from './Behavior';

/** The JSON of sequences of target points: a {@link ApplySequences}. */
export interface ApplySequencesJSON extends BehaviorJSON {
    /** The delay between particles; 0 when absent. */
    delay?: number;
    /** The sequences, each with the time range it plays in. */
    sequencers?: SequenceJSON[];
}

/** One sequence of an {@link ApplySequences}. */
export interface SequenceJSON {
    /** The time range the sequence plays in, in seconds. */
    range: IntervalValueJSON;
    /** The points it moves particles to. */
    sequencer: SequencerJSON;
}

/** Where one particle is in the sequences. */
interface SequenceState {
    /** The particle's order of emission; it picks the particle's point and delays its moves. */
    id: number;
    /** Where the current move started. */
    begin: Vector3;
    /** Where the current move ends. */
    dst: Vector3;
    /** Whether a move is under way. */
    inMotion: boolean;
}

/**
 * Apply sequences to particles.
 * {@link Sequencer}
 */
export class ApplySequences implements Behavior {
    /** The ease every move between two sequence points follows. */
    static BEZIER: Bezier = new Bezier(0, 0, 1, 1);
    type = 'ApplySequences';
    /** The sequences in time order, each with the time range it plays in. */
    sequencers: Array<[IntervalValue, Sequencer]> = [];

    /**
     * Seconds the behavior has run.
     * @internal
     */
    time = 0;
    /**
     * The sequence playing now.
     * @internal
     */
    index = 0;
    /**
     * Particles seen so far; each takes the next point of a sequence.
     * @internal
     */
    pCount = 0;

    /** Seconds between one particle's start of a move and the next one's. */
    delay: number;
    /**
     * Scratch value.
     * @internal
     */
    tempV: Vector3 = new Vector3();

    constructor(delayBetweenParticles: number) {
        this.delay = delayBetweenParticles;
    }

    /** Each particle's place in the sequences; a pooled particle keeps its entry and reuses it. */
    private readonly states = new WeakMap<Particle, SequenceState>();

    initialize(particle: Particle): void {
        const state = this.states.get(particle);
        if (state) {
            state.id = this.pCount;
            state.inMotion = false;
        } else {
            this.states.set(particle, {id: this.pCount, begin: new Vector3(), dst: new Vector3(), inMotion: false});
        }
        this.pCount++;
    }

    reset() {
        this.time = 0;
        this.index = 0;
        this.pCount = 0;
    }

    update(particle: Particle, delta: number): void {
        const sequencer = this.sequencers[this.index];
        if (sequencer === undefined) {
            // Nothing appended yet (an editor adds the behavior before its sequences).
            return;
        }
        const state = this.states.get(particle);
        if (state === undefined) {
            // Not initialised by this behavior (added after the particle was emitted).
            return;
        }
        const [range, points] = sequencer;
        const delay = state.id * this.delay;
        if (this.time >= range.a + delay && this.time <= range.b + delay) {
            if (!state.inMotion) {
                state.inMotion = true;
                state.begin.copy(particle.position);
                points.transform(state.dst, state.id);
            }
            // A range with no length jumps straight to the point.
            const span = range.b - range.a;
            particle.position.lerpVectors(
                state.begin,
                state.dst,
                ApplySequences.BEZIER.genValue(span > 0 ? (this.time - range.a - delay) / span : 1)
            );
        } else if (this.time > range.b + delay) {
            state.inMotion = false;
        }
    }

    frameUpdate(delta: number): void {
        while (this.index + 1 < this.sequencers.length && this.time >= this.sequencers[this.index + 1][0].a) {
            this.index++;
        }
        this.time += delta;
    }

    /** Adds `sequencer`, played over the time range `range` (its `a` to `b`, in seconds). */
    appendSequencer(range: IntervalValue, sequencer: Sequencer) {
        this.sequencers.push([range, sequencer]);
    }

    toJSON(): ApplySequencesJSON {
        return {
            type: this.type,
            delay: this.delay,
            sequencers: this.sequencers.map(([range, sequencer]) => ({
                range: range.toJSON(),
                sequencer: sequencer.toJSON(),
            })),
        };
    }

    /**
     * Reads {@link ApplySequences.toJSON} output; a sequence of a type this version does not know
     * is skipped.
     */
    static fromJSON(json: ApplySequencesJSON): Behavior {
        const seq = new ApplySequences(typeof json.delay === 'number' ? json.delay : 0);
        (Array.isArray(json.sequencers) ? json.sequencers : []).forEach((sequencerJson) => {
            const sequencer = SequencerFromJSON(sequencerJson.sequencer);
            if (sequencer !== undefined) {
                seq.sequencers.push([ValueGeneratorFromJSON(sequencerJson.range) as IntervalValue, sequencer]);
            }
        });
        return seq;
    }

    clone(): Behavior {
        const applySequences = new ApplySequences(this.delay);
        applySequences.sequencers = this.sequencers.map((seq) => [seq[0].clone() as IntervalValue, seq[1].clone()]);
        return applySequences;
    }
}
