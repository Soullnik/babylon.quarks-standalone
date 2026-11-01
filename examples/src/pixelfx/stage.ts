import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import type {Scene} from '@babylonjs/core/scene';
import type {ParticleSystem} from 'babylon.quarks';
import type {DemoContext} from '../types';
import {c3, makeSystem, type SysOptions} from './kit';

/** One effect in a category's gallery. */
export interface FxDef {
    /** The pixelfx id it is modelled on, `category/name`. */
    id: string;
    name: string;
    /** A looping effect plays on; a one-shot is replayed every `period` seconds. */
    loop: boolean;
    /** Seconds between replays of a one-shot, and the cycle of `every` callbacks for a loop. */
    period: number;
    /** Where a focused view looks: the height it aims at (1.4 m) and its distance (11 m). */
    view?: {height?: number; distance?: number};
    build(fx: FxBuilder): void;
}

export interface PropOptions {
    at?: [number, number, number];
    rotate?: [number, number, number];
    color?: string;
    /** Self-lit colour, for glowing props: coals, crystals, lava. */
    glow?: string;
    alpha?: number;
    parent?: TransformNode;
}

/** What an effect's `build` gets: its own root node and helpers that attach to it. */
export interface FxBuilder {
    scene: Scene;
    /** The effect's root, at the centre of its cell on the floor; +x is screen right, +y up. */
    root: TransformNode;
    /** A particle system parented to the root (or `o.parent`), looping like the effect. */
    sys(o: SysOptions): ParticleSystem;
    /** An empty node under the root, for a moving emitter or a beam end. */
    node(name: string, at?: [number, number, number], parent?: TransformNode): TransformNode;
    /** A stand-in character: a capsule `height` tall standing at `at`. */
    character(at?: [number, number, number], height?: number, color?: string): Mesh;
    /** A simple prop mesh. */
    prop(mesh: Mesh, o?: PropOptions): Mesh;
    /** Runs every frame with the seconds since the effect last started, and the frame delta. */
    every(fn: (t: number, dt: number) => void): void;
}

interface Cell {
    def: FxDef;
    root: TransformNode;
    systems: ParticleSystem[];
    time: number;
    hooks: Array<(t: number, dt: number) => void>;
    center: BVector3;
}

export interface PixelFxStage {
    cells: Cell[];
    focus: number;
    overview: {target: BVector3; radius: number; alpha: number; beta: number};
    /** Where the camera is easing to after a click, until it gets there; angles only for the overview. */
    goal: {target: BVector3; radius: number; alpha?: number; beta?: number} | null;
    /** Scratch for the eased target, so easing allocates nothing. */
    eased: BVector3;
}

const SPACING = 9;
const COLUMNS = 4;

/** A dark material shared by the stand-in props of one scene. */
function propMaterial(scene: Scene, color: string, glow?: string, alpha = 1): StandardMaterial {
    const key = `pixelfx-prop-${color}-${glow ?? ''}-${alpha}`;
    const found = scene.getMaterialByName(key) as StandardMaterial | null;
    if (found) return found;
    const material = new StandardMaterial(key, scene);
    material.diffuseColor = c3(color);
    material.specularColor = new Color3(0.08, 0.08, 0.1);
    if (glow) material.emissiveColor = c3(glow);
    material.alpha = alpha;
    return material;
}

function label(scene: Scene, text: string, parent: TransformNode, index: number): Mesh {
    const texture = new DynamicTexture(`pixelfx-label-${index}`, {width: 512, height: 64}, scene, true);
    texture.hasAlpha = true;
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 64);
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200, 212, 255, 0.85)';
    ctx.fillText(text, 256, 34);
    texture.update(true);
    const material = new StandardMaterial(`pixelfx-label-mat-${index}`, scene);
    material.diffuseTexture = texture;
    material.emissiveColor = new Color3(1, 1, 1);
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    const plane = MeshBuilder.CreatePlane(`pixelfx-label-${index}`, {width: 4, height: 0.5}, scene);
    plane.material = material;
    plane.parent = parent;
    plane.position.set(0, 0.02, 3.4);
    plane.rotation.x = -Math.PI / 2;
    return plane;
}

/**
 * Lays a category's effects out on a floor in rows of four, builds each into its own root, replays
 * the one-shots, and lets a click on a cell move the camera to it (a click on the same cell, or on
 * the floor between cells, goes back to the overview).
 */
export function buildStage(ctx: DemoContext, allDefs: FxDef[]): PixelFxStage {
    const {scene, camera, batchRenderer, systems} = ctx;
    // `?fx=fire/campfire` in the page URL shows that one effect alone.
    const only = new URLSearchParams(location.search).get('fx');
    const picked = allDefs.filter((def) => def.id === only);
    const defs = picked.length ? picked : allDefs;
    const rows = Math.ceil(defs.length / COLUMNS);
    const width = (Math.min(COLUMNS, defs.length) - 1) * SPACING;
    const depth = (rows - 1) * SPACING;

    // Smoke and dust fade where they meet the floor instead of cutting through it.
    if (typeof scene.enableDepthRenderer === 'function') {
        batchRenderer.setDepthTexture(scene.enableDepthRenderer(camera));
    }

    const floor = MeshBuilder.CreateGround(
        'pixelfx-floor',
        {width: width + SPACING * 2, height: depth + SPACING * 2},
        scene
    );
    floor.material = propMaterial(scene, '#101119');
    floor.position.y = -0.01;

    const cells: Cell[] = defs.map((def, index) => {
        const col = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        const center = new BVector3(col * SPACING - width / 2, 0, row * SPACING - depth / 2);
        const root = new TransformNode(`pixelfx-${def.id}`, scene);
        root.position.copyFrom(center);
        const pad = MeshBuilder.CreateDisc(`pixelfx-pad-${index}`, {radius: 3.9, tessellation: 48}, scene);
        pad.rotation.x = Math.PI / 2;
        pad.position.y = 0.001;
        pad.parent = root;
        pad.material = propMaterial(scene, '#171a26');
        pad.metadata = {pixelfxCell: index};
        const tag = label(scene, def.name, root, index);
        tag.metadata = {pixelfxCell: index};
        const cell: Cell = {def, root, systems: [], time: 0, hooks: [], center};
        const builder: FxBuilder = {
            scene,
            root,
            sys(o) {
                const system = makeSystem(
                    scene,
                    {...o, parent: o.parent ?? root},
                    {loop: def.loop, duration: def.period}
                );
                batchRenderer.addSystem(system);
                systems.push(system);
                cell.systems.push(system);
                return system;
            },
            node(name, at, parent) {
                const node = new TransformNode(`${def.id}-${name}`, scene);
                node.parent = parent ?? root;
                if (at) node.position.set(...at);
                return node;
            },
            character(at = [0, 0, 0], height = 1.8, color = '#2a2d3a') {
                const body = MeshBuilder.CreateCapsule(`${def.id}-character`, {height, radius: height * 0.2}, scene);
                return builder.prop(body, {at: [at[0], at[1] + height / 2, at[2]], color});
            },
            prop(mesh, o = {}) {
                mesh.parent = o.parent ?? root;
                if (o.at) mesh.position.set(...o.at);
                if (o.rotate) mesh.rotation.set(...o.rotate);
                mesh.material = propMaterial(scene, o.color ?? '#2a2d3a', o.glow, o.alpha);
                mesh.metadata = {pixelfxCell: index};
                return mesh;
            },
            every(fn) {
                cell.hooks.push(fn);
            },
        };
        def.build(builder);
        for (const system of cell.systems) system.play();
        for (const hook of cell.hooks) hook(0, 0);
        return cell;
    });

    const target = new BVector3(0, 1.2, SPACING * 0.15);
    const radius = defs.length === 1 ? 9 : Math.max(width * 0.85, depth * 1.25, 12) + 5;
    // Looking from +z toward -z, so +x is screen right and the first row is at the back.
    const alpha = Math.PI / 2;
    const beta = 0.95;
    // setTarget keeps the camera's position, so aim first, then place it.
    camera.setTarget(target.clone());
    camera.alpha = alpha;
    camera.beta = beta;
    camera.radius = radius;
    camera.upperRadiusLimit = radius * 2;
    camera.lowerRadiusLimit = 3;
    const stage: PixelFxStage = {
        cells,
        focus: -1,
        overview: {target, radius, alpha, beta},
        goal: null,
        eased: new BVector3(),
    };

    const focusOn = (index: number) => {
        if (index < 0 || index === stage.focus) {
            stage.focus = -1;
            const {target, radius, alpha, beta} = stage.overview;
            stage.goal = {target: target.clone(), radius, alpha, beta};
            return;
        }
        stage.focus = index;
        const view = cells[index].def.view;
        stage.goal = {
            target: cells[index].center.add(new BVector3(0, view?.height ?? 1.4, 0)),
            radius: view?.distance ?? 11,
        };
        // Play the focused effect again from its start.
        const cell = cells[index];
        cell.time = 0;
        for (const system of cell.systems) {
            system.restart();
            system.play();
        }
    };
    const observer = scene.onPointerObservable.add((info) => {
        if (info.type !== PointerEventTypes.POINTERTAP) return;
        const pick = scene.pick(
            scene.pointerX,
            scene.pointerY,
            (mesh: AbstractMesh) => mesh.isPickable && mesh.isEnabled()
        );
        const hit = pick?.pickedMesh?.metadata?.pixelfxCell;
        focusOn(typeof hit === 'number' ? hit : -1);
    });
    scene.onDisposeObservable.addOnce(() => {
        scene.onPointerObservable.remove(observer);
        delete (window as never as {__pixelfx?: unknown}).__pixelfx;
    });
    // Debug/testing hook, like the viewer's `__quarksViewer`: focus a cell from the console or a script.
    const debug = window as never as {__pixelfx?: unknown};
    debug.__pixelfx = {focus: focusOn, periods: cells.map((cell) => cell.def.period)};
    return stage;
}

/** Advances every cell: replays one-shots each period and runs the effects' frame hooks. */
export function updateStage(stage: PixelFxStage | undefined, ctx: DemoContext, delta: number): void {
    if (!stage) return;
    // Systems cap a frame at 0.1 s; cap the effects' clocks the same so hooks stay in step with bursts.
    delta = Math.min(delta, 0.1);
    for (const cell of stage.cells) {
        cell.time += delta;
        if (cell.time >= cell.def.period) {
            cell.time -= cell.def.period;
            if (!cell.def.loop) {
                for (const system of cell.systems) {
                    system.restart();
                    system.play();
                }
            }
        }
        for (const hook of cell.hooks) hook(cell.time, delta);
    }
    // Ease the camera toward the focused cell (or back to the overview).
    const camera = ctx.camera;
    const k = 1 - Math.exp(-delta * 5);
    const target = camera.getTarget();
    const goal = stage.goal;
    if (!goal) return;
    const angles =
        goal.alpha === undefined || goal.beta === undefined
            ? 0
            : Math.abs(camera.alpha - goal.alpha) + Math.abs(camera.beta - goal.beta);
    if (
        BVector3.Distance(target, goal.target) < 0.01 &&
        Math.abs(camera.radius - goal.radius) < 0.01 &&
        angles < 0.001
    ) {
        stage.goal = null;
        return;
    }
    // Move the orbit centre, keeping the camera's angles (setTarget would turn it in place).
    BVector3.LerpToRef(target, goal.target, k, stage.eased);
    camera.setTarget(stage.eased, false, false, true);
    camera.radius += (goal.radius - camera.radius) * k;
    if (goal.alpha !== undefined && goal.beta !== undefined) {
        camera.alpha += (goal.alpha - camera.alpha) * k;
        camera.beta += (goal.beta - camera.beta) * k;
    }
}

/** A cylinder, box, sphere and the like, ready for `prop`. */
export const shapes = {
    box: (scene: Scene, w: number, h: number, d: number) =>
        MeshBuilder.CreateBox('pixelfx-box', {width: w, height: h, depth: d}, scene),
    cylinder: (scene: Scene, height: number, top: number, bottom = top, tessellation = 16) =>
        MeshBuilder.CreateCylinder(
            'pixelfx-cyl',
            {height, diameterTop: top * 2, diameterBottom: bottom * 2, tessellation},
            scene
        ),
    sphere: (scene: Scene, r: number, segments = 12) =>
        MeshBuilder.CreateSphere('pixelfx-sphere', {diameter: r * 2, segments}, scene),
    torus: (scene: Scene, r: number, thickness: number) =>
        MeshBuilder.CreateTorus('pixelfx-torus', {diameter: r * 2, thickness, tessellation: 24}, scene),
    ico: (scene: Scene, r: number) =>
        MeshBuilder.CreateIcoSphere('pixelfx-ico', {radius: r, subdivisions: 1, flat: true}, scene),
    poly: (scene: Scene, type: number, size: number) =>
        MeshBuilder.CreatePolyhedron('pixelfx-poly', {type, size}, scene),
};
