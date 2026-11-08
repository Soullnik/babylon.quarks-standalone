import {ColorGeneratorFromJSON, FunctionColorGenerator} from '../functions';
import type {ColorGeneratorJSON} from '../functions/FunctionJSON';
import {Vector4} from '../math';
import {Particle, TrailParticle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';

/** The JSON of a trail color over length: a {@link ColorOverLength}. */
export interface ColorOverLengthJSON extends BehaviorJSON {
    /** The color along the trail. */
    color: ColorGeneratorJSON;
}

/**
 * Colors a trail along its length: Unity's Trail Renderer Color and the Trails module's Color over
 * Trail.
 *
 * The gradient runs from the head (0) to the tail (1), the trail's oldest sample, and multiplies
 * the color each sample was recorded with (the particle's color at that moment): a gradient from
 * opaque to transparent fades the trail out toward its tail, however the particle is colored. The
 * head itself gets the gradient's value at 0. Like {@link WidthOverLength}, the gradient spans the
 * samples the trail holds now. A trail drawn in its particle's current color
 * (`TrailSettings.colorFromParticle`) does not draw the recorded colors, so this changes nothing
 * there. Applies to trails only.
 */
export class ColorOverLength implements Behavior {
    type = 'ColorOverLength';
    /**
     * Scratch value.
     * @internal
     */
    _temp = new Vector4();

    /** @param color - Color along the trail, head (0) to tail (1), multiplying each sample's color. */
    constructor(public color: FunctionColorGenerator) {}

    initialize(particle: Particle): void {
        this.color.startGen(particle.memory);
    }

    update(particle: Particle): void {
        if (!(particle instanceof TrailParticle)) {
            return;
        }
        const memory = particle.memory;
        const factor = this._temp;
        // The head is recorded after the behaviors run; give it its factor now.
        this.color.genColor(memory, factor, 0);
        const head = particle.headColorScale;
        head[0] = factor.x;
        head[1] = factor.y;
        head[2] = factor.z;
        head[3] = factor.w;
        const count = particle.historyCount;
        if (count === 0) {
            return;
        }
        particle.ensureBaseColorHistory();
        const capacity = particle.historyCapacity;
        const colors = particle.historyColors;
        const baseColors = particle.historyBaseColors;
        const invLength = 1 / count;
        // Oldest first, wrapping by hand, as WidthOverLength walks the widths.
        let slot = particle.getHistoryIndex(0);
        for (let i = 0; i < count; i++) {
            this.color.genColor(memory, factor, (count - i) * invLength);
            const c = slot * 4;
            colors[c] = baseColors[c] * factor.x;
            colors[c + 1] = baseColors[c + 1] * factor.y;
            colors[c + 2] = baseColors[c + 2] * factor.z;
            colors[c + 3] = baseColors[c + 3] * factor.w;
            slot++;
            if (slot === capacity) {
                slot = 0;
            }
        }
    }

    frameUpdate(delta: number): void {
        this.color.refreshTable?.();
    }

    toJSON(): ColorOverLengthJSON {
        return {
            type: this.type,
            color: this.color.toJSON(),
        };
    }

    /** Reads {@link ColorOverLength.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ColorOverLengthJSON): Behavior {
        return new ColorOverLength(ColorGeneratorFromJSON(json.color) as FunctionColorGenerator);
    }

    clone(): Behavior {
        return new ColorOverLength(this.color.clone());
    }

    reset(): void {}
}
