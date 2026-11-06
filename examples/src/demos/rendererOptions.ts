import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    Bezier,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PiecewiseBezier,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/**
 * Seven pairs of systems, each pair the same effect with one renderer option
 * off on the left and on on the right. Read left to right:
 *
 * 1. `sortMode`: overlapping alpha-blended discs drawn in emission order, then
 *    sorted back to front so the nearest one is always on top.
 * 2. `alignToDirection`: mesh darts all pointing the emitter's +Z (up, the way
 *    the emitter is turned), then each turned along the direction its cone
 *    sends it (Unity's Align To Direction).
 * 3. `minParticleSize` / `maxParticleSize`: sizes from tiny to huge, then
 *    clamped on screen to between 2% and 6% of the viewport height.
 * 4. `scalingMode`: an emitter under a parent scaled 3×. In `'shape'` mode
 *    only the shape grows; in `'hierarchy'` mode the particles and their
 *    speed grow with it. (`'local'`, the default, would leave out the
 *    parent's scale altogether, as Unity's Local does.)
 * 5. `renderFace`: open bowls tumbling as mesh particles. With `'both'` their
 *    inside shows through the opening; with `'front'` the back faces are
 *    culled and the inside disappears, as with Unity's Render Face: Front.
 * 6. `renderAlignment`: flat quad meshes from an emitter turned a quarter
 *    about Y. In `'simulation'`, the default, they turn with the emitter and
 *    are seen edge-on; in `'view'` they are laid along the camera's axes and
 *    face it, spinning in the screen's plane (Unity's Render Alignment: View).
 * 7. `renderAlignment` on billboards: rings from an emitter turned to lie on
 *    the ground. With `'view'`, the default, they face the camera; with
 *    `'local'` they lie in the emitter's plane, flat on the ground, however
 *    the camera turns (Unity's Render Alignment: Local, as on a decal).
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(3, 6, 36));
    const texture = createSharedTexture(scene);
    const columnX = (pair: number, side: 0 | 1) => -16.5 + pair * 6 + side * 3;

    const add = (parameters: ParticleSystemParameters, x: number, parent?: TransformNode) => {
        const system = new ParticleSystem(parameters);
        system.emitter.position = new BVector3(x, 0, 0);
        if (parent) {
            system.emitter.parent = parent;
        }
        batchRenderer.addSystem(system);
        systems.push(system);
        return system;
    };

    // 1. Sort mode: large slow discs with distinct colours, alpha-blended so order shows.
    const discs = (sortMode: ParticleSystemParameters['sortMode']): ParticleSystemParameters => ({
        scene,
        duration: 3,
        looping: true,
        startLife: new ConstantValue(3),
        startSpeed: new IntervalValue(0.3, 0.6),
        startSize: new ConstantValue(2.6),
        startColor: new RandomColor(new Color4(1, 0.3, 0.2, 1), new Color4(0.2, 0.5, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(4),
        shape: new SphereEmitter({radius: 0.8, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        sortMode,
    });
    add(discs('none'), columnX(0, 0));
    add(discs('distance'), columnX(0, 1));

    // 2. Align to direction: a dart mesh whose tip is at +Z.
    const dart = MeshBuilder.CreateCylinder(
        'dart',
        {diameterTop: 0, diameterBottom: 0.35, height: 1, tessellation: 6},
        scene
    );
    dart.rotation.x = Math.PI / 2; // the cone points +Y; turn its tip to +Z
    dart.bakeCurrentTransformIntoVertices();
    dart.isVisible = false;
    dart.setEnabled(false);
    const dartGeometry = {
        instancingGeometry: new Float32Array(dart.getVerticesData(VertexBuffer.PositionKind)!),
        instancingNormals: new Float32Array(dart.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(dart.getVerticesData(VertexBuffer.UVKind)!),
        instancingIndices: new Uint32Array(dart.getIndices()!),
    };
    const darts = (alignToDirection: boolean): ParticleSystemParameters => ({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(1.6),
        startSpeed: new ConstantValue(4),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Color4(1, 0.85, 0.3, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(12),
        shape: new ConeEmitter({radius: 0.3, angle: 1}),
        texture,
        transparent: false,
        renderMode: RenderMode.Mesh,
        ...dartGeometry,
        alignToDirection,
    });
    for (const side of [0, 1] as const) {
        const system = add(darts(side === 1), columnX(1, side));
        system.emitter.rotation.x = -Math.PI / 2; // the cone emits along +Z; aim it up
        system.emitter.position.y = -3;
    }

    // 3. Screen-size limits: sizes from a pinprick to a boulder.
    const stars = (limits: boolean): ParticleSystemParameters => ({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(1.8),
        startSpeed: new IntervalValue(0.5, 1.5),
        startSize: new IntervalValue(0.05, 3),
        startColor: new ConstantColor(new Color4(0.6, 0.9, 1, 0.7)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(10),
        shape: new SphereEmitter({radius: 0.5, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        ...(limits ? {minParticleSize: 0.02, maxParticleSize: 0.06} : {}),
    });
    add(stars(false), columnX(2, 0));
    add(stars(true), columnX(2, 1));

    // 4. Scaling mode: the same fountain under a parent scaled 3×, simulated in world space.
    const fountain = (scalingMode: ParticleSystemParameters['scalingMode']): ParticleSystemParameters => ({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(1.5),
        startSpeed: new ConstantValue(2),
        startSize: new ConstantValue(0.3),
        startColor: new ConstantColor(new Color4(0.5, 1, 0.5, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(40),
        shape: new ConeEmitter({radius: 0.4, angle: 0.3}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        scalingMode,
    });
    for (const side of [0, 1] as const) {
        const parent = new TransformNode(`scaled${side}`, scene);
        parent.position = new BVector3(columnX(3, side), -3, 0);
        parent.scaling.setAll(3);
        parent.rotation.x = -Math.PI / 2;
        const system = add(fountain(side === 1 ? 'hierarchy' : 'shape'), 0, parent);
        system.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 1, 0.6, 0), 0]])));
    }

    // 5. Render face: an open hemisphere, its inside visible through the opening unless culled.
    const bowl = MeshBuilder.CreateSphere('bowl', {diameter: 1, segments: 12, slice: 0.5}, scene);
    bowl.isVisible = false;
    bowl.setEnabled(false);
    const bowls = (renderFace: ParticleSystemParameters['renderFace']): ParticleSystemParameters => ({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(3),
        startSpeed: new ConstantValue(0.4),
        startSize: new ConstantValue(1.2),
        startRotation: new RandomQuatGenerator(),
        startColor: new RandomColor(new Color4(1, 0.6, 0.3, 1), new Color4(0.4, 0.8, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(3),
        shape: new SphereEmitter({radius: 1, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: false,
        renderMode: RenderMode.Mesh,
        instancingGeometry: new Float32Array(bowl.getVerticesData(VertexBuffer.PositionKind)!),
        instancingNormals: new Float32Array(bowl.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(bowl.getVerticesData(VertexBuffer.UVKind)!),
        instancingIndices: new Uint32Array(bowl.getIndices()!),
        renderFace,
    });
    add(bowls('both'), columnX(4, 0));
    add(bowls('front'), columnX(4, 1));

    // 6. Render alignment: quads in their mesh's XY plane, from an emitter turned to face sideways.
    const quad = MeshBuilder.CreatePlane('quad', {size: 1}, scene);
    quad.isVisible = false;
    quad.setEnabled(false);
    const quads = (renderAlignment: ParticleSystemParameters['renderAlignment']): ParticleSystemParameters => ({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(3),
        startSpeed: new IntervalValue(0.3, 0.6),
        startSize: new ConstantValue(2.2),
        // An angle about the mesh's Z: a spin in the quad's own plane.
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 0.8, 0.3, 1), new Color4(1, 0.4, 0.7, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(4),
        shape: new SphereEmitter({radius: 1, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Mesh,
        renderFace: 'both',
        lighting: 'unlit',
        instancingGeometry: new Float32Array(quad.getVerticesData(VertexBuffer.PositionKind)!),
        instancingNormals: new Float32Array(quad.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(quad.getVerticesData(VertexBuffer.UVKind)!),
        instancingIndices: new Uint32Array(quad.getIndices()!),
        renderAlignment,
    });
    for (const side of [0, 1] as const) {
        const system = add(quads(side === 1 ? 'view' : 'simulation'), columnX(5, side));
        system.emitter.rotation.y = Math.PI / 2;
    }

    // 7. Render alignment on billboards: rings spreading from an emitter whose XY plane is the ground.
    const rings = (renderAlignment: ParticleSystemParameters['renderAlignment']): ParticleSystemParameters => ({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(2),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1.2),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(0.4, 1, 0.8, 1), new Color4(0.3, 0.6, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(3),
        shape: new SphereEmitter({radius: 0.01, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderAlignment,
    });
    for (const side of [0, 1] as const) {
        const system = add(rings(side === 1 ? 'local' : 'view'), columnX(6, side));
        system.emitter.rotation.x = Math.PI / 2;
        system.emitter.position.y = -2;
        system.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 2.5, 4, 5), 0]])));
    }
}
