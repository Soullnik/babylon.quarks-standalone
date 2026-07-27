import type {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import type {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {Scene} from "@babylonjs/core/scene";
import type {BatchedRenderer, ParticleSystem} from "babylon.quarks";

export interface DemoState {
    totalTime?: number;
    refreshIndex?: number;
    explosion?: {elapsed: number; systems: ParticleSystem[]};
    subEmitter?: {elapsed: number; trackedSystems: ParticleSystem[]};
    droppedJsonPreview?: {elapsed: number; systems: ParticleSystem[]};
    followObject?: {elapsed: number; leader: Mesh; camera: ArcRotateCamera};
    electricBall?: {tracked: ParticleSystem[]; x: number};
    levelUp?: {tracked: ParticleSystem[]; elapsed: number};
    pickUp?: {tracked: ParticleSystem[]; elapsed: number};
}

export interface DemoContext {
    scene: Scene;
    camera: ArcRotateCamera;
    batchRenderer: BatchedRenderer;
    systems: ParticleSystem[];
    demoState: DemoState;
}

export type DemoInit = (ctx: DemoContext) => void | Promise<void>;
export type DemoUpdate = (ctx: DemoContext, delta: number) => void;

export interface DemoModule {
    init: DemoInit;
    update?: DemoUpdate;
}

export interface DemoPreview {
    icon: string;
    gradient: string;
}

export interface DemoManifestEntry {
    key: string;
    name: string;
    module: string;
    sourcePath: string;
    description: string;
    tags: string[];
    preview: DemoPreview;
}

export interface DemoDefinition extends DemoManifestEntry {
    init: DemoInit;
    onFrame?: DemoUpdate;
}
