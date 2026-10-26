import type {QuarksNodeJSON} from './QuarksSerializer';

// The upgrades an effect file goes through as it is read, one per format version that changed
// what a file means, as Unity upgrades an asset written by an older version on import. Each step
// turns a document of the version before into one of its own, so a file of any version reaches
// the current one through every step after it, and a reader only has to know today's meaning.
//
// A step changes meaning only. Older ways of writing the same thing, such as a burst's
// `cycleCount` or a numeric flag, stay accepted by the readers themselves, since a system's or a
// behavior's JSON can also be read on its own, outside a document.

/** One format version's upgrade of the nodes of a document written before it. */
interface FormatMigration {
    /** The version this step upgrades to. */
    readonly to: number;
    /** Upgrades `node`, a copy the step may change; children are visited separately. */
    node(node: QuarksNodeJSON): void;
}

/** The steps, in version order. A version that only added fields, as 1 did, has none. */
export const FORMAT_MIGRATIONS: ReadonlyArray<FormatMigration> = [
    {
        // 0.29: Scaling Mode took Unity's meaning, with 'local' as the default. Before it, the
        // emitter's whole world scale reached every system's shape and particle size, and a
        // local-space system's motion too, which is what 'hierarchy' now does.
        to: 2,
        node(node) {
            if (node.type === 'ParticleEmitter' && isRecord(node.ps) && node.ps.scalingMode !== 'hierarchy') {
                node.ps = {...node.ps, scalingMode: 'hierarchy'};
            }
        },
    },
    {
        // 1.0: a prefab's clip track is 'clip' (three.quarks and 0.29 wrote 'three'), and a
        // system no longer carries three.quarks' `version`.
        to: 3,
        node(node) {
            if (node.type === 'QuarksPrefab' && Array.isArray(node.animationData)) {
                node.animationData = node.animationData.map((track) =>
                    isRecord(track) && track.type === 'three' ? {...track, type: 'clip'} : track
                );
            }
            if (node.type === 'ParticleEmitter' && isRecord(node.ps) && 'version' in node.ps) {
                const {version: _version, ...ps} = node.ps;
                node.ps = ps;
            }
        },
    },
];

/**
 * `document` upgraded from the format version it was written in, `from` (0 for a file without
 * one), to the newest step: its node tree is copied where a step changes it, and the rest of the
 * document is shared, not copied. A document of the current version or newer is returned as it
 * is.
 */
export function upgradeEffectNodes<T extends {object: QuarksNodeJSON}>(document: T, from: number): T {
    const steps = FORMAT_MIGRATIONS.filter((step) => step.to > from);
    if (steps.length === 0) {
        return document;
    }
    const visit = (node: QuarksNodeJSON): QuarksNodeJSON => {
        if (!isRecord(node)) {
            return node;
        }
        const copy: QuarksNodeJSON = {...node};
        for (const step of steps) {
            step.node(copy);
        }
        if (Array.isArray(copy.children)) {
            copy.children = copy.children.map(visit);
        }
        return copy;
    };
    return {...document, object: visit(document.object)};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
