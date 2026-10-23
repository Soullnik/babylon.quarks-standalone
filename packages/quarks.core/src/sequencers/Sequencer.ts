import {Vector3} from '../math';
import {describePart, warnFormat} from '../util/JSONUtil';
import {TextureSequencer} from './TextureSequencer';

export interface Sequencer {
    transform(position: Vector3, index: number): void;

    toJSON(): any;

    clone(): Sequencer;
}

/**
 * Reads a sequencer. A type this version does not know warns and gives `undefined`, so the
 * caller can skip that sequence and keep the rest of the behavior.
 */
export function SequencerFromJSON(json: any): Sequencer | undefined {
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
