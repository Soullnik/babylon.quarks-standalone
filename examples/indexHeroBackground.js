import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Constants} from '@babylonjs/core/Engines/constants';
import {BatchedRenderer} from 'babylon.quarks';
import {
    ParticleSystem,
    RenderMode,
    ConstantValue,
    IntervalValue,
    PointEmitter,
    SphereEmitter,
    ConeEmitter,
    RandomColor,
    ConstantColor,
    Vector4,
    Vector3,
    Noise,
    OrbitOverLife,
    ColorOverLife,
    ColorRange,
    SizeOverLife,
    FrameOverLife,
    PiecewiseBezier,
    Bezier,
    SpeedOverLife,
    ApplyForce,
} from 'babylon.quarks';
import {SHARED_ASSETS, createSharedTexture} from './babylon/shared/common.js';

/**
 * Hero VFX: one read — “magnetosphere / ion glow” (not unrelated layers).
 * - **texture1** bulk: soft top-row tiles + row‑7 filaments (tile index grows upward on the sheet).
 * - **texture2** only for small flipbook sparks (row‑8 burst strip).
 * - Soft volumes use **`ALPHA_COMBINE`** on dark `clearColor`; trails stay **`ALPHA_ADD`** (short, bright).
 * - Do **not** rotate `BatchedRenderer` with `worldSpace: true` (batch matrix already applies).
 */

/** 10×10 `texture1.png`: top band ≈ 90–99 (soft circle / glow / cloud); filaments ≈ 60–69; arcs ≈ 40–49. */
const T1 = {
    softCircle: 90,
    softGlow: 91,
    softCloud: 93,
    filament: 65,
    filamentAlt: 67,
    thinWisp: 63,
    arc: 44,
    emberSpark: 84,
};

/** `texture2.png`: starburst flipbook along ~80–86. */
const T2_SPARK_FRAMES = [80, 81.5, 84, 86];

/**
 * Resolves `public/` texture paths the same way as `babylonMain` demos when possible:
 * - root dev (`BASE_URL` `/`): document-relative `textures/...` (matches `createSharedTexture(scene)` in demos).
 * - GitHub Pages subpath: absolute URL from origin + base so the file is never requested from the wrong host path.
 * @param {string} relativePath e.g. `textures/texture1.png`
 */
function heroTextureUrl(relativePath) {
    const path = relativePath.replace(/^\//, '');
    const base = import.meta.env?.BASE_URL;
    if (typeof window === 'undefined' || base == null || base === '' || base === '/' || base === './') {
        return path;
    }
    const prefix = base.endsWith('/') ? base : `${base}/`;
    const rootRelative = `${prefix}${path}`.replace(/([^:]\/)\/+/g, '$1');
    try {
        return new URL(rootRelative, window.location.origin).href;
    } catch {
        return rootRelative;
    }
}

/**
 * Full-screen hero: one cohesive “ion glow” (soft atlas + rare filaments / sparks).
 * @returns dispose function, or no-op when canvas is missing or reduced motion is requested.
 */
export function mountIndexHeroBackground() {
    if (typeof window === 'undefined') {
        return () => {};
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return () => {};
    }

    const canvas = document.getElementById('hero-bg');
    if (!(canvas instanceof HTMLCanvasElement)) {
        return () => {};
    }

    const engine = new Engine(canvas, true);
    engine.resize();

    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.04, 0.045, 0.09, 1);
    scene.autoClear = true;

    const camera = new ArcRotateCamera('heroCam', -Math.PI / 2, Math.PI / 3, 20, BVector3.Zero(), scene);
    camera.minZ = 0.1;
    camera.setPosition(new BVector3(0, 8, 22));

    new HemisphericLight('heroLight', new BVector3(0.35, 1, -0.2), scene);

    const batchRenderer = new BatchedRenderer('heroVfx', scene);
    const systems = [];

    const atlasPath = heroTextureUrl(SHARED_ASSETS.atlas);
    const tex1 = createSharedTexture(scene, atlasPath);

    const outerVeil = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        maxParticle: 140,
        startLife: new IntervalValue(9, 14),
        startSpeed: new IntervalValue(0.15, 0.45),
        startSize: new IntervalValue(7, 15),
        startColor: new RandomColor(new Vector4(0.32, 0.44, 0.92, 0.32), new Vector4(0.52, 0.28, 0.88, 0.42)),
        worldSpace: true,
        emissionOverTime: new IntervalValue(8, 12),
        shape: new SphereEmitter({radius: 19, thickness: 0.97, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(T1.softCircle),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 20,
    });
    outerVeil.addBehavior(new Noise(new ConstantValue(0.16), new ConstantValue(0.95)));
    outerVeil.addBehavior(new OrbitOverLife(new IntervalValue(0.07, 0.14)));
    batchRenderer.addSystem(outerVeil);
    systems.push(outerVeil);

    scene.whenReadyAsync().then(() => {
        for (const system of systems) {
            system.play();
        }
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    engine.setHardwareScalingLevel(1 / dpr);
    engine.resize();

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    engine.runRenderLoop(() => {
        const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
        camera.alpha += delta * 0.11;
        camera.beta += Math.sin(performance.now() * 0.00035) * delta * 0.02;
        batchRenderer.update(delta);
        scene.render();
    });

    return () => {
        window.removeEventListener('resize', onResize);
        engine.stopRenderLoop();
        for (const system of systems) {
            system.dispose();
        }
        batchRenderer.dispose();
        scene.dispose();
        engine.dispose();
    };
}
