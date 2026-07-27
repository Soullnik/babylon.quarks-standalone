import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {IAnimationData, IPrefab} from 'quarks.core';
import {BatchedRenderer} from './BatchedRenderer';
import {ParticleEmitter} from './ParticleEmitter';

export interface QuarksTimelineClip {
    uuid?: string;
    duration?: number;
    play?: () => void;
    pause?: () => void;
    stop?: () => void;
    setTime?: (time: number) => void;
}

export interface AnimationData extends IAnimationData {
    type: 'three' | 'ps';
    target: TransformNode;
    loop: boolean;
    clip?: QuarksTimelineClip;
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

export class QuarksPrefab extends TransformNode implements IPrefab {
    type = 'QuarksPrefab';
    animationData: Array<AnimationData> = [];
    isPlaying = false;
    currentTime = -0.00001;
    timeScale = 1;
    duration = 0;

    private _lastUpdateTimeMs = Date.now();
    private _batchedRenderer?: BatchedRenderer;
    private _tempAnimationJSON: Array<AnimationJSON> = [];

    constructor(name = 'QuarksPrefab', scene?: Scene) {
        super(name, scene);
    }

    registerBatchedRenderer(renderer: BatchedRenderer): void {
        this._batchedRenderer = renderer;
    }

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

    removeAnimation(index: number): void {
        this.animationData.splice(index, 1);
        this.updateDuration();
    }

    play(): void {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._lastUpdateTimeMs = Date.now();
    }

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

    getDuration(): number {
        return this.duration;
    }

    resolveReferences(root: TransformNode): void {
        const nodesMap: {[uuid: string]: TransformNode} = {};
        const traverse = (node: TransformNode) => {
            if ((node as any)._quarksUUID) {
                nodesMap[(node as any)._quarksUUID] = node;
            }
            nodesMap[node.uniqueId.toString()] = node;
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

    toJSON(): any {
        return {
            type: this.type,
            name: this.name,
            animationData: this.animationData.map((animation) => ({
                startTime: animation.startTime,
                duration: animation.duration,
                type: animation.type,
                targetUUID: (animation.target as any)._quarksUUID ?? animation.target.uniqueId.toString(),
                clipUUID: animation.type === 'three' ? (animation.clipUUID ?? animation.clip?.uuid) : undefined,
                loop: animation.loop,
            })),
        };
    }

    static fromJSON(json: any, scene?: Scene): QuarksPrefab {
        const prefab = new QuarksPrefab(json.name || 'QuarksPrefab', scene);
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
