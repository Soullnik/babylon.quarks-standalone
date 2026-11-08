import type {Vector3ArrayJSON} from '../functions/FunctionJSON';
import {IParticleSystem} from '../IParticleSystem';
import type {Vector3Like} from '../Like';
import {Vector3} from '../math';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {EmitterFrame} from './EmitterFrame';

/**
 * What {@link ApplyCollision} asks about the world: whether a particle at
 * `position` has hit something, and if so which way the surface faces.
 */
export interface PhysicsResolver {
    /**
     * Tests `position`, in the simulation space of the system asking. Returns
     * true when it is inside or on a collider, with the surface's unit normal
     * written to `normal`; false otherwise, leaving `normal` alone. Both are `{x, y, z}`: read
     * the position's components and write the normal's.
     */
    resolve(position: Vector3Like, normal: Vector3Like): boolean;
}

let physicsResolver: PhysicsResolver | undefined;

/**
 * Registers the resolver every {@link ApplyCollision} without one of its own
 * uses, from the next step on; `undefined` unregisters it. The host owns the
 * colliders, so quarks.core registers nothing itself.
 */
export function setPhysicsResolver(resolver: PhysicsResolver | undefined): void {
    physicsResolver = resolver;
}

/** The resolver registered with {@link setPhysicsResolver}, or undefined when there is none. */
export function getPhysicsResolver(): PhysicsResolver | undefined {
    return physicsResolver;
}

/**
 * A collision plane of an {@link ApplyCollision}, in the emitter's local space: a point on it and
 * the direction it faces. Particles are kept on the side the normal points to.
 */
export interface CollisionPlane {
    /** A point on the plane, in the emitter's local space. */
    position: Vector3Like;
    /** The side particles stay on, in the emitter's local space; its length is ignored. */
    normal: Vector3Like;
}

/** The JSON of a {@link CollisionPlane}. */
export interface CollisionPlaneJSON {
    /** A point on the plane, in the emitter's local space. */
    position: Vector3ArrayJSON;
    /** The side particles stay on, in the emitter's local space. */
    normal: Vector3ArrayJSON;
}

/** Settings of an {@link ApplyCollision} besides its resolver and bounce; each is optional. */
export interface ApplyCollisionOptions {
    /** Planes the effect carries; when there are any, they are collided with instead of the resolver. */
    planes?: CollisionPlane[];
    /** The share of speed lost on each hit, 0 to 1; 0 by default. */
    dampen?: number;
    /** The share of its lifetime a particle loses on each hit, 0 to 1; 0 by default. */
    lifetimeLoss?: number;
    /** The particle's collision radius as a share of half its size, against planes; 1 by default. */
    radiusScale?: number;
}

/** The JSON of a collision: a {@link ApplyCollision}. */
export interface ApplyCollisionJSON extends BehaviorJSON {
    /** The share of the speed into the surface kept on a bounce; 1 when absent. */
    bounce?: number;
    /** The collision planes, in the emitter's local space; none when absent. */
    planes?: CollisionPlaneJSON[];
    /** The share of speed lost on each hit; 0 when absent. */
    dampen?: number;
    /** The share of its lifetime a particle loses on each hit; 0 when absent. */
    lifetimeLoss?: number;
    /** The collision radius as a share of half the particle's size, against planes; 1 when absent. */
    radiusScale?: number;
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Bounces particles off surfaces, as Unity's Collision module.
 *
 * With {@link planes} (Unity's Planes mode) the particles collide with those planes, which the
 * effect carries in its emitter's local space and which follow the emitter as it moves. A
 * particle collides when its next step would take it, as a sphere of {@link radiusScale} times half
 * its size, behind a plane while it moves toward it, so it never passes through.
 *
 * Without planes (Unity's World mode) every step each particle's position is handed to a
 * {@link PhysicsResolver}: the behavior's own when it was given one, otherwise whatever is
 * registered with {@link setPhysicsResolver} at that moment, so a resolver registered after the
 * effect loaded still takes effect. A particle inside a collider and moving into it collides.
 * Without any resolver the behavior does nothing, so a collision-bearing effect loads and plays
 * anywhere. The resolver belongs to the host and is not saved.
 *
 * A hit turns the velocity into the surface back out of it, keeping {@link bounce} of that part;
 * the velocity along the surface is kept. Then {@link dampen} of the whole speed is lost, and the
 * particle ages by {@link lifetimeLoss} of its lifetime. Applies in every render mode.
 */
export class ApplyCollision implements Behavior {
    type = 'ApplyCollision';
    /**
     * Scratch value.
     * @internal
     */
    tempV = new Vector3();
    /**
     * Scratch value.
     * @internal
     */
    _tempNext = new Vector3();
    /** Planes the effect carries, in the emitter's local space; none collides with the resolver. */
    planes: CollisionPlane[];
    /** The share of speed lost on each hit, 0 to 1. */
    dampen: number;
    /** The share of its lifetime a particle loses on each hit, 0 to 1. */
    lifetimeLoss: number;
    /** The particle's collision radius as a share of half its size, against planes. */
    radiusScale: number;
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;
    /** The emitter's transform this frame, refreshed by {@link frameUpdate}. */
    readonly _frame = new EmitterFrame();
    /**
     * The planes in the simulation space, as point and unit normal in turn; refreshed by
     * {@link frameUpdate}.
     */
    _simPlanes: Vector3[] = [];

    constructor(
        /**
         * The resolver this behavior asks, or undefined to ask the one
         * registered with {@link setPhysicsResolver} when a particle is tested.
         */
        public resolver: PhysicsResolver | undefined,
        /**
         * How much of its speed into the surface a particle keeps, turned back out, after a hit:
         * 1 bounces back at full speed, 0 stops it there and lets it slide along.
         */
        public bounce: number,
        options: ApplyCollisionOptions = {}
    ) {
        this.planes = (options.planes ?? []).map((plane) => ({
            position: new Vector3(plane.position.x, plane.position.y, plane.position.z),
            normal: new Vector3(plane.normal.x, plane.normal.y, plane.normal.z),
        }));
        this.dampen = options.dampen ?? 0;
        this.lifetimeLoss = options.lifetimeLoss ?? 0;
        this.radiusScale = options.radiusScale ?? 1;
        this.refreshPlanes();
    }

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
    }

    /** Converts {@link planes} into the simulation space with the emitter's current frame. */
    private refreshPlanes(): void {
        const planes = this.planes;
        const sim = this._simPlanes;
        while (sim.length < planes.length * 2) {
            sim.push(new Vector3());
        }
        sim.length = planes.length * 2;
        // A local-space system simulates in the emitter's space, where the planes already are.
        const worldSpace = this.ps !== undefined && this.ps.worldSpace;
        const frame = this._frame;
        for (let i = 0; i < planes.length; i++) {
            const {position, normal: facing} = planes[i];
            const point = sim[i * 2].set(position.x, position.y, position.z);
            const normal = sim[i * 2 + 1].set(facing.x, facing.y, facing.z);
            if (worldSpace) {
                frame.pointToSimulation(point, 'local', true);
                // A normal scales by the inverse of the frame's scale, so it stays square to the plane.
                normal.multiply(frame.scaleInverse).applyQuaternion(frame.quaternion);
            }
            const length = normal.length();
            if (length > 0) {
                normal.multiplyScalar(1 / length);
            }
        }
    }

    /** Turns the velocity out of the surface with unit normal `normal` and applies the losses of a hit. */
    private hit(particle: Particle, normal: Vector3): void {
        const velocity = particle.velocity;
        const into = velocity.dot(normal);
        velocity.addScaledVector(normal, -(1 + this.bounce) * into);
        const dampen = clamp01(this.dampen);
        if (dampen > 0) {
            velocity.multiplyScalar(1 - dampen);
        }
        const loss = clamp01(this.lifetimeLoss);
        if (loss > 0) {
            particle.age += loss * particle.life;
        }
    }

    update(particle: Particle, delta: number): void {
        const sim = this._simPlanes;
        if (sim.length > 0) {
            const radius = this.radiusScale * 0.5 * particle.size.x;
            const next = this._tempNext
                .copy(particle.position)
                .addScaledVector(particle.velocity, delta * particle.speedModifier);
            for (let i = 0; i < sim.length; i += 2) {
                const point = sim[i];
                const normal = sim[i + 1];
                if (particle.velocity.dot(normal) >= 0) {
                    continue;
                }
                const nextDistance = this.tempV.copy(next).sub(point).dot(normal) - radius;
                if (nextDistance >= 0) {
                    continue;
                }
                this.hit(particle, normal);
                // A particle already behind the plane is put back on it.
                const distance = this.tempV.copy(particle.position).sub(point).dot(normal) - radius;
                if (distance < 0) {
                    particle.position.addScaledVector(normal, -distance);
                }
                next.copy(particle.position).addScaledVector(particle.velocity, delta * particle.speedModifier);
            }
            return;
        }
        const resolver = this.resolver ?? physicsResolver;
        if (resolver !== undefined && resolver.resolve(particle.position, this.tempV)) {
            // Only a particle moving into the surface bounces, so one still inside after a hit
            // is not turned back in on the next step.
            if (particle.velocity.dot(this.tempV) < 0) {
                this.hit(particle, this.tempV);
            }
        }
    }

    frameUpdate(delta: number): void {
        if (this.planes.length === 0) {
            return;
        }
        if (this.ps !== undefined && this.ps.worldSpace) {
            this._frame.refresh(this.ps);
        }
        this.refreshPlanes();
    }

    toJSON(): ApplyCollisionJSON {
        const json: ApplyCollisionJSON = {
            type: this.type,
            bounce: this.bounce,
        };
        if (this.planes.length > 0) {
            json.planes = this.planes.map((plane) => ({
                position: [plane.position.x, plane.position.y, plane.position.z],
                normal: [plane.normal.x, plane.normal.y, plane.normal.z],
            }));
        }
        if (this.dampen !== 0) {
            json.dampen = this.dampen;
        }
        if (this.lifetimeLoss !== 0) {
            json.lifetimeLoss = this.lifetimeLoss;
        }
        if (this.radiusScale !== 1) {
            json.radiusScale = this.radiusScale;
        }
        return json;
    }

    /**
     * Reads {@link ApplyCollision.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: ApplyCollisionJSON): Behavior {
        const vector = (v: unknown) =>
            Array.isArray(v) ? {x: Number(v[0]) || 0, y: Number(v[1]) || 0, z: Number(v[2]) || 0} : {x: 0, y: 0, z: 0};
        const planes = Array.isArray(json.planes)
            ? json.planes.map((plane) => ({position: vector(plane?.position), normal: vector(plane?.normal)}))
            : undefined;
        const number = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
        // A file without a bounce keeps the full speed, as a Unity collision does by default.
        return new ApplyCollision(undefined, number(json.bounce, 1), {
            planes,
            dampen: number(json.dampen, 0),
            lifetimeLoss: number(json.lifetimeLoss, 0),
            radiusScale: number(json.radiusScale, 1),
        });
    }

    clone(): Behavior {
        return new ApplyCollision(this.resolver, this.bounce, {
            planes: this.planes,
            dampen: this.dampen,
            lifetimeLoss: this.lifetimeLoss,
            radiusScale: this.radiusScale,
        });
    }

    reset(): void {}
}
