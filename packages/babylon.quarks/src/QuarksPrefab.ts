import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {IAnimationData, IPrefab} from 'quarks.core';
import {BatchedRenderer} from './BatchedRenderer';
import {ParticleEmitter} from './ParticleEmitter';
import {quarksNodeId} from './nodeId';

/**
 * A clip a {@link QuarksPrefab} timeline can drive, such as a Babylon `AnimationGroup`. Every
 * member is optional; the prefab calls only what is there.
 */
export interface QuarksTimelineClip {
    /** Names the clip in a saved prefab, so it can be found again on load. */
    uuid?: string;
    /** Length in seconds, used when the track gives none. */
    duration?: number;
    /** Called when the timeline enters the track. */
    play?: () => void;
    /** Called when the prefab pauses. */
    pause?: () => void;
    /** Called when the timeline leaves the track or the prefab stops. */
    stop?: () => void;
    /** Called while scrubbing with {@link QuarksPrefab.setTime}, with the time into the track in seconds. */
    setTime?: (time: number) => void;
}

/** One track on a {@link QuarksPrefab} timeline. */
export interface AnimationData extends IAnimationData {
    /** `'ps'` plays a particle system, `'three'` plays a {@link QuarksTimelineClip}. */
    type: 'three' | 'ps';
    /** The node the track drives: a {@link ParticleEmitter} for `'ps'`, any node for `'three'`. */
    target: TransformNode;
    /** Restart when the track ends instead of letting it finish. */
    loop: boolean;
    /** The clip a `'three'` track plays. */
    clip?: QuarksTimelineClip;
    /** The id of the clip on `target`, written to and read from JSON. */
    clipUUID?: string;
}

interface AnimationJSON {
    startTime: number;
    duration: number;
    type: 'three' | 'ps';
    targetUUID: string;
    clipUUID?: string;
    loop: boolean;
}

/**
 * A node with a timeline that starts and stops the particle systems and clips under it, like a
 * Unity Timeline or a Niagara System's emitter spawn schedule. Each track starts at `startTime`
 * and lasts `duration` seconds: a particle system restarts when its track begins and stops
 * emitting when it ends, a clip plays and stops.
 *
 * Call {@link QuarksPrefab.update} every frame (or {@link QuarksPrefab.setTime} to scrub).
 */
export class QuarksPrefab extends TransformNode implements IPrefab {
    /** Always `'QuarksPrefab'`; written to JSON. */
    type = 'QuarksPrefab';
    /** The tracks, in the order they were added. */
    animationData: Array<AnimationData> = [];
    /** Whether {@link QuarksPrefab.update} advances the timeline. */
    isPlaying = false;
    /** Time on the timeline in seconds; just below 0 before the first update, so a track at 0 starts. */
    currentTime = -0.00001;
    /** Playback speed; 1 is real time. */
    timeScale = 1;
    /** End of the last track in seconds; the prefab stops when it passes it. */
    duration = 0;

    private _lastUpdateTimeMs = Date.now();
    private _batchedRenderer?: BatchedRenderer;
    private _tempAnimationJSON: Array<AnimationJSON> = [];

    constructor(name = 'QuarksPrefab', scene?: Scene) {
        super(name, scene);
    }

    /** The renderer that a particle system is added to again when its track starts. */
    registerBatchedRenderer(renderer: BatchedRenderer): void {
        this._batchedRenderer = renderer;
    }

    /**
     * Adds a track that plays `emitter`'s system, and pauses the prefab.
     * @param startTime - Seconds into the timeline.
     * @param duration - Seconds; 0 or less uses the system's own duration.
     * @param loop - Restart the system when the track ends.
     */
    addParticleSystemAnimation(emitter: ParticleEmitter, startTime = 0, duration = 0, loop = false): AnimationData {
        const animationDuration = duration > 0 ? duration : emitter.system.duration;
        const data: AnimationData = {
            startTime,
            duration: animationDuration,
            type: 'ps',
            loop,
            target: emitter,
        };
        this.animationData.push(data);
        this.pause();
        this.updateDuration();
        return data;
    }

    /**
     * Adds a track that plays `clip` on `target`.
     * @param startTime - Seconds into the timeline.
     * @param duration - Seconds; 0 or less uses the clip's duration.
     * @param loop - Play the clip again when the track ends.
     * @param clipUUID - Saved in JSON to find the clip on load; defaults to `clip.uuid`.
     */
    addThreeAnimation(
        target: TransformNode,
        clip?: QuarksTimelineClip,
        startTime = 0,
        duration = clip?.duration ?? 0,
        loop = false,
        clipUUID?: string
    ): AnimationData {
        const animationDuration = duration > 0 ? duration : (clip?.duration ?? 0);
        const data: AnimationData = {
            startTime,
            duration: animationDuration,
            type: 'three',
            loop,
            target,
            clip,
            clipUUID: clipUUID ?? clip?.uuid,
        };
        this.animationData.push(data);
        this.updateDuration();
        return data;
    }

    /** Removes the track at `index` in {@link QuarksPrefab.animationData}. */
    removeAnimation(index: number): void {
        this.animationData.splice(index, 1);
        this.updateDuration();
    }

    /**
     * Starts or resumes the timeline from {@link QuarksPrefab.currentTime}, resuming the systems and
     * clips of the tracks it is inside, which {@link QuarksPrefab.pause} paused.
     */
    play(): void {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lastUpdateTimeMs = Date.now();
        this.animationData.forEach((animation) => {
            const inside =
                this.currentTime >= animation.startTime && this.currentTime <= animation.startTime + animation.duration;
            if (!inside) return;
            if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                animation.target.system.play();
                return;
            }
            animation.clip?.play?.();
        });
    }

    /** Pauses the timeline and every system and clip on it. */
    pause(): void {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.animationData.forEach((animation) => {
            if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                animation.target.system.pause();
                return;
            }
            animation.clip?.pause?.();
        });
    }

    /** Pauses, rewinds to the start, and stops every system and clip on it. */
    stop(): void {
        this.pause();
        this.currentTime = -0.00001;
        this.animationData.forEach((animation) => {
            if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                animation.target.system.stop();
                return;
            }
            animation.clip?.stop?.();
        });
    }

    /**
     * Advances the timeline, starting and ending tracks it crosses. Stops past {@link QuarksPrefab.duration}.
     * @param forceDelta - Seconds to advance; by default the wall-clock time since the last update.
     */
    update(forceDelta?: number): void {
        if (!this.isPlaying) return;
        const now = Date.now();
        const delta = forceDelta ?? Math.max((now - this._lastUpdateTimeMs) / 1000, 0);
        this._lastUpdateTimeMs = now;
        const previousTime = this.currentTime;
        this.currentTime += delta * this.timeScale;

        if (this.currentTime > this.duration) {
            this.stop();
            return;
        }

        this.animationData.forEach((animation) => {
            const startTime = animation.startTime;
            const endTime = animation.startTime + animation.duration;
            const isActive = this.currentTime >= startTime && this.currentTime <= endTime;
            const wasActive = previousTime >= startTime && previousTime <= endTime;
            if (isActive && !wasActive) {
                if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                    animation.target.system.restart();
                    if (this._batchedRenderer) {
                        this._batchedRenderer.addSystem(animation.target.system);
                    }
                } else {
                    animation.clip?.play?.();
                }
                return;
            }

            if (!isActive && wasActive) {
                if (animation.loop && animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                    animation.target.system.restart();
                    return;
                }
                if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                    animation.target.system.endEmit();
                } else if (animation.loop) {
                    animation.clip?.play?.();
                } else {
                    animation.clip?.stop?.();
                }
            }
        });
    }

    /** Jumps to `time` seconds, starting and ending tracks it crosses and scrubbing clips to it. */
    setTime(time: number): void {
        const previousTime = this.currentTime;
        this.currentTime = time;
        this.animationData.forEach((animation) => {
            const startTime = animation.startTime;
            const endTime = animation.startTime + animation.duration;
            const isActive = this.currentTime >= startTime && this.currentTime < endTime;
            const wasActive = previousTime >= startTime && previousTime < endTime;
            if (isActive && !wasActive) {
                if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                    animation.target.system.restart();
                } else {
                    animation.clip?.play?.();
                }
                return;
            }
            if (!isActive && wasActive) {
                if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
                    animation.target.system.endEmit();
                } else {
                    animation.clip?.stop?.();
                }
                return;
            }
            if (isActive && animation.type === 'three') {
                animation.clip?.setTime?.(Math.max(time - startTime, 0));
            }
        });
    }

    /** Same as {@link QuarksPrefab.duration}. */
    getDuration(): number {
        return this.duration;
    }

    /**
     * Links the tracks read by {@link QuarksPrefab.fromJSON} to the nodes under `root` they name.
     * {@link QuarksLoader} calls it once the whole effect is built; tracks whose node is missing are dropped.
     */
    resolveReferences(root: TransformNode): void {
        const nodesMap: {[uuid: string]: TransformNode} = {};
        const traverse = (node: TransformNode) => {
            // A file's uuid names the node it was loaded as; a Babylon uniqueId, which older files
            // wrote for nodes made in code, only names a node that has no file uuid, and never
            // takes over an id already claimed.
            const fileId = (node as any)._quarksUUID as string | undefined;
            if (fileId) {
                nodesMap[fileId] = node;
            } else {
                nodesMap[node.uniqueId.toString()] ??= node;
            }
            const children = node.getChildren();
            for (const child of children) {
                if (child instanceof TransformNode) {
                    traverse(child);
                }
            }
        };
        traverse(root);

        this._tempAnimationJSON.forEach((animationJSON) => {
            const target = nodesMap[animationJSON.targetUUID];
            if (animationJSON.type === 'ps' && target instanceof ParticleEmitter) {
                this.addParticleSystemAnimation(
                    target,
                    animationJSON.startTime,
                    animationJSON.duration,
                    animationJSON.loop
                );
                return;
            }
            if (animationJSON.type === 'three' && target) {
                const clip = this.resolveTimelineClip(target, animationJSON.clipUUID);
                this.addThreeAnimation(
                    target,
                    clip,
                    animationJSON.startTime,
                    animationJSON.duration,
                    animationJSON.loop,
                    animationJSON.clipUUID
                );
            }
        });
        this.updateDuration();
        this._tempAnimationJSON = [];
    }

    /** Writes the prefab's name, time scale (when not 1) and tracks. */
    toJSON(): any {
        return {
            type: this.type,
            name: this.name,
            ...(this.timeScale !== 1 ? {timeScale: this.timeScale} : {}),
            animationData: this.animationData.map((animation) => ({
                startTime: animation.startTime,
                duration: animation.duration,
                type: animation.type,
                targetUUID: quarksNodeId(animation.target),
                clipUUID: animation.type === 'three' ? (animation.clipUUID ?? animation.clip?.uuid) : undefined,
                loop: animation.loop,
            })),
        };
    }

    /** Reads a prefab written by {@link QuarksPrefab.toJSON}; call {@link QuarksPrefab.resolveReferences} afterwards. */
    static fromJSON(json: any, scene?: Scene): QuarksPrefab {
        const prefab = new QuarksPrefab(json.name || 'QuarksPrefab', scene);
        if (typeof json.timeScale === 'number') {
            prefab.timeScale = json.timeScale;
        }
        if (Array.isArray(json.animationData)) {
            prefab._tempAnimationJSON = json.animationData.filter(
                (item: any) => item?.type === 'ps' || item?.type === 'three'
            );
        }
        return prefab;
    }

    private resolveTimelineClip(target: TransformNode, clipUUID?: string): QuarksTimelineClip | undefined {
        const animationSources = [
            (target as any).animations,
            (target as any).animationGroups,
            (target.metadata as any)?.animations,
            (target.metadata as any)?.animationGroups,
        ];
        for (const source of animationSources) {
            if (!Array.isArray(source)) continue;
            if (!clipUUID) {
                return source[0];
            }
            const found = source.find((item: any) => item?.uuid === clipUUID);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    private updateDuration(): void {
        let maxDuration = 0;
        this.animationData.forEach((animation) => {
            const endTime = animation.startTime + animation.duration;
            if (endTime > maxDuration) {
                maxDuration = endTime;
            }
        });
        this.duration = maxDuration;
    }
}
