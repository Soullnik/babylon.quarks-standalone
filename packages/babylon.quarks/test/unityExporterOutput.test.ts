/**
 * What the Unity exporter writes, read back by the runtime. The exporter's own tests
 * (`tools/unity-quarks-exporter/Tests~`, run with `npm run test:exporter`) export Shuriken effects
 * built in code and keep the JSON as golden files. Here every one of those files must load with a
 * strict loader, so a shape, behavior or value the runtime cannot read fails, and must carry what
 * the effect was set up with in Unity.
 */
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {Node} from '@babylonjs/core/node';
import {Scene} from '@babylonjs/core/scene';
import * as fs from 'fs';
import * as path from 'path';
import {
    ConeEmitFrom,
    ConeEmitter,
    ForceOverLife,
    FrameOverLife,
    InheritVelocity,
    LimitSpeedOverLife,
    loadPlugin,
    ParticleStore,
    Quaternion,
    RandomBetweenCurves,
    Rotation3DOverLife,
    SizeBySpeed,
    SpriteParticle,
    TrailParticle,
    Vector3,
    Vector3Function,
    VelocityOverLife,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';
import type {ParticleEmitter} from '../src/ParticleEmitter';
import type {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {QUARKS_FORMAT_VERSION} from '../src/QuarksSerializer';
import {QuarksUtil} from '../src/QuarksUtil';
import {RenderMode} from '../src/VFXBatch';

const GOLDEN = path.join(__dirname, '../../../tools/unity-quarks-exporter/Tests~/golden');
const inline = fs.readdirSync(GOLDEN).filter((name) => name.endsWith('.json'));
const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(GOLDEN, file), 'utf8'));

describe('Unity exporter output', () => {
    let engine: NullEngine;
    let scene: Scene;
    let roots: Node[];

    beforeAll(() => loadPlugin(MeshSurfaceEmitterPlugin));

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        roots = [];
    });

    afterEach(() => {
        roots.forEach((root) => QuarksLoader.disposeEffect(root as never));
        scene.dispose();
        engine.dispose();
    });

    /** The effect in `file`, loaded strictly, and its systems by name. */
    const load = (file: string) => {
        const root = new QuarksLoader(scene, {strict: true}).parse(read(file));
        roots.push(root);
        const systems = new Map<string, ParticleSystem>();
        QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) =>
            systems.set(emitter.name, emitter.system as ParticleSystem)
        );
        return {root, systems, system: (name: string) => systems.get(name)!};
    };

    it('has the golden files of every fixture', () => {
        expect(inline.sort()).toEqual([
            'billboard.json',
            'blending.json',
            'flipbooks.json',
            'mesh.json',
            'surfaces.json',
            'trails.json',
        ]);
        const files = (dir: string): string[] =>
            fs
                .readdirSync(path.join(GOLDEN, dir), {withFileTypes: true})
                .flatMap((entry) => (entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
        expect(files('files').sort()).toEqual([
            'files/mesh.json',
            'files/shared/geometries/FadedQuad.json',
            'files/shared/geometries/Quad.json',
            'files/shared/geometries/Quad_2.json',
            'files/shared/textures/spark.png.size.txt',
            'files/trails.json',
        ]);
    });

    it.each(inline)('%s loads strictly and simulates', (file) => {
        const {root, systems} = load(file);
        expect(systems.size).toBeGreaterThan(0);
        const renderer = new BatchedRenderer('renderer', scene);
        QuarksUtil.addToBatchRenderer(root, renderer);
        QuarksUtil.play(root);
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);
        renderer.dispose();
    });

    it('names the exporter and the format', () => {
        const json = read('billboard.json') as {metadata: Record<string, unknown>};
        expect(json.metadata.generator).toBe('babylon.quarks Unity exporter {version}');
        expect(json.metadata.quarksFormat).toBe(QUARKS_FORMAT_VERSION);
    });

    it('keeps a billboard effect: shape arc, material map layout and soft particles', () => {
        const sparks = load('billboard.json').system('Sparks');
        expect(sparks.renderMode).toBe(RenderMode.BillBoard);
        expect(sparks.blending).toBe(Constants.ALPHA_ADD);
        expect(sparks.worldSpace).toBe(true);
        expect(sparks.seed).toBe(4000000001);
        expect(sparks.cullingMode).toBe('pause');
        // Stop Action and Ring Buffer Mode, with its loop range.
        expect(sparks.stopAction).toBe('destroy');
        expect(sparks.ringBufferMode).toBe('loopUntilReplaced');
        expect([sparks.ringBufferLoopRange.x, sparks.ringBufferLoopRange.y]).toEqual([0.25, 0.75]);
        expect(sparks.sortMode).toBe('distance');
        expect(sparks.mapUV).toEqual({channel: 0, tiling: [2, 1], offset: [0.5, 0], scroll: [0, 0]});
        const texture = sparks.texture as Texture;
        expect(texture.wrapU).toBe(Texture.WRAP_ADDRESSMODE);
        expect(sparks.softParticles).toBe(true);
        expect(sparks.softNearFade).toBeCloseTo(0.1);
        expect(sparks.softFarFade).toBe(2);
        expect(sparks.uTileCount).toBe(2);
        expect(sparks.emitterShape.toJSON()).toMatchObject({
            type: 'cone',
            mode: 1,
            spread: 0.25,
            arc: expect.any(Number),
        });
        expect(sparks.behaviors.map((b) => b.type)).toEqual([
            'FrameOverLife',
            'ForceOverLife',
            'ColorOverLife',
            'SizeOverLife',
            'RotationOverLife',
            'InheritVelocity',
            'Noise',
        ]);
    });

    it("lays Local and World billboards in their axes' plane and leaves the rest facing the camera", () => {
        const {system} = load('billboard.json');
        const scorch = system('Scorch');
        expect(scorch.renderAlignment).toBe('local');
        // Unity's 30°, clockwise as seen from the quad's front, is quarks' -30°.
        expect(scorch.startRotation.toJSON()).toEqual({type: 'ConstantValue', value: expect.closeTo(-Math.PI / 6, 6)});
        expect(system('Ripples').renderAlignment).toBe('world');
        // Unity draws a stretched billboard the same for every alignment; Facing and Velocity
        // are left out with a warning.
        for (const name of ['Sparks', 'Streaks', 'Flares', 'Glints']) {
            expect([name, system(name).renderAlignment]).toEqual([name, 'simulation']);
        }
    });

    it('keeps which axis a node is mirrored on, and sends a Local system below it as Unity does', () => {
        const {root, system} = load('billboard.json');
        const mirrored = root.getDescendants(false).find((node) => node.name === 'MirroredRoot');
        expect((mirrored as ParticleEmitter).scaling.asArray()).toEqual([
            expect.closeTo(-1.2, 6),
            expect.closeTo(0.8, 6),
            expect.closeTo(1.1, 6),
        ]);
        const hand = system('Hand');
        expect(hand.scalingMode).toBe('local');
        root.computeWorldMatrix(true);
        for (const node of root.getDescendants(false)) node.computeWorldMatrix(true);
        hand.restart();
        const step = 1 / 60;
        hand.update(step);
        expect(hand.particleNum).toBe(1);
        // Where Unity 6 sends the particle (the rootX case of scalingMode.test.ts): from where it was born, at its
        // speed of 1 scaled by the node's own scale, the root's mirror left out of the Local system.
        const p = hand.particles[0];
        const born = p.position.clone().addScaledVector(p.velocity, -p.age);
        expect(born.toArray()).toEqual([0.5581, -0.6404, 0.5956].map((v) => expect.closeTo(v, 3)));
        expect(p.velocity.toArray()).toEqual([-0.7011, -0.7928, 0.1007].map((v) => expect.closeTo(v, 3)));
    });

    it('spins a mesh ring with a 2D rotation level, about the axis Unity picks', () => {
        const {system} = load('mesh.json');
        const ring = system('Ring');
        expect(ring.rotationAxis).toBe('emission');
        // Randomize Direction does nothing to a cone emitting from its base in Unity.
        expect(ring.behaviors.map((b) => b.type)).not.toContain('RandomizeDirection');
        // A 3D start rotation turns about the three axes; the axis is for a 2D one.
        expect(system('Chunks').rotationAxis).toBe('z');
        ring.restart();
        for (let i = 0; i < 20; i++) ring.update(1 / 30);
        expect(ring.particleNum).toBeGreaterThan(0);
        const up = new Vector3(0, 1, 0);
        for (const p of ring.particles.slice(0, ring.particleNum)) {
            expect(p.rotationAxis!.distanceTo(up)).toBeLessThan(1e-6);
            expect(
                up
                    .clone()
                    .applyQuaternion(p.rotation as Quaternion)
                    .distanceTo(up)
            ).toBeLessThan(1e-5);
        }
    });

    it('lays meshes Unity rotates in 3D by their Euler angles, the 2D start rotation about Z', () => {
        const {system} = load('mesh.json');
        // Separate Axes on Rotation over Lifetime or on Rotation by Speed: Unity leaves
        // axisOfRotation unused. On a module that is off it does nothing (the Ring keeps its axis).
        const petals = system('Petals');
        expect(petals.rotationAxis).toBe('z');
        expect(system('Vanes').rotationAxis).toBe('z');
        petals.restart();
        for (let i = 0; i < 20; i++) petals.update(1 / 30);
        expect(petals.particleNum).toBeGreaterThan(1);
        // However the 25 degree cone sends them, every petal stays in the emitter's XY plane, as
        // in Unity, and they are turned by different angles about Z.
        const z = new Vector3(0, 0, 1);
        const x = new Vector3(1, 0, 0);
        const angles = new Set<number>();
        for (const p of petals.particles.slice(0, petals.particleNum)) {
            const q = p.rotation as Quaternion;
            expect(z.clone().applyQuaternion(q).distanceTo(z)).toBeLessThan(1e-5);
            const turned = x.clone().applyQuaternion(q);
            angles.add(Math.round(Math.atan2(turned.y, turned.x) * 100));
        }
        expect(angles.size).toBeGreaterThan(1);
    });

    it('emits from a Mesh shape without its mesh as Unity does from no shape: at the origin, along +Z', () => {
        const {system} = load('mesh.json');
        const spokes = system('Spokes');
        // Unity ignores the shape's Randomize Direction, Align to Direction and position, and turns
        // the meshes about their own Z (measured in Unity 6).
        expect(spokes.behaviors.map((b) => b.type)).not.toContain('RandomizeDirection');
        expect(spokes.alignToDirection).toBe(false);
        expect(spokes.rotationAxis).toBe('z');
        spokes.restart();
        for (let i = 0; i < 5; i++) spokes.update(1 / 30);
        expect(spokes.particleNum).toBeGreaterThan(0);
        for (const p of spokes.particles.slice(0, spokes.particleNum)) {
            expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeLessThan(1e-6);
            expect(p.velocity.z).toBeGreaterThan(0);
        }
    });

    it('keeps mesh particles: opaque cutout surface, render face, hierarchy scaling, both UV sets and vertex colours', () => {
        const {system} = load('mesh.json');
        const chunks = system('Chunks');
        expect(chunks.renderMode).toBe(RenderMode.Mesh);
        expect(chunks.transparent).toBe(false);
        expect(chunks.depthWrite).toBe(true);
        expect(chunks.alphaTest).toBeCloseTo(0.3);
        expect(chunks.renderFace).toBe('front');
        // Unity's default Render Alignment, View: a quad mesh faces the camera.
        expect(chunks.renderAlignment).toBe('view');
        // Facing is approximated by View, with a warning in the export log.
        expect(system('Shards').renderAlignment).toBe('view');
        expect(chunks.scalingMode).toBe('hierarchy');
        expect(chunks.playbackSpeed).toBe(1.5);
        expect(chunks.instancingUVs2).toHaveLength(8);
        // The mesh had no normals; the runtime gives it its own.
        expect(chunks.getRendererSettings().instancingNormals).toHaveLength(12);
        // Its vertex colours were all white, which multiply by 1: left out.
        expect(chunks.instancingColors).toBeUndefined();
        // The ring's mesh fades out at one side by its vertex colours, read as they are.
        expect(Array.from(system('Ring').instancingColors!)).toEqual(
            [0, 0, 0, 1, 0.2, 0.2, 0.2, 1, 1, 1, 1, 1, 1, 1, 1, 1].map(Math.fround)
        );
        expect(chunks.behaviors.map((b) => b.type)).toEqual(
            expect.arrayContaining(['Rotation3DOverLife', 'LimitSpeedOverLife'])
        );
        // Unity adds the separate-axes rates to the particle's Euler angles.
        const spin = chunks.behaviors.find((b) => b.type === 'Rotation3DOverLife') as Rotation3DOverLife;
        expect(spin.integration).toBe('angles');
        const dust = system('Dust');
        expect(dust.transparent).toBe(true);
        expect(dust.blending).toBe(Constants.ALPHA_COMBINE);
        // Local, Unity's default and the runtime's, is left out of the file.
        expect(dust.scalingMode).toBe('local');
        // A billboard takes no render alignment; it already faces the camera.
        expect(dust.renderAlignment).toBe('simulation');
        // A cone volume takes Randomize Direction, as in Unity; a cone emitting from its base does not.
        expect(dust.behaviors.map((b) => b.type)).toContain('RandomizeDirection');
        // Cone Volume, with its Length.
        const cone = dust.emitterShape as ConeEmitter;
        expect(cone.type).toBe('cone');
        expect(cone.emitFrom).toBe(ConeEmitFrom.Volume);
        expect(cone.length).toBe(2);
        // Random Between Two Curves, with both of its curves.
        expect(dust.startSpeed).toBeInstanceOf(RandomBetweenCurves);
        // Limit Velocity with Separate Axes, in world space.
        const limit = dust.behaviors.find((b) => b.type === 'LimitSpeedOverLife') as LimitSpeedOverLife;
        expect(limit.speed).toBeInstanceOf(Vector3Function);
        expect(limit.space).toBe('world');
    });

    it('keeps trails, sub-emitters and a hidden mesh emitter source', () => {
        const {root, system} = load('trails.json');
        const rocket = system('Rocket');
        // The legacy Alpha Blended Premultiply's texture is premultiplied, and drawn so; the
        // trail beside it shares the material.
        expect(rocket.premultipliedMap).toBe(true);
        expect(system('Rocket trail').premultipliedMap).toBe(true);
        // Its Tint Color, doubled in linear space as the legacy shaders double it, is the
        // material colour, not folded into the particles' colours.
        for (const ps of [rocket, system('Rocket trail')]) {
            expect(ps.materialColor).toEqual({r: 0.5, g: 0.5, b: 0.5, a: 0.5});
            expect(ps.materialColorScale).toBe(2);
        }
        // The renderer's Sorting Fudge; a Trail Renderer has none.
        expect(rocket.sortingFudge).toBe(-2.5);
        expect(system('Rocket trail').sortingFudge).toBe(0);
        expect(rocket.renderMode).toBe(RenderMode.StretchedBillBoard);
        expect(rocket.blending).toBe(Constants.ALPHA_PREMULTIPLIED);
        expect(rocket.emitterShape.type).toBe('mesh_surface');
        expect(rocket.stopAction).toBe('disable');
        expect(rocket.behaviors.filter((b) => b.type === 'EmitSubParticleSystem')).toHaveLength(2);
        // Force over Lifetime's Randomize.
        expect((rocket.behaviors.find((b) => b.type === 'ForceOverLife') as ForceOverLife).randomized).toBe(true);
        const smoke = system('Smoke');
        expect(smoke.renderMode).toBe(RenderMode.Trail);
        expect(smoke.blending).toBe(Constants.ALPHA_SUBTRACT);
        expect(smoke.onlyUsedByOther).toBe(true);
        expect(smoke.scalingMode).toBe('shape');
        // Size by Speed with Separate Axes, one curve per axis.
        const sizeBySpeed = system('TrailSparks').behaviors.find((b) => b.type === 'SizeBySpeed') as SizeBySpeed;
        expect(sizeBySpeed.size).toBeInstanceOf(Vector3Function);
        const source = root.getChildMeshes(false).find((mesh) => mesh.name.endsWith('(emitter source)')) as Mesh;
        expect(source.isVisible).toBe(false);
    });

    it('draws the trails of particles that never show, as all Unity draws of them', () => {
        const {system} = load('trails.json');
        // Start alpha 0 and a trail of its own colour: a trail system, seen as Unity draws it.
        const wisp = system('Wisp');
        expect(wisp.renderMode).toBe(RenderMode.Trail);
        expect(wisp.startColor.toJSON()).toMatchObject({color: {a: 1}});
        // The same particles shown keep their render mode; a quarks system draws one.
        expect(system('WispShown').renderMode).toBe(RenderMode.BillBoard);
    });

    it('inherits the emitter velocity only where Unity does', () => {
        const inherit = (ps: ParticleSystem) =>
            ps.behaviors.find((b) => b.type === 'InheritVelocity') as InheritVelocity;
        // World space, Initial mode: a quarter of the emitter's velocity at birth.
        const sparks = inherit(load('billboard.json').system('Sparks'));
        expect(sparks.mode).toBe('initial');
        expect(sparks.multiplier.genValue([], 0)).toBe(0.25);
        // A Local system inherits nothing in Unity, in either mode, nor a Custom one in Current
        // mode (measured in Unity 6): a projectile's smoke, Local and Current, flew
        // ahead of it instead of trailing behind it.
        const {system} = load('trails.json');
        expect(inherit(system('Rocket'))).toBeUndefined();
        expect(inherit(system('TrailSparks'))).toBeUndefined();
    });

    it("holds a curve's end keys before and after them, as Unity", () => {
        const velocity = load('trails.json')
            .system('Rocket')
            .behaviors.find((b) => b.type === 'VelocityOverLife') as VelocityOverLife;
        const at = (curve: VelocityOverLife['linearX'], t: number) => curve.genValue([], t);
        // x: keys 1 at 0 and 0 at 0.033, times 2. A bullet hole moves so for its
        // first 0.13 s and then rests (measured in Unity 6); it used to slide on for its whole life.
        expect(at(velocity.linearX, 0)).toBeCloseTo(2, 5);
        expect(at(velocity.linearX, 0.0165)).toBeCloseTo(1, 2);
        for (const t of [0.033, 0.1, 0.5, 1]) expect(at(velocity.linearX, t)).toBeCloseTo(0, 5);
        // z: a ramp from 0 at 0.5 to 1 at 1, and 0 before it.
        for (const t of [0, 0.25, 0.5]) expect(at(velocity.linearZ, t)).toBeCloseTo(0, 5);
        expect(at(velocity.linearZ, 0.75)).toBeCloseTo(0.5, 2);
        expect(at(velocity.linearZ, 1)).toBeCloseTo(1, 5);
    });

    it('draws a Trail Renderer as a trail of the path its node takes, tapering and fading', () => {
        const {system} = load('trails.json');
        const tracer = system('Tracer');
        expect(tracer.renderMode).toBe(RenderMode.Trail);
        expect(tracer.behaviors.map((b) => b.type)).toEqual(['WidthOverLength', 'ColorOverLength']);
        // Beside a particle system, the trail is a system of its own.
        expect(system('Rocket trail').renderMode).toBe(RenderMode.Trail);
        for (let i = 0; i <= 20; i++) {
            tracer.emitter.position.x = i * 0.1;
            tracer.emitter.computeWorldMatrix(true);
            tracer.update(1 / 60);
        }
        expect(tracer.particleNum).toBe(1);
        const trail = tracer.particles[0] as TrailParticle;
        const oldest = trail.getHistoryIndex(0);
        const newest = trail.getHistoryIndex(trail.historyCount - 1);
        // The samples lie along the path, laid every Min Vertex Distance at most.
        expect(trail.historyPositions[newest * 3] - trail.historyPositions[oldest * 3]).toBeGreaterThan(1.5);
        // The Color gradient fades the tail out and keeps the head opaque.
        expect(trail.historyColors[oldest * 4 + 3]).toBeLessThan(0.2);
        expect(trail.historyColors[newest * 4 + 3]).toBeGreaterThan(0.8);
        expect(trail.historySizes[oldest]).toBeLessThan(trail.historySizes[newest]);
        // Its node is scaled to 0; the trail keeps its world width all the same.
        expect(tracer.scalingMode).toBe('shape');
        const axis = tracer.emitter.matrixWorld.elements;
        expect(Math.hypot(axis[0], axis[1], axis[2])).toBeCloseTo(1, 6);
    });

    it('reads each Unity blend set-up as the Babylon alpha mode that blends the same way', () => {
        const {system} = load('blending.json');
        const blending = (name: string) => ({
            blending: system(name).blending,
            transparent: system(name).transparent,
        });
        expect(blending('UrpAlpha')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        expect(blending('UrpPremultiply')).toEqual({blending: Constants.ALPHA_PREMULTIPLIED, transparent: true});
        expect(blending('UrpAdditive')).toEqual({blending: Constants.ALPHA_ADD, transparent: true});
        expect(blending('UrpMultiply')).toEqual({blending: Constants.ALPHA_MULTIPLY, transparent: true});
        expect(blending('UrpOpaque')).toEqual({blending: Constants.ALPHA_DISABLE, transparent: false});
        expect(blending('UrpOdd')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        expect(blending('LegacyAdditive')).toEqual({blending: Constants.ALPHA_ADD, transparent: true});
        expect(blending('LegacySoftAdditive')).toEqual({blending: Constants.ALPHA_SCREENMODE, transparent: true});
        expect(blending('LegacyMultiply')).toEqual({blending: Constants.ALPHA_MULTIPLY, transparent: true});
        expect(blending('NoMaterial')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        // Built-in Standard Particles, one system per Rendering Mode.
        expect(blending('StdOpaque')).toEqual({blending: Constants.ALPHA_DISABLE, transparent: false});
        expect(blending('StdCutout')).toEqual({blending: Constants.ALPHA_DISABLE, transparent: false});
        expect(system('StdCutout').alphaTest).toBeCloseTo(0.4);
        expect(blending('StdFade')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        expect(blending('StdTransparent')).toEqual({blending: Constants.ALPHA_PREMULTIPLIED, transparent: true});
        expect(blending('StdAdditive')).toEqual({blending: Constants.ALPHA_ADD, transparent: true});
        expect(blending('StdSubtractive')).toEqual({blending: Constants.ALPHA_SUBTRACT, transparent: true});
        expect(blending('StdModulate')).toEqual({blending: Constants.ALPHA_MULTIPLY, transparent: true});
        // The particle shaders, legacy, URP and Standard Particles, draw the particle's colour.
        for (const name of ['UrpAlpha', 'LegacyAdditive', 'LegacyMultiply', 'StdCutout']) {
            expect(system(name).particleColor).toBe(true);
        }
    });

    it("draws the meshes of Unity's opaque and cutout shaders as lit, opaque surfaces culling their back faces", () => {
        const {system} = load('surfaces.json');
        // Legacy Transparent/Cutout/Diffuse and Standard's Cutout mode clip at their _Cutoff; the
        // legacy Diffuse and Standard's Opaque mode do not. All write depth, draw unblended before
        // the transparent systems, cull their back faces and are lit (measured in Unity 6).
        for (const [name, cutoff] of [
            ['SpikeCutout', 0.458],
            ['RockOpaque', 0],
            ['StdCutout', 0.7],
            ['StdOpaque', 0],
        ] as const) {
            const surface = system(name);
            expect(surface.transparent).toBe(false);
            expect(surface.blending).toBe(Constants.ALPHA_DISABLE);
            expect(surface.depthWrite).toBe(true);
            expect(surface.alphaTest).toBeCloseTo(cutoff);
            expect(surface.renderFace).toBe('front');
            expect(surface.lighting).toBe('fixed');
            // Unity's mesh shaders draw a particle tinted or faded as a white one (measured in Unity 6).
            expect(surface.particleColor).toBe(false);
        }
    });

    it("winds a Unity mesh's front faces as Babylon does", () => {
        const {system} = load('surfaces.json');
        // Unity's Quad faces -Z, its triangles clockwise from there: written counter-clockwise,
        // they are the indices of Babylon's own plane, which faces -Z too.
        const quad = system('RockOpaque');
        expect(Array.from(quad.instancingIndices)).toEqual([0, 1, 2, 0, 2, 3]);
        const p = quad.instancingGeometry;
        const [a, b, c] = Array.from(quad.instancingIndices.slice(0, 3)).map((i) => [
            p[i * 3],
            p[i * 3 + 1],
            p[i * 3 + 2],
        ]);
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        // The front-face normal Babylon computes, (c - a) x (b - a).
        expect(ac[0] * ab[1] - ac[1] * ab[0]).toBeLessThan(0);
    });

    it('clamps a baked reflection atlas and keeps the map wrap', () => {
        const reflective = load('blending.json').system('Reflective');
        const atlas = reflective.getRendererSettings().reflectionAtlas as Texture;
        expect(atlas).toBeTruthy();
        expect(atlas.wrapU).toBe(Texture.CLAMP_ADDRESSMODE);
        expect(atlas.wrapV).toBe(Texture.CLAMP_ADDRESSMODE);
        expect((reflective.texture as Texture).wrapU).toBe(Texture.MIRROR_ADDRESSMODE);
    });

    it("plays Texture Sheet Animation's time modes and start frame and blends as Unity draws them", () => {
        const {system} = load('flipbooks.json');
        /** The frame the system's FrameOverLife gives a new particle at `age` s, `t` of its life. */
        const frameOf = (name: string, age: number, t = 0) => {
            const behavior = system(name).behaviors.find((b) => b instanceof FrameOverLife) as FrameOverLife;
            const particle = new SpriteParticle(new ParticleStore(1), 0);
            behavior.initialize(particle);
            return behavior.frameAt(particle, age, t);
        };
        // Unity 6000.6 on a 4x4 sheet. FPS mode: row 2 at 8 fps from a quarter of the row on is at
        // 0.8 + 1 frames into the row at 0.1 s, and wraps round its 4 frames by 0.4 s.
        expect(frameOf('FpsRow', 0.1)).toBeCloseTo(8 + 1.8, 3);
        expect(frameOf('FpsRow', 0.4)).toBeCloseTo(8 + 0.2, 3);
        // Lifetime mode twice over, from 0.3 of the sheet (4.8 frames) on, wrapping round the sheet.
        expect(frameOf('LifeStart', 0, 0.25)).toBeCloseTo(8 + 4.8, 2);
        expect(frameOf('LifeStart', 0, 0.45)).toBeCloseTo(14.4 + 4.8 - 16, 2);
        // A random start frame anywhere on the sheet; at 0 fps the frame stays.
        const start = frameOf('FpsBlended', 0);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(start).toBeLessThan(16);
        expect(frameOf('FpsHeld', 3)).toBe(0);
        // Blended where the material blends and the renderer sends UV2 and AnimBlend, or a custom
        // shader is sent AnimBlend.
        const blends = ['FpsBlended', 'FpsRow', 'LifeStart', 'SpeedMode', 'FpsHeld', 'SimpleFlipbook'].filter(
            (name) => system(name).blendTiles
        );
        expect(blends).toEqual(['FpsBlended', 'LifeStart']);
    });

    it('references asset files that the export wrote', () => {
        for (const effect of ['mesh.json', 'trails.json']) {
            const json = read(`files/${effect}`) as {images: Array<{url: string}>; geometries: Array<{url?: string}>};
            const urls = [...json.images.map((image) => image.url), ...json.geometries.map((g) => g.url!)];
            expect(urls.length).toBeGreaterThan(0);
            for (const url of urls) {
                const file = path.join(GOLDEN, 'files', url);
                expect(fs.existsSync(file) || fs.existsSync(`${file}.size.txt`)).toBe(true);
            }
        }
    });
});
