import {Particle} from '../Particle';
import {Bezier, IntervalValue, ValueGeneratorFromJSON} from '../functions';
import {Vector3} from '../math';
import {Sequencer, SequencerFromJSON} from '../sequencers/Sequencer';
import {Behavior} from './Behavior';

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

    initialize(particle: Particle): void {
        (particle as any).id = this.pCount;
        (particle as any).dst = new Vector3();
        (particle as any).begin = new Vector3();
        (particle as any).inMotion = false;
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
        const delay = (particle as any).id * this.delay;
        if (this.time >= sequencer[0].a + delay && this.time <= sequencer[0].b + delay) {
            if (!(particle as any).inMotion) {
                (particle as any).inMotion = true;
                (particle as any).begin.copy((particle as any).position);
                sequencer[1].transform((particle as any).dst, (particle as any).id);
            }
            particle.position.lerpVectors(
                (particle as any).begin,
                (particle as any).dst,
                ApplySequences.BEZIER.genValue((this.time - sequencer[0].a - delay) / (sequencer[0].b - sequencer[0].a))
            );
        } else if (this.time > sequencer[0].b + delay) {
            (particle as any).inMotion = false;
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

    toJSON(): any {
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
    static fromJSON(json: any): Behavior {
        const seq = new ApplySequences(typeof json.delay === 'number' ? json.delay : 0);
        (Array.isArray(json.sequencers) ? json.sequencers : []).forEach((sequencerJson: any) => {
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
