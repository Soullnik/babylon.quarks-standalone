import type {Vector2JSON, Vector3ArrayJSON, Vector3JSON} from '../functions/FunctionJSON';
import type {Vector3Like} from '../Like';
import {Vector2, Vector3} from '../math';
import {vector3From} from '../math/fromLike';
import type {Sequencer} from './Sequencer';

/**
 * The JSON of a {@link TextureSequencer}. Files before 0.28 have no `type` and write the position
 * as an object.
 */
export interface TextureSequencerJSON {
    /** The sequencer's type. */
    type?: 'TextureSequencer';
    /** World units per pixel along x. */
    scaleX?: number;
    /** World units per pixel along y. */
    scaleY?: number;
    /** Where the image's origin lands. */
    position?: Vector3ArrayJSON | Vector3JSON;
    /** The pixel coordinates of the points. */
    locations?: Vector2JSON[];
}

/**
 * Target points read from an image: one point per pixel whose alpha passes a threshold, so
 * particles gather into the picture.
 */
export class TextureSequencer implements Sequencer {
    /** The pixel coordinates read from the image, y up. */
    locations: Vector2[] = [];

    private _positionValue: Vector3;

    /**
     * Where the image's origin lands.
     * Set it from any `Vector3Like`, such as a Babylon `Vector3`; the value is copied.
     */
    get position(): Vector3 {
        return this._positionValue;
    }

    set position(value: Vector3Like) {
        this._positionValue = vector3From(value);
    }

    /**
     * @param scaleX - World units per pixel along x.
     * @param scaleY - World units per pixel along y.
     * @param position - Where the image's origin lands.
     */
    constructor(
        public scaleX: number = 0,
        public scaleY: number = 0,
        position: Vector3Like = new Vector3()
    ) {
        this._positionValue = vector3From(position);
    }
    /**
     * Writes into `position` the point for particle `index`, wrapping around the points; leaves it
     * as it is when there are none.
     */
    transform(position: Vector3, index: number) {
        const count = this.locations.length;
        if (count === 0) {
            // Nothing sampled yet (`fromImage` not called, or an empty file): the particle stays put.
            return;
        }
        const location = this.locations[index % count];
        position.x = location.x * this.scaleX + this.position.x;
        position.y = location.y * this.scaleY + this.position.y;
        position.z = this.position.z;
    }

    /**
     * Reads {@link TextureSequencer.toJSON} output, and the object position files before 0.28
     * wrote.
     */
    static fromJSON(json: TextureSequencerJSON): Sequencer {
        // Before 0.28 the position was written as a Vector3 object ({x, y, z}) instead of an array.
        const p = json.position;
        const position = Array.isArray(p)
            ? new Vector3(p[0], p[1], p[2])
            : new Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
        const textureSequencer = new TextureSequencer(json.scaleX ?? 0, json.scaleY ?? 0, position);
        textureSequencer.locations = (json.locations ?? []).map((loc) => new Vector2(loc.x, loc.y));
        return textureSequencer;
    }

    /** A copy with its own points. */
    clone(): Sequencer {
        const textureSequencer = new TextureSequencer(this.scaleX, this.scaleY, this.position.clone());
        textureSequencer.locations = this.locations.map((loc) => loc.clone());
        return textureSequencer;
    }

    /** The JSON form, `{type: 'TextureSequencer', scaleX, scaleY, position, locations}`. */
    toJSON(): TextureSequencerJSON {
        return {
            type: 'TextureSequencer',
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            position: [this.position.x, this.position.y, this.position.z],
            locations: this.locations.map((loc) => ({
                x: loc.x,
                y: loc.y,
            })),
        };
    }

    /**
     * Replaces {@link TextureSequencer.locations} with the pixels of `img` whose alpha is above
     * `threshold` (0–255). Needs a DOM, for its canvas.
     */
    fromImage(img: CanvasImageSource, threshold: number) {
        // Create an empty canvas element
        const canvas = document.createElement('canvas');
        canvas.width = (img as HTMLCanvasElement).width;
        canvas.height = (img as HTMLCanvasElement).height;

        // Copy the image contents to the canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height, {colorSpace: 'srgb'});
        canvas.remove();

        this.locations.length = 0;
        for (let i = 0; i < data.height; i++) {
            for (let j = 0; j < data.width; j++) {
                if (data.data[(i * data.width + j) * 4 + 3] > threshold) {
                    this.locations.push(new Vector2(j, data.height - i));
                }
            }
        }
        //return data;
        // Get the data-URL formatted image
        // Firefox supports PNG and JPEG. You could check img.src to
        // guess the original format, but be aware the using "image/jpg"
        // will re-encode the image.
        //var dataURL = canvas.toDataURL("image/png");

        //return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
    }
}
