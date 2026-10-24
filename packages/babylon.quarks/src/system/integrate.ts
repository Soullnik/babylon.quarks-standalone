import {
    Behavior,
    FusionStep,
    Matrix4,
    Particle,
    ParticleStore,
    RendererEmitterSettings,
    TrailParticle,
    TrailSettings,
    Vector3,
} from 'quarks.core';
import type {VFXBatchSettings} from '../BatchedRenderer';
import {trailLifetime, trailMinVertexDistance} from '../trailSettings';
import type {BoundsTracker} from './BoundsTracker';
import {SIMULATION_STEP} from './SimulationClock';

// The passes of one simulation step after emission: the snapshot the renderer extrapolates
// from, the behaviors, then the motion, ageing and removal of the sprite path (one pass over
// the store's columns) or of the trail path (over the particle objects their history lives on).
// Plain functions over the store and the particle array, so the hot loops stay monomorphic.

/** Particle backed by a {@link ParticleStore} row, as a system always creates. */
type StoreBackedParticle = Particle & {storeIndex: number; setStoreIndex(index: number): void};

/** Called with each particle that died this step, when the system has `particleDied` listeners. */
export type DeathListener = (particle: Particle) => void;

/** Settings the bounds measurement reads, see {@link BoundsTracker.store}. */
export interface BoundsSettings {
    /** The render settings, for the particle size the bounds are padded by. */
    rendererSettings: VFXBatchSettings;
    /** The render mode's settings, for a stretched billboard's length. */
    rendererEmitterSettings: RendererEmitterSettings;
    /** Whether the positions are in world space already. */
    worldSpace: boolean;
}

const tempV = new Vector3();

/**
 * Remembers where everything starts this step, so the renderer can carry the motion the step
 * produces on into the part of the frame that comes after it. Size and colour are only
 * snapshotted when some behavior can change them; otherwise the columns stay what spawn wrote
 * and the renderer reads them as they are. Only stretched billboards draw from velocity, and only
 * they pay for keeping the previous one; `rebind` is called when keeping it first allocates its
 * column, since every particle then has to be re-pointed at the store.
 */
export function snapshotPreviousState(
    store: ParticleStore,
    particleCount: number,
    snapshotSize: boolean,
    snapshotColor: boolean,
    keepVelocity: boolean,
    rebind: () => void
): void {
    const vector3Rows = particleCount * 3;
    store.useSizeSnapshot(snapshotSize);
    store.useColorSnapshot(snapshotColor);
    store.previousPosition.set(store.position.subarray(0, vector3Rows));
    if (snapshotSize) {
        store.previousSize.set(store.size.subarray(0, vector3Rows));
    }
    if (keepVelocity) {
        if (store.keepPreviousVelocity()) {
            rebind();
        }
        store.previousVelocity.set(store.velocity.subarray(0, vector3Rows));
    }
    if (snapshotColor) {
        store.previousColor.set(store.color.subarray(0, particleCount * 4));
    }
}

/** Runs the behaviors' frame updates and then each step of the plan over the live particles. */
export function runBehaviorSteps(
    steps: ReadonlyArray<FusionStep>,
    behaviors: Behavior[],
    particles: Particle[],
    particleCount: number,
    delta: number,
    store: ParticleStore
): void {
    for (let s = 0; s < steps.length; s++) {
        const step = steps[s];
        const stepBehaviors = step.behaviors;
        for (let j = 0; j < stepBehaviors.length; j++) {
            stepBehaviors[j].frameUpdate(delta);
        }
        // Nothing to update: skip, matching what the per-particle loop did.
        // A behavior may set up state before its loop that is only valid
        // once it has seen a particle.
        if (particleCount === 0) {
            continue;
        }
        if (step.run !== undefined) {
            step.run(behaviors, particles, particleCount, delta, store);
            continue;
        }
        const behavior = stepBehaviors[0];
        if (step.updateAll === true) {
            behavior.updateAll!(particles, particleCount, delta);
            continue;
        }
        for (let i = 0; i < particleCount; i++) {
            const particle = particles[i];
            // Inlined `died` — this runs once per behavior per particle.
            if (particle.age < particle.life) {
                behavior.update(particle, delta);
            }
        }
    }
}

/**
 * Moves a dead particle's slot and row to the end of the live range, so slot k always owns
 * row k and the live particles stay one contiguous range the renderer copies as is. Returns
 * the particle that died.
 */
function retire(particles: Particle[], store: ParticleStore, i: number, last: number): Particle {
    const particle = particles[i];
    const survivor = particles[last] as StoreBackedParticle;
    particles[i] = survivor;
    particles[last] = particle;
    if (i !== last) {
        store.swapRows(i, last);
        survivor.setStoreIndex(i);
        (particle as StoreBackedParticle).setStoreIndex(last);
    }
    return particle;
}

/**
 * What a ring buffer does to a particle at the end of its life (see `RingBufferMode`): `pause`
 * holds it frozen at its end, else it goes back to `loopStart` (a fraction of its life) once it
 * reaches `loopEnd`.
 */
export interface RingBufferStep {
    /** Freeze at the end of life rather than loop. */
    pause: boolean;
    /** Where a looping particle goes back to, a fraction of its life, 0 to 1. */
    loopStart: number;
    /**
     * Where a looping particle goes back from, a fraction of its life, `loopStart` to 1. Equal to
     * `loopStart`, the particle is held there.
     */
    loopEnd: number;
}

/** The least age a held particle keeps, as a fraction of its life: past 0, a newborn's age. */
const HELD_AGE = 1e-6;

/**
 * The age a looping ring particle is held at, or Infinity when it loops: a loop range of no
 * length holds it at that point of its life, as a pause does at the end.
 */
function holdAge(ring: RingBufferStep, life: number): number {
    return ring.loopEnd > ring.loopStart ? Infinity : Math.max(ring.loopEnd, HELD_AGE) * life;
}

/**
 * The sprite path's step after the behaviors, as one pass over the columns that does three
 * things, none of which touches a particle object until a death. Returns the live count.
 *
 * Newborns were snapshotted with their spawn size and colour, before SizeOverLife and
 * ColorOverLife ran. That false jump would be extrapolated by the renderer when the residual is
 * negative (common with the rounded fixed step) and flash the start appearance at the emitter,
 * so the snapshot is collapsed onto the curves' t=0 value. Age is still 0 at that point; the
 * same iteration then ages it.
 *
 * Position is integrated along the velocity.
 *
 * A particle whose age reached its life is swapped with the last live one, rows included. The
 * survivor moved into the slot has not been visited yet, so the slot is processed again. With a
 * `ring` buffer no particle dies: it is frozen at the end of its life, or sent back into it.
 *
 * The bounds fall out of the same pass. Measuring every particle on every step costs about as
 * much as the integration itself, so the full measurement runs every few steps; in between,
 * newborns extend the last bounds and the fastest particle seen since pads them for the motion,
 * which keeps them conservative.
 */
export function integrateSprites(
    delta: number,
    particles: Particle[],
    store: ParticleStore,
    liveParticleCount: number,
    collapseSize: boolean,
    collapseColor: boolean,
    bounds: BoundsTracker,
    settings: BoundsSettings,
    onDied: DeathListener | undefined,
    ring?: RingBufferStep
): number {
    const scalars = store.scalars;
    const pause = ring !== undefined && ring.pause;
    const stride = ParticleStore.SCALAR_STRIDE;
    const positions = store.position;
    const velocities = store.velocity;
    const prevSize = store.previousSize;
    const curSize = store.size;
    const prevColor = store.previousColor;
    const curColor = store.color;
    const measure = bounds.due;
    const carriedMin = bounds.min;
    const carriedMax = bounds.max;
    let minX = measure ? Infinity : carriedMin.x;
    let minY = measure ? Infinity : carriedMin.y;
    let minZ = measure ? Infinity : carriedMin.z;
    let maxX = measure ? -Infinity : carriedMax.x;
    let maxY = measure ? -Infinity : carriedMax.y;
    let maxZ = measure ? -Infinity : carriedMax.z;
    let maxSize = measure ? 0 : bounds.maxSize;
    let maxSpeedSq = measure ? 0 : bounds.maxSpeedSq;
    for (let i = 0; i < liveParticleCount; i++) {
        const scalar = i * stride;
        let age = scalars[scalar + ParticleStore.AGE];
        const offset = i * 3;
        const track = measure || age === 0;
        if (age === 0) {
            if (collapseSize) {
                prevSize[offset] = curSize[offset];
                prevSize[offset + 1] = curSize[offset + 1];
                prevSize[offset + 2] = curSize[offset + 2];
            }
            if (collapseColor) {
                const o4 = i * 4;
                prevColor[o4] = curColor[o4];
                prevColor[o4 + 1] = curColor[o4 + 1];
                prevColor[o4 + 2] = curColor[o4 + 2];
                prevColor[o4 + 3] = curColor[o4 + 3];
            }
        }
        const life = scalars[scalar + ParticleStore.LIFE];
        // Frozen until a newborn replaces it, no motion and no ageing: at the end of its life when
        // paused, or at a loop range of no length, held a hair past 0 so Birth fires only once.
        const hold = ring === undefined ? Infinity : pause ? life : holdAge(ring, life);
        const frozen = age >= hold;
        const step = frozen ? 0 : delta * scalars[scalar + ParticleStore.SPEED_MODIFIER];
        const vx = velocities[offset];
        const vy = velocities[offset + 1];
        const vz = velocities[offset + 2];
        const x = positions[offset] + vx * step;
        const y = positions[offset + 1] + vy * step;
        const z = positions[offset + 2] + vz * step;
        positions[offset] = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;
        if (track) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            maxSize = Math.max(maxSize, Math.max(curSize[offset], Math.max(curSize[offset + 1], curSize[offset + 2])));
        }
        // Speed is tracked every step: it bounds how far the particles
        // can have moved since the last measurement.
        if (frozen) {
            continue;
        }
        maxSpeedSq = Math.max(maxSpeedSq, vx * vx + vy * vy + vz * vz);
        age += delta;
        scalars[scalar + ParticleStore.AGE] = age;
        if (ring !== undefined) {
            if (age > hold) {
                scalars[scalar + ParticleStore.AGE] = hold;
            } else if (!pause && hold === Infinity && age >= ring.loopEnd * life) {
                const loopStart = ring.loopStart * life;
                const wrapped = loopStart + ((age - ring.loopEnd * life) % ((ring.loopEnd - ring.loopStart) * life));
                // Never exactly 0, which is a newborn's age: Birth sub emitters would fire again.
                scalars[scalar + ParticleStore.AGE] = wrapped > 0 ? wrapped : HELD_AGE * life;
                // The jump back is not motion: the renderer must not extrapolate size or colour across it.
                prevSize[offset] = curSize[offset];
                prevSize[offset + 1] = curSize[offset + 1];
                prevSize[offset + 2] = curSize[offset + 2];
                const o4 = i * 4;
                prevColor[o4] = curColor[o4];
                prevColor[o4 + 1] = curColor[o4 + 1];
                prevColor[o4 + 2] = curColor[o4 + 2];
                prevColor[o4 + 3] = curColor[o4 + 3];
            }
        } else if (age >= life) {
            const particle = retire(particles, store, i, liveParticleCount - 1);
            liveParticleCount--;
            i--;
            if (onDied !== undefined) {
                onDied(particle);
            }
        }
    }
    bounds.store(
        liveParticleCount,
        measure,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
        maxSize,
        maxSpeedSq,
        settings.rendererSettings,
        settings.rendererEmitterSettings,
        settings.worldSpace,
        SIMULATION_STEP
    );
    return liveParticleCount;
}

/** The newborn collapse of the trail path, see {@link integrateSprites}; trails keep their history on the objects, so it is its own pass. */
export function collapseTrailNewborns(
    store: ParticleStore,
    particleCount: number,
    snapshotSize: boolean,
    snapshotColor: boolean
): void {
    const scalars = store.scalars;
    const stride = ParticleStore.SCALAR_STRIDE;
    const prevSize = store.previousSize;
    const curSize = store.size;
    const prevColor = store.previousColor;
    const curColor = store.color;
    for (let i = 0, o3 = 0, o4 = 0, s = 0; i < particleCount; i++, o3 += 3, o4 += 4, s += stride) {
        if (scalars[s + ParticleStore.AGE] !== 0) {
            continue;
        }
        if (snapshotSize) {
            prevSize[o3] = curSize[o3];
            prevSize[o3 + 1] = curSize[o3 + 1];
            prevSize[o3 + 2] = curSize[o3 + 2];
        }
        if (snapshotColor) {
            prevColor[o4] = curColor[o4];
            prevColor[o4 + 1] = curColor[o4 + 1];
            prevColor[o4 + 2] = curColor[o4 + 2];
            prevColor[o4 + 3] = curColor[o4 + 3];
        }
    }
}

/**
 * Moves and ages the trail particles: a trail that follows its local origin is placed by its
 * emitter (or parent) matrix every step, any other along its velocity.
 */
export function moveTrails(
    delta: number,
    particles: Particle[],
    store: ParticleStore,
    particleCount: number,
    followLocalOrigin: boolean,
    emitterMatrix: Matrix4
): void {
    if (followLocalOrigin) {
        for (let i = 0; i < particleCount; i++) {
            const particle = particles[i];
            if ((particle as TrailParticle).localPosition) {
                particle.position.copy((particle as TrailParticle).localPosition!);
                particle.position.applyMatrix4(particle.parentMatrix ?? emitterMatrix);
            } else {
                particle.position.addScaledVector(particle.velocity, delta * particle.speedModifier);
            }
            particle.age += delta;
        }
        return;
    }
    const scalars = store.scalars;
    const stride = ParticleStore.SCALAR_STRIDE;
    const positions = store.position;
    const velocities = store.velocity;
    for (let i = 0, offset = 0, scalar = 0; i < particleCount; i++, offset += 3, scalar += stride) {
        const step = delta * scalars[scalar + ParticleStore.SPEED_MODIFIER];
        positions[offset] += velocities[offset] * step;
        positions[offset + 1] += velocities[offset + 1] * step;
        positions[offset + 2] += velocities[offset + 2] * step;
        scalars[scalar + ParticleStore.AGE] += delta;
    }
}

/**
 * Records this step's sample into each trail's history: its position (in world space when the
 * trail asks for it and the system is not already there) and, for a swept trail, the side axis
 * as the emitter holds it, in the space the positions are recorded in. With a minimum vertex
 * distance the newest sample follows the particle until it is that far from the sample before;
 * samples older than the trail's lifetime are dropped from the tail. A trail that dies with its
 * particle has its history emptied instead, so the removal pass takes it this same step.
 */
export function recordTrailHistory(
    particles: Particle[],
    particleCount: number,
    trailSettings: TrailSettings,
    worldSpace: boolean,
    emitterMatrix: Matrix4
): void {
    const dieWithParticle = trailSettings.dieWithParticle;
    // A world-space system records world positions already.
    const recordWorldSpace = trailSettings.recordWorldSpace && !worldSpace;
    const sideAxis = trailSettings.sideAxis;
    const sidesInWorld = worldSpace || Boolean(trailSettings.recordWorldSpace);
    const minDistance = trailMinVertexDistance(trailSettings);
    const lifetime = trailLifetime(trailSettings);
    for (let i = 0; i < particleCount; i++) {
        const trail = particles[i] as TrailParticle;
        // A particle at the end of its life is dead: it records nothing more and its trail fades.
        const alive = trail.age < trail.life;
        if (dieWithParticle && !alive) {
            trail.resetHistory();
            continue;
        }
        // The newest sample follows the particle until it is the minimum distance from the sample
        // before it; then it is fixed where it is and this step's sample starts a new one.
        let replaceHead = false;
        if (minDistance > 0 && alive && trail.historyCount > 1) {
            const distances = trail.historyDistances;
            const count = trail.historyCount;
            replaceHead =
                distances[trail.getHistoryIndex(count - 1)] - distances[trail.getHistoryIndex(count - 2)] < minDistance;
        }
        trail.update(replaceHead, !recordWorldSpace);
        // update() wrote a sample only while the particle is alive.
        if (recordWorldSpace && alive) {
            const offset = ((trail.historyHead + trail.historyCapacity - 1) % trail.historyCapacity) * 3;
            const positions = trail.historyPositions;
            tempV.set(positions[offset], positions[offset + 1], positions[offset + 2]);
            tempV.applyMatrix4(trail.parentMatrix ?? emitterMatrix);
            positions[offset] = tempV.x;
            positions[offset + 1] = tempV.y;
            positions[offset + 2] = tempV.z;
            trail.measureHeadDistance();
        }
        if (lifetime !== Infinity) {
            const ages = trail.historyAges;
            const age = trail.age;
            while (trail.historyCount > 0 && age - ages[trail.getHistoryIndex(0)] > lifetime) {
                trail.dropOldest();
            }
        }
        if (sideAxis && alive) {
            trail.ensureSideHistory();
            const offset = ((trail.historyHead + trail.historyCapacity - 1) % trail.historyCapacity) * 3;
            const sides = trail.historySides;
            let x = sideAxis.x;
            let y = sideAxis.y;
            let z = sideAxis.z;
            if (sidesInWorld) {
                const m = (trail.parentMatrix ?? emitterMatrix).elements;
                const tx = m[0] * x + m[4] * y + m[8] * z;
                const ty = m[1] * x + m[5] * y + m[9] * z;
                z = m[2] * x + m[6] * y + m[10] * z;
                x = tx;
                y = ty;
            }
            sides[offset] = x;
            sides[offset + 1] = y;
            sides[offset + 2] = z;
        }
    }
}

/**
 * Retires each trail particle that has died and whose ribbon has faded out (an empty history),
 * the same swap as the sprite path. Returns the live count.
 */
export function removeDeadTrails(
    particles: Particle[],
    store: ParticleStore,
    liveParticleCount: number,
    onDied: DeathListener | undefined
): number {
    const scalars = store.scalars;
    const stride = ParticleStore.SCALAR_STRIDE;
    for (let i = 0; i < liveParticleCount; i++) {
        const particle = particles[i] as TrailParticle;
        const scalar = i * stride;
        const dead = scalars[scalar + ParticleStore.AGE] >= scalars[scalar + ParticleStore.LIFE];
        if (dead && particle.historyCount === 0) {
            retire(particles, store, i, liveParticleCount - 1);
            liveParticleCount--;
            i--;
            if (onDied !== undefined) {
                onDied(particle);
            }
        }
    }
    return liveParticleCount;
}
