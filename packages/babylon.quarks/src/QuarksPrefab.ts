import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Observer} from '@babylonjs/core/Misc/observable';
import {Scene} from '@babylonjs/core/scene';
import {IAnimationData, IPrefab} from 'quarks.core';
import {BatchedRenderer} from './BatchedRenderer';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';
import {fileNodeId, quarksNodeId} from './nodeId';

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

/** The particle system a `'ps'` track plays, if it has one. */
function particleSystemOf(animation: AnimationData): ParticleSystem | undefined {
    if (animation.type === 'ps' && animation.target instanceof ParticleEmitter) {
        return animation.target.system as unknown as ParticleSystem;
    }
    return undefined;
}

/** One track on a {@link QuarksPrefab} timeline. */
export interface AnimationData extends IAnimationData {
    /**
     * `'ps'` plays a particle system, `'three'` plays a {@link QuarksTimelineClip}. The names are
     * the effect format's, shared with three.quarks, where a `'three'` track plays a three.js
     * `AnimationClip`; here the clip is whatever the host registered on the target node.
     */
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
 * Unity Timeline or a Niagara System's emitter spawn schedule. Each track covers the window from
 * `startTime` to `startTime + duration` seconds (the end not included): a particle system restarts
 * when the timeline enters its window and stops emitting when it leaves it, letting its particles
 * die out; a clip plays and stops.
 *
 * The timeline advances in {@link QuarksPrefab.update}: call it once a frame, or set
 * {@link QuarksPrefab.autoUpdate} and the scene does. {@link QuarksPrefab.setTime} scrubs. When the
 * timeline passes its end, the systems still emitting end their emission, the clips stop, the
 * prefab stops playing and rewinds, and {@link QuarksPrefab.play} plays it again.
 *
 * A window shorter than a frame is not missed: a frame that steps over it whole starts its system
 * (which ends its emission on the next update) or plays and stops its clip.
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
    /** End of the last track in seconds; the timeline ends when it reaches it. */
    duration = 0;

    private _timeScale = 1;
    private _batchedRenderer?: BatchedRenderer;
    private _tempAnimationJSON: Array<AnimationJSON> = [];
    private _autoUpdate: Observer<Scene> | null = null;
    /** Systems whose window a single update stepped over: they end their emission on the next one. */
    private readonly _pendingEndEmit = new Set<ParticleSystem>();

    constructor(name = 'QuarksPrefab', scene?: Scene) {
        super(name, scene);
    }

    /**
     * Playback speed of the timeline and of the particle systems on it: 1 is real time, 2 twice as
     * fast, 0 frozen. It sets each track's system's {@link ParticleSystem.timeDilation}, so the
     * systems keep pace with the timeline without their own `playbackSpeed` changing. Negative or
     * NaN is read as 0. Saved in JSON when not 1.
     */
    get timeScale(): number {
        return this._timeScale;
    }

    set timeScale(scale: number) {
        this._timeScale = scale > 0 && scale < Infinity ? scale : 0;
        for (const animation of this.animationData) {
            const system = particleSystemOf(animation);
            if (system !== undefined) {
                system.timeDilation = this._timeScale;
            }
        }
    }

    /**
     * Whether the scene advances the timeline: before each render, by the engine's frame time (game
     * time, as Unity Timeline's default update mode). Off by default; then call
     * {@link QuarksPrefab.update} yourself. Turned off when the prefab is disposed.
     */
    get autoUpdate(): boolean {
        return this._autoUpdate !== null;
    }

    set autoUpdate(enabled: boolean) {
        if (enabled === this.autoUpdate) return;
        if (enabled) {
            this._autoUpdate = this.getScene().onBeforeRenderObservable.add(() => this.update());
        } else {
            this.getScene().onBeforeRenderObservable.remove(this._autoUpdate);
            this._autoUpdate = null;
        }
    }

    /** The renderer that a particle system is added to again when its track starts. */
    registerBatchedRenderer(renderer: BatchedRenderer): void {
        this._batchedRenderer = renderer;
    }

    /**
     * Adds a track that plays `emitter`'s system. Its system runs at the prefab's
     * {@link QuarksPrefab.timeScale} from now on. A track added while the timeline is inside its
     * window starts the next time the timeline enters it.
     * @param startTime - Seconds into the timeline.
     * @param duration - Seconds; 0 or less uses the system's own duration.
     * @param loop - Restart the system when the timeline leaves the track before its end.
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
        (emitter.system as unknown as ParticleSystem).timeDilation = this._timeScale;
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

    /**
     * Removes the track at `index` in {@link QuarksPrefab.animationData}. A particle system's
     * {@link ParticleSystem.timeDilation} goes back to 1.
     */
    removeAnimation(index: number): void {
        const [removed] = this.animationData.splice(index, 1);
        const system = removed && particleSystemOf(removed);
        if (system !== undefined) {
            system.timeDilation = 1;
            this._pendingEndEmit.delete(system);
        }
        this.updateDuration();
    }

    /**
     * Starts or resumes the timeline from {@link QuarksPrefab.currentTime}, resuming the systems and
     * clips of the tracks it is inside, which {@link QuarksPrefab.pause} paused. A system on such a
     * track that has already finished stays finished.
     */
    play(): void {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.animationData.forEach((animation) => {
            if (!this.isInside(animation, this.currentTime)) return;
            const system = particleSystemOf(animation);
            if (system !== undefined) {
                if (!system.isFinished()) system.play();
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
            const system = particleSystemOf(animation);
            if (system !== undefined) {
                system.pause();
                return;
            }
            animation.clip?.pause?.();
        });
    }

    /** Pauses, rewinds to the start, and stops every system (clearing its particles) and clip on it. */
    stop(): void {
        this.pause();
        this.currentTime = -0.00001;
        this._pendingEndEmit.clear();
        this.animationData.forEach((animation) => {
            const system = particleSystemOf(animation);
            if (system !== undefined) {
                system.stop();
                return;
            }
            animation.clip?.stop?.();
        });
    }

    /**
     * Advances the timeline, starting and ending the tracks whose windows it enters, leaves or
     * steps over. At the end of the timeline the systems still emitting end their emission and
     * their particles die out, the clips stop, and the prefab stops playing and rewinds.
     * @param forceDelta - Seconds to advance, before {@link QuarksPrefab.timeScale}; by default the
     *   scene's frame time. Call it once a frame, or use {@link QuarksPrefab.autoUpdate}.
     */
    update(forceDelta?: number): void {
        for (const system of this._pendingEndEmit) {
            system.endEmit();
        }
        this._pendingEndEmit.clear();
        if (!this.isPlaying) return;
        const delta = forceDelta ?? this.getScene().getEngine().getDeltaTime() / 1000;
        const previousTime = this.currentTime;
        const ended = previousTime + Math.max(delta, 0) * this._timeScale >= this.duration;
        this.currentTime = ended ? this.duration : previousTime + Math.max(delta, 0) * this._timeScale;

        this.animationData.forEach((animation) => {
            const wasActive = this.isInside(animation, previousTime);
            const isActive = this.isInside(animation, this.currentTime);
            const steppedOver =
                !wasActive &&
                !isActive &&
                previousTime < animation.startTime &&
                this.currentTime >= animation.startTime + animation.duration;
            if (isActive && !wasActive) {
                this.enterTrack(animation);
            } else if (steppedOver) {
                this.enterTrack(animation);
                const system = particleSystemOf(animation);
                if (system !== undefined) {
                    // Ended on the next update, so that the system emits what its window began with.
                    this._pendingEndEmit.add(system);
                } else {
                    animation.clip?.stop?.();
                }
            } else if (wasActive && !isActive) {
                this.leaveTrack(animation, !ended);
            }
        });

        if (ended) {
            this.isPlaying = false;
            this.currentTime = -0.00001;
        }
    }

    /** Jumps to `time` seconds, starting and ending tracks it crosses and scrubbing clips to it. */
    setTime(time: number): void {
        const previousTime = this.currentTime;
        this.currentTime = time;
        this.animationData.forEach((animation) => {
            const isActive = this.isInside(animation, time);
            const wasActive = this.isInside(animation, previousTime);
            if (isActive && !wasActive) {
                this.enterTrack(animation);
            } else if (!isActive && wasActive) {
                this.leaveTrack(animation, false);
                return;
            }
            if (isActive && animation.type === 'three') {
                animation.clip?.setTime?.(Math.max(time - animation.startTime, 0));
            }
        });
    }

    /** Stops advancing with the scene, and disposes the node. */
    override dispose(doNotRecurse?: boolean, disposeMaterialAndTextures?: boolean): void {
        this.autoUpdate = false;
        this._pendingEndEmit.clear();
        super.dispose(doNotRecurse, disposeMaterialAndTextures);
    }

    /** Whether `time` is inside the track's window, the end excluded. */
    private isInside(animation: AnimationData, time: number): boolean {
        return time >= animation.startTime && time < animation.startTime + animation.duration;
    }

    /** The timeline entered the track: restart its system, or play its clip. */
    private enterTrack(animation: AnimationData): void {
        const system = particleSystemOf(animation);
        if (system !== undefined) {
            this._pendingEndEmit.delete(system);
            system.restart();
            this._batchedRenderer?.addSystem(system);
            return;
        }
        animation.clip?.play?.();
    }

    /**
     * The timeline left the track: a looping track starts over when `mayLoop` (the timeline goes
     * on), anything else ends its system's emission or stops its clip.
     */
    private leaveTrack(animation: AnimationData, mayLoop: boolean): void {
        const system = particleSystemOf(animation);
        if (system !== undefined) {
            if (animation.loop && mayLoop) {
                system.restart();
            } else {
                system.endEmit();
            }
            return;
        }
        if (animation.loop && mayLoop) {
            animation.clip?.play?.();
        } else {
            animation.clip?.stop?.();
        }
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
            const fileId = fileNodeId(node);
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
