import type {DemoManifestEntry, DemoSection} from './types';

/** The gallery's order: the showcase first, then the features, each by category. */
export const SECTIONS: readonly {id: DemoSection; title: string; categories: readonly string[]}[] = [
    {id: 'showcase', title: 'Showcase', categories: ['Magic', 'Buffs and auras']},
    {
        id: 'features',
        title: 'Features',
        categories: [
            'Emission and shapes',
            'Motion and forces',
            'Rendering',
            'Textures and materials',
            'Trails',
            'Sub-emitters',
            'Playback and pooling',
            'Effect files',
            'Extending',
            'Performance',
        ],
    },
];

export const demoManifest: DemoManifestEntry[] = [
    {
        key: 'BlackHoleDemo',
        name: 'Black Hole',
        module: 'blackhole',
        section: 'showcase',
        category: 'Magic',
        description:
            'A black hole seen almost edge-on: a filament disk scrolling round it (mesh rings, mapUV, gradientMap), its far side lensed into a ring round the shadow, and matter orbiting and falling in, heated by its speed (OrbitOverLife, GravityForce, ColorBySpeed).',
        tags: ['ColorBySpeed', 'GravityForce', 'OrbitOverLife', 'mapUV', 'gradientMap'],
        captureAt: 3,
    },
    {
        key: 'ElectricBallDemo',
        name: 'Electric Ball',
        module: 'electricBall',
        section: 'showcase',
        category: 'Magic',
        description:
            'A ball of lightning drifting over the ground: a flickering core, a turning shell of filaments, bolts cracking out of its centre (a pivoted card on random frames) and sparks left behind in world space.',
        tags: ['FrameOverLife', 'pivot', 'worldSpace'],
        captureAt: 1.3,
    },
    {
        key: 'LevelUpDemo',
        name: 'Level-Up',
        module: 'levelUp',
        section: 'showcase',
        category: 'Buffs and auras',
        description:
            'One-shot character effect: ground shockwave, light column, spiralling trail ribbons and falling stars.',
        tags: ['Trail', 'OrbitOverLife', 'HorizontalBillBoard'],
        captureAt: 1.2,
    },
    {
        key: 'EmitterShapeDemo',
        name: 'Emitter Shapes',
        module: 'emitterShape',
        section: 'features',
        category: 'Emission and shapes',
        description:
            'Every emitter shape side by side, each labelled: point, sphere, cone, circle, donut, grid and more.',
        tags: ['EmitterShape', 'ConeEmitter', 'GridEmitter'],
        captureAt: 3,
    },
    {
        key: 'EmissionTimingDemo',
        name: 'Emission Timing',
        module: 'emissionTiming',
        section: 'features',
        category: 'Emission and shapes',
        description:
            "One topic at a time: bursts, their waves and the chance of each; start delay, prewarm and a shorter warm-up; playback speed; seeded systems that play out alike; and the stop action with the 'finished' event that starts the next effect.",
        tags: ['emissionBursts', 'startDelay', 'prewarm', 'playbackSpeed', 'seed', 'stopAction'],
        captureAt: 1,
    },
    {
        key: 'FollowObjectDemo',
        name: 'Following Moving Objects',
        module: 'followObject',
        section: 'features',
        category: 'Emission and shapes',
        description:
            'Emitters parented to moving objects: emission over time against emission over distance, world-space wakes and local-space halos.',
        tags: ['emissionOverDistance', 'worldSpace'],
        captureAt: 3,
    },
    {
        key: 'RingBufferDemo',
        name: 'Ring Buffer',
        module: 'ringBuffer',
        section: 'features',
        category: 'Emission and shapes',
        description:
            'Ring Buffer Mode: a full system replaces its oldest particles, which wait paused (footprints) or looping (pulsing dots) until then.',
        tags: ['ringBufferMode', 'maxParticles'],
        captureAt: 4,
    },
    {
        key: 'VelocityDemo',
        name: 'Velocity and Speed',
        module: 'velocity',
        section: 'features',
        category: 'Motion and forces',
        description:
            'One topic at a time: velocity over life (linear on a curve, orbital, radial, round an offset point); size, spin and colour by speed on fountains that stop at the top; start directions randomised or turned by an angle; and forces picked once per particle or every step, and gravity that scales with a half-size emitter or keeps its strength.',
        tags: [
            'VelocityOverLife',
            'SizeBySpeed',
            'RotationBySpeed',
            'ColorBySpeed',
            'RandomizeDirection',
            'ChangeEmitDirection',
            'ForceOverLife',
        ],
        captureAt: 2,
    },
    {
        key: 'NoiseDemo',
        name: 'Noise and Turbulence',
        module: 'noise',
        section: 'features',
        category: 'Motion and forces',
        description:
            'One topic at a time: rising wisps shaken by Noise, turned, scrolled faster and snapped through a remap curve; streaks each shaken its own way next to a turbulence field the whole cloud flows through, with one octave and three; and sparks from swinging emitters left behind, thrown along at birth or carried along by InheritVelocity.',
        tags: ['Noise', 'TurbulenceField', 'InheritVelocity'],
        captureAt: 2,
    },
    {
        key: 'ForceSpaceDemo',
        name: 'Force Space',
        module: 'forceSpace',
        section: 'features',
        category: 'Motion and forces',
        description:
            'Two turning emitters: a world-space gravity keeps falling down, a local-space thrust turns with its emitter.',
        tags: ['ApplyForce', 'ForceOverLife'],
        captureAt: 3,
    },
    {
        key: 'LimitVelocityAxesDemo',
        name: 'Limit Velocity Axes',
        module: 'limitVelocityAxes',
        section: 'features',
        category: 'Motion and forces',
        description:
            'Limit Velocity over Lifetime: one speed limit keeps a burst round, Separate Axes in local space flatten it into a leaning disc.',
        tags: ['LimitSpeedOverLife'],
        captureAt: 3,
    },
    {
        key: 'BillboardDemo',
        name: 'Render Modes',
        module: 'billboard',
        section: 'features',
        category: 'Rendering',
        description:
            'Every render mode doing what it is for, each on a labelled pad: billboards (smoke), stretched billboards (sparks), horizontal (ripples), vertical (flames), lit mesh particles (crystals), trails (ribbons) and a beam (a bolt between two points).',
        tags: ['RenderMode', 'StretchedBillBoard', 'Mesh', 'Trail', 'Beam'],
        captureAt: 2,
    },
    {
        key: 'RendererOptionsDemo',
        name: 'Renderer Options',
        module: 'rendererOptions',
        section: 'features',
        category: 'Rendering',
        description:
            'Eight pairs, option off on the left and on on the right: sort mode, align to direction on mesh darts, min/max on-screen particle size, shape vs hierarchy scaling under a scaled parent, render face on open mesh bowls, render alignment on flat mesh quads, billboard rings laid on the ground by render alignment, and flame tongues mirrored at random by flip.',
        tags: ['sortMode', 'renderAlignment', 'scalingMode', 'flip'],
        captureAt: 3,
    },
    {
        key: 'BlendingDemo',
        name: 'Blending and Material Colour',
        module: 'blending',
        section: 'features',
        category: 'Rendering',
        description:
            'One topic at a time: the same smoke in five blend modes over light and dark (premultiplied draws smoke that covers and a glow that adds from one map), the material colour, its scale and the particle colour left out, leaves cut out by an alpha test against blended ones, soft particles fading before the floor and pillars, and a sorting fudge that keeps the smoke over a nearer glow.',
        tags: [
            'blendMode',
            'premultipliedMap',
            'materialColor',
            'particleColor',
            'alphaTest',
            'softParticles',
            'sortingFudge',
        ],
        captureAt: 3,
    },
    {
        key: 'MeshParticlesDemo',
        name: 'Mesh Particles',
        module: 'meshParticles',
        section: 'features',
        category: 'Rendering',
        description:
            "One topic at a time: shards solid and fading along their own vertex colours; plates spun about the mesh's Z or an axis from their direction; tilted leaves spun about their own axis or keeping their tilt ('angles' integration); and leaves from a turning emitter, turning with it or upright in the world.",
        tags: ['instancingColors', 'rotationAxis', 'Rotation3DOverLife', 'renderAlignment'],
        captureAt: 2,
    },
    {
        key: 'ImageProcessingDemo',
        name: 'Image Processing',
        module: 'imageProcessing',
        section: 'features',
        category: 'Rendering',
        description:
            "The scene's tone mapping, exposure, contrast and vignette on the particles, as on its meshes; the right flame opts out with applyImageProcessing: false.",
        tags: ['applyImageProcessing', 'tone mapping'],
        captureAt: 3,
    },
    {
        key: 'MeshMaterialDemo',
        name: 'Mesh Particles with a Material',
        module: 'meshMaterial',
        section: 'features',
        category: 'Rendering',
        description:
            'Mesh particles drawn with a Babylon material: gold coins with an environment map thrown up, tumbling, falling and bouncing on the floor through a collision plane.',
        tags: ['Mesh', 'material', 'Rotation3DOverLife', 'ApplyCollision'],
        captureAt: 3,
    },
    {
        key: 'TextureEffectsDemo',
        name: 'Texture Effects',
        module: 'textureEffects',
        section: 'features',
        category: 'Textures and materials',
        description:
            'A spiral of light climbing a pillar (mapUV scroll), one greyscale fire sheet burning as fire, ice, poison or arcane (gradientMap, switch it in the panel), smoke burning away through a mask (erosion), and a bolt reaching out and back (a mask on UV channel 1).',
        tags: ['mapUV', 'gradientMap', 'erosion'],
        captureAt: 2,
    },
    {
        key: 'FlipbooksDemo',
        name: 'Flipbooks',
        module: 'flipbooks',
        section: 'features',
        category: 'Textures and materials',
        description:
            'One topic at a time: a sheet played once over life, three times (cycles), at a frame rate, and once then held; a sheet of four glyphs played whole, by one row, by a random row per particle and a random frame per tick; and slow smoke frame by frame against crossfaded frames (blendTiles).',
        tags: ['FrameOverLife', 'cycles', 'fps', 'rowLength', 'randomRow', 'blendTiles'],
        captureAt: 2,
    },
    {
        key: 'AuraTrailDemo',
        name: 'Aura and Weapon Trail',
        module: 'auraTrail',
        section: 'features',
        category: 'Textures and materials',
        description:
            'An aura round a character, a crown of tongues on a band mesh breathing through uvDistortion and faded where it faces you (rim), and a swinging blade whose trail is swept along its length (sideAxis).',
        tags: ['uvDistortion', 'rim', 'sideAxis', 'Trail'],
        captureAt: 2,
    },
    {
        key: 'SequencerDemo',
        name: 'Texture Sequencer',
        module: 'sequencer',
        section: 'features',
        category: 'Textures and materials',
        description: 'Ten thousand particles moving into the shape of an image, then of another.',
        tags: ['TextureSequencer', 'ApplySequences'],
        captureAt: 6.5,
    },
    {
        key: 'TrailDemo',
        name: 'Trails and Collision',
        module: 'trail',
        section: 'features',
        category: 'Trails',
        description:
            'Sparks thrown up in bursts, each with a trail white-hot at its head and cooling down its length (ColorOverLength, WidthOverLength), falling and bouncing on the floor through a collision plane.',
        tags: ['Trail', 'ColorOverLength', 'WidthOverLength', 'ApplyCollision'],
        captureAt: 1.5,
    },
    {
        key: 'TrailTextureDemo',
        name: 'Trail Texture Modes and Sampling',
        module: 'trailTexture',
        section: 'features',
        category: 'Trails',
        description:
            'Five trails of a moving emitter: the texture stretched by distance, distributed per segment, tiled per world unit with a minimum vertex distance and a lifetime, repeated per segment; and a teleporting emitter cleared with clearTrails().',
        tags: ['textureMode', 'clearTrails'],
        captureAt: 3,
    },
    {
        key: 'TrailSurfaceDemo',
        name: 'Surface Trails and Mesh UV2',
        module: 'trailSurface',
        section: 'features',
        category: 'Trails',
        description:
            'Trails shed from a spinning torus knot through a MeshSurfaceEmitter, smoothed and recorded in world space; and mesh-particle ripples whose map scrolls over a radial second UV set through a gradient map.',
        tags: ['MeshSurfaceEmitter', 'instancingUVs2'],
        captureAt: 3,
    },
    {
        key: 'SubEmitterDemo',
        name: 'Sub Emitter',
        module: 'subEmitter',
        section: 'features',
        category: 'Sub-emitters',
        description:
            'Fireworks from sub emitters built in code: rockets shed sparks while they fly (Birth), burst into a shell in their own colour and flash where they die (Death, inherit colour), and some shell sparks crackle as they burn out (Death with a probability).',
        tags: ['EmitSubParticleSystem', 'SubParticleEmitMode', 'inherit'],
        captureAt: 3.5,
    },
    {
        key: 'PooledHitsDemo',
        name: 'Pooled One-Shot Hits',
        module: 'pooledHits',
        section: 'features',
        category: 'Playback and pooling',
        description:
            'One hit effect cloned by an EffectPool and played on six targets in turn without allocating; QuarksUtil.getDuration paces the hits and emissionMultiplier makes every third one heavier.',
        tags: ['EffectPool', 'emissionMultiplier'],
        captureAt: 1.2,
    },
    {
        key: 'TimelineDemo',
        name: 'Timeline (QuarksPrefab)',
        module: 'timeline',
        section: 'features',
        category: 'Playback and pooling',
        description:
            'A charge, a release burst and lingering smoke scheduled on a QuarksPrefab timeline that advances with the scene; the end of the timeline lets particles die out, and every other blast plays in slow motion through timeScale.',
        tags: ['QuarksPrefab', 'timeScale'],
        captureAt: 1.6,
    },
    {
        key: 'LoadingEffectsDemo',
        name: 'Loading Effects',
        module: 'loadingEffects',
        section: 'features',
        category: 'Effect files',
        description:
            'One topic at a time: three effect files loaded together by QuarksLoader.loadAll; an effect built in code beside the same effect saved with serializeEffect and loaded back from its JSON; and one loaded effect with copies made by QuarksUtil.instantiate, sharing its textures and batches.',
        tags: ['QuarksLoader', 'loadAll', 'serializeEffect', 'loadFromJSON', 'instantiate'],
        captureAt: 0.6,
    },
    {
        key: 'CustomPluginDemo',
        name: 'Custom Plugin',
        module: 'customPlugin',
        section: 'features',
        category: 'Extending',
        description:
            'A behaviour of your own, registered with loadPlugin as docs/EXTENDING.md describes: a travelling wave that lifts and colours a grid of sparks; it shows in the editor and saves with the effect.',
        tags: ['loadPlugin', 'Behavior'],
        captureAt: 3,
    },
    {
        key: 'CullingDemo',
        name: 'Culling and Layers',
        module: 'culling',
        section: 'features',
        category: 'Performance',
        description:
            'One topic at a time: three clocks moved off screen every few seconds, one that keeps running, one that pauses and falls behind, one that pauses and catches up (cullingMode); and fountains on camera layers 1 and 2, the camera set in the panel to draw both or one (layers.mask, camera.layerMask).',
        tags: ['cullingMode', 'layerMask', 'layers'],
        captureAt: 9.5,
    },
    {
        key: 'MuzzleFlashDemo',
        name: 'Muzzle Flash Performance',
        module: 'muzzleFlash',
        section: 'features',
        category: 'Performance',
        description:
            'A hundred guns firing in waves, six one-shot systems each: six hundred systems drawn in a handful of batches, one per kind of layer.',
        tags: ['BatchedRenderer', 'batching'],
        captureAt: 0.5,
    },
];

/** `examples/public/previews/<file>.png`: the key in kebab case, without "Demo". */
export function previewFile(key: string): string {
    return (
        key
            .replace(/Demo$/u, '')
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .toLowerCase() + '.png'
    );
}
