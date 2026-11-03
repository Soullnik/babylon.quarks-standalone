import type {DemoContext, DemoModule} from '../types';
import {buildStage, type FxDef, updateStage} from './stage';

/**
 * A gallery demo for one category: every effect on its own pad, one-shots replayed, a click on a
 * pad to look closer. The effects are original quarks systems modelled on the descriptions in
 * pixelfx (https://github.com/patch-gg/pixelfx, MIT) and Sprite Fusion's open-source pixel art VFX
 * (https://www.spritefusion.com/pixel-art-vfx, MIT). No code or art is copied from either; the fire
 * palette's colour stops follow pixelfx's.
 */
export function galleryDemo(defs: FxDef[]): Required<DemoModule> {
    return {
        init(ctx: DemoContext) {
            ctx.demoState.pixelfx = buildStage(ctx, defs);
        },
        update(ctx: DemoContext, delta: number) {
            updateStage(ctx.demoState.pixelfx, ctx, delta);
        },
    };
}
