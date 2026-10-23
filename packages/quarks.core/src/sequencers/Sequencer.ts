import {Vector3} from '../math';
import {describePart, warnFormat} from '../util/JSONUtil';
import {TextureSequencer, TextureSequencerJSON} from './TextureSequencer';

/** The JSON of a sequencer. */
export type SequencerJSON = TextureSequencerJSON;

/**
 * A set of target points that {@link ApplySequences} moves particles to, one point per particle.
 */
export interface Sequencer {
    /** Writes the target of the particle with index `index` into `position`. */
    transform(position: Vector3, index: number): void;

    /** The sequencer's JSON. */
    toJSON(): SequencerJSON;

    /** A copy with the same points. */
    clone(): Sequencer;
}

/**
 * Reads a sequencer. A type this version does not know warns and gives `undefined`, so the
 * caller can skip that sequence and keep the rest of the behavior.
 */
export function SequencerFromJSON(json: SequencerJSON | undefined | null): Sequencer | undefined {
    switch (json?.type) {
        // Files written before 0.28 have no type; TextureSequencer was the only kind.
        case undefined:
            if (json === undefined || json === null) {
                warnFormat(`${describePart('sequencer', json)}; skipping it.`);
                return undefined;
            }
            return TextureSequencer.fromJSON(json);
        case 'TextureSequencer':
            return TextureSequencer.fromJSON(json);
        default:
            warnFormat(`${describePart('sequencer', json)}; skipping it.`);
            return undefined;
    }
}
