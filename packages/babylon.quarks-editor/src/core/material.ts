import type {ParticleSystem} from 'babylon.quarks';

export interface RendererMaterialPatch {
    blendMode?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    alphaTest?: number;
    texture?: unknown;
}

function isEditableMaterialRecord(material: unknown): material is Record<string, unknown> {
    return !!material && typeof material === 'object' && !('getClassName' in material);
}

/**
 * Babylon alpha mode → three.js `blending`. A QuarksMaterial carries both: `alphaMode` in
 * Babylon's numbering, which `QuarksLoader` prefers, and `blending` in three.js's, so the same
 * file still reads correctly in three.quarks / quarks.art. They are different numbers for the
 * same mode. three.js has no premultiplied constant — there it is normal blending plus a material
 * flag — so ALPHA_PREMULTIPLIED maps to NormalBlending.
 */
function toThreeBlending(alphaMode: number): number {
    switch (alphaMode) {
        case 1: // Constants.ALPHA_ADD
            return 2; // THREE.AdditiveBlending
        case 3: // Constants.ALPHA_SUBTRACT
            return 3; // THREE.SubtractiveBlending
        case 4: // Constants.ALPHA_MULTIPLY
            return 4; // THREE.MultiplyBlending
        default:
            return 1; // THREE.NormalBlending
    }
}

/** Applies renderer material settings and keeps imported QuarksMaterial JSON in sync for export. */
export function applyRendererMaterial(system: ParticleSystem, patch: RendererMaterialPatch): void {
    const settings = system.getRendererSettings();

    if (patch.blendMode !== undefined) {
        system.blending = patch.blendMode;
    }
    if (patch.transparent !== undefined) {
        settings.materialTransparent = patch.transparent;
    }
    if (patch.depthTest !== undefined) {
        settings.materialDepthTest = patch.depthTest;
    }
    if (patch.depthWrite !== undefined) {
        settings.materialDepthWrite = patch.depthWrite;
    }
    if (patch.alphaTest !== undefined) {
        settings.materialAlphaTest = patch.alphaTest;
    }
    if (patch.texture !== undefined) {
        system.texture = patch.texture as never;
    }

    const material = system.material;
    if (isEditableMaterialRecord(material)) {
        if (patch.blendMode !== undefined) {
            material.alphaMode = patch.blendMode;
            material.blending = toThreeBlending(patch.blendMode);
        }
        if (patch.transparent !== undefined) {
            material.transparent = patch.transparent;
        }
        if (patch.depthTest !== undefined) {
            material.depthTest = patch.depthTest;
        }
        if (patch.depthWrite !== undefined) {
            material.depthWrite = patch.depthWrite;
        }
        if (patch.alphaTest !== undefined) {
            material.alphaTest = patch.alphaTest;
        }
        if (patch.texture !== undefined) {
            material.texture = patch.texture;
            material.map = patch.texture;
        }
    }

    system.neededToUpdateRender = true;
}

/** Human-readable label for an imported or live material reference. */
export function getMaterialLabel(material: unknown): string | null {
    if (!material) {
        return null;
    }
    if (isEditableMaterialRecord(material)) {
        const name = typeof material.name === 'string' ? material.name : null;
        const type = typeof material.type === 'string' ? material.type : 'QuarksMaterial';
        return name ? `${name} (${type})` : type;
    }
    const named = material as {name?: string; getClassName?: () => string};
    if (named.name) {
        return named.name;
    }
    if (typeof named.getClassName === 'function') {
        return named.getClassName();
    }
    return 'Material';
}
