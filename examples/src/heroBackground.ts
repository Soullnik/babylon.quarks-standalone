import {Engine} from "@babylonjs/core/Engines/engine";
import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {Color4} from "@babylonjs/core/Maths/math.color";
import {Constants} from "@babylonjs/core/Engines/constants";
import {BatchedRenderer, ParticleSystem} from "babylon.quarks";
import {
    RenderMode,
    ConstantValue,
    IntervalValue,
    SphereEmitter,
    RandomColor,
    Vector4,
    Vector3 as QVector3,
    Noise,
    OrbitOverLife,
    TurbulenceField,
    ApplyForce,
} from "babylon.quarks";
import {SHARED_ASSETS, createSharedTexture} from "./shared/common";

/** 10×10 `texture1.png`: top band ≈ 90–99 (soft circle / glow / cloud); filaments ≈ 60–69; sparks ≈ 80–89. */
const T1 = {
    softCircle: 90,
    softGlow: 91,
    softCloud: 93,
    filament: 65,
    filamentAlt: 67,
    thinWisp: 63,
    emberSpark: 84,
};

function heroTextureUrl(relativePath: string) {
    const path = relativePath.replace(/^\//, "");
    const base = import.meta.env?.BASE_URL;
    if (typeof window === "undefined" || base == null || base === "" || base === "/" || base === "./") {
        return path;
    }
    const prefix = base.endsWith("/") ? base : `${base}/`;
    const rootRelative = `${prefix}${path}`.replace(/([^:]\/)\/+/g, "$1");
    try {
        return new URL(rootRelative, window.location.origin).href;
    } catch {
        return rootRelative;
    }
}

/**
 * Full-screen hero: three depth layers of a cohesive "ion plasma" — a far nebula veil, a
 * mid-field curl-flow driven by TurbulenceField, and near additive sparks — that react to the
 * cursor (camera parallax + a gentle directional lean) and drift with page scroll. Doubles as a
 * live showcase of babylon.quarks (Turbulence, forces, batched rendering).
 */
export function mountIndexHeroBackground() {
    if (typeof window === "undefined") {
        return () => {};
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        return () => {};
    }

    const canvas = document.getElementById("hero-bg");
    if (!(canvas instanceof HTMLCanvasElement)) {
        return () => {};
    }

    const engine = new Engine(canvas, true);
    engine.resize();

    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.04, 0.045, 0.09, 1);
    scene.autoClear = true;

    const camera = new ArcRotateCamera("heroCam", -Math.PI / 2, Math.PI / 3, 22, BVector3.Zero(), scene);
    camera.minZ = 0.1;
    camera.setPosition(new BVector3(0, 8, 22));

    new HemisphericLight("heroLight", new BVector3(0.35, 1, -0.2), scene);

    const batchRenderer = new BatchedRenderer("heroVfx", scene);
    const systems: ParticleSystem[] = [];

    const atlasPath = heroTextureUrl(SHARED_ASSETS.atlas);
    const tex1 = createSharedTexture(scene, atlasPath);

    // --- Layer 1: far nebula veil (soft, slow, ambient depth) ---
    const farNebula = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(9, 14),
        startSpeed: new IntervalValue(0.15, 0.45),
        startSize: new IntervalValue(7, 15),
        startColor: new RandomColor(new Vector4(0.32, 0.44, 0.92, 0.3), new Vector4(0.52, 0.28, 0.88, 0.4)),
        worldSpace: true,
        emissionOverTime: new IntervalValue(7, 10),
        shape: new SphereEmitter({radius: 19, thickness: 0.97, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(T1.softCircle),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 30,
    });
    farNebula.addBehavior(new Noise(new ConstantValue(0.16), new ConstantValue(0.9)));
    farNebula.addBehavior(new OrbitOverLife(new IntervalValue(0.06, 0.12)));
    batchRenderer.addSystem(farNebula);
    systems.push(farNebula);

    // --- Layer 2: mid-field curl flow (TurbulenceField) that leans toward the cursor ---
    const midFlow = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(7, 11),
        startSpeed: new IntervalValue(0.2, 0.5),
        startSize: new IntervalValue(3, 6.5),
        startColor: new RandomColor(new Vector4(0.4, 0.62, 1, 0.4), new Vector4(0.66, 0.42, 0.98, 0.5)),
        worldSpace: true,
        emissionOverTime: new IntervalValue(14, 20),
        shape: new SphereEmitter({radius: 12, thickness: 0.9, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(T1.filament),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 20,
    });
    midFlow.addBehavior(
        new TurbulenceField(new QVector3(7, 7, 7), 3, new QVector3(0.9, 0.9, 0.9), new QVector3(0.16, 0.13, 0.19))
    );
    midFlow.addBehavior(new OrbitOverLife(new IntervalValue(0.04, 0.08)));
    // A gentle uniform force whose direction we steer toward the cursor each frame (no attractor
    // singularity — the whole mid cloud just "leans" the way you point).
    const cursorForce = new ApplyForce(new QVector3(0, 0, 0), new ConstantValue(0.55));
    midFlow.addBehavior(cursorForce);
    batchRenderer.addSystem(midFlow);
    systems.push(midFlow);

    // --- Layer 3: near additive sparks (bright, closest, most parallax) ---
    const nearSparks = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(4, 8),
        startSpeed: new IntervalValue(0.1, 0.45),
        startSize: new IntervalValue(0.4, 1.1),
        startColor: new RandomColor(new Vector4(0.62, 0.8, 1, 0.7), new Vector4(0.85, 0.62, 1, 0.8)),
        worldSpace: true,
        emissionOverTime: new IntervalValue(6, 10),
        shape: new SphereEmitter({radius: 6.5, thickness: 1, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.emberSpark),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 10,
    });
    nearSparks.addBehavior(
        new TurbulenceField(new QVector3(4, 4, 4), 2, new QVector3(0.6, 0.6, 0.6), new QVector3(0.2, 0.18, 0.22))
    );
    batchRenderer.addSystem(nearSparks);
    systems.push(nearSparks);

    scene.whenReadyAsync().then(() => {
        for (const system of systems) {
            system.play();
        }
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    engine.setHardwareScalingLevel(1 / dpr);
    engine.resize();

    // --- pointer + scroll state (smoothed) ---
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let scrollN = 0;
    let targetScroll = 0;

    const onPointerMove = (e: PointerEvent) => {
        targetX = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
        targetY = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
    };
    const onScroll = () => {
        targetScroll = Math.min((window.scrollY || 0) / Math.max(window.innerHeight, 1), 1.6);
    };
    window.addEventListener("pointermove", onPointerMove, {passive: true});
    window.addEventListener("scroll", onScroll, {passive: true});

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    engine.runRenderLoop(() => {
        const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
        const ease = Math.min(delta * 3.5, 1);
        pointerX += (targetX - pointerX) * ease;
        pointerY += (targetY - pointerY) * ease;
        scrollN += (targetScroll - scrollN) * Math.min(delta * 3, 1);

        // Slow base drift + cursor/scroll parallax (near layer moves most → real depth).
        camera.alpha += delta * 0.05;
        camera.beta += Math.sin(performance.now() * 0.00035) * delta * 0.015;
        camera.target.x = pointerX * 2.4;
        camera.target.y = pointerY * 1.5 - scrollN * 3.5;
        camera.radius = 22 + scrollN * 3;

        // Steer the mid-flow lean toward where the cursor points (kept unit-length).
        const lx = pointerX;
        const ly = pointerY * 0.65;
        const lz = -0.18;
        const len = Math.hypot(lx, ly, lz) || 1;
        cursorForce.direction.set(lx / len, ly / len, lz / len);

        batchRenderer.update(delta);
        scene.render();
    });

    return () => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("scroll", onScroll);
        engine.stopRenderLoop();
        for (const system of systems) {
            system.dispose();
        }
        batchRenderer.dispose();
        scene.dispose();
        engine.dispose();
    };
}
