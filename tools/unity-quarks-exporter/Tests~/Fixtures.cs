using System;
using System.Collections.Generic;
using UnityEngine;

namespace BabylonQuarks.UnityExporter.Tests
{
    /// <summary>
    /// Effects built the way an artist sets them up in Unity's inspector. Each covers a group of
    /// modules; together they reach every mapping the exporter has.
    /// </summary>
    public static class Fixtures
    {
        public static readonly Dictionary<string, Func<GameObject>> All = new Dictionary<string, Func<GameObject>>
        {
            ["billboard"] = Billboard,
            ["mesh"] = MeshParticles,
            ["trails"] = TrailsAndSubEmitters,
            ["blending"] = Blending,
        };

        // ---- builders ------------------------------------------------------------------------

        private static (GameObject go, ParticleSystem ps, ParticleSystemRenderer renderer) MakeSystem(string name, Transform parent = null)
        {
            var go = new GameObject(name);
            if (parent != null) go.transform.SetParent(parent);
            var ps = go.AddComponent<ParticleSystem>();
            var renderer = go.AddComponent<ParticleSystemRenderer>();
            return (go, ps, renderer);
        }

        /// <summary>One texture asset, shared like an asset is in a project.</summary>
        private static readonly Texture2D SparkAsset = new Texture2D(1, 1) { name = "spark", assetPath = "fixtures/spark.png" };

        private static Texture2D Spark() => SparkAsset;

        private static Gradient Ramp(Color from, Color to, float fadeFrom = 1f, float fadeTo = 0f)
        {
            var g = new Gradient();
            g.SetKeys(
                new[] { new GradientColorKey(from, 0f), new GradientColorKey(to, 1f) },
                new[] { new GradientAlphaKey(fadeFrom, 0f), new GradientAlphaKey(1f, 0.2f), new GradientAlphaKey(fadeTo, 1f) });
            return g;
        }

        /// <summary>A URP Particles/Unlit material, set up as its inspector does.</summary>
        private static Material Urp(string name, int surface, int src, int dst, Texture map = null)
        {
            var mat = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit")) { name = name };
            mat.SetFloat("_Surface", surface);
            mat.SetFloat("_SrcBlend", src);
            mat.SetFloat("_DstBlend", dst);
            mat.SetFloat("_ZWrite", surface == 0 ? 1 : 0);
            mat.SetFloat("_Cull", 2);
            mat.SetFloat("_AlphaClip", 0);
            mat.SetFloat("_Cutoff", 0.5f);
            mat.SetFloat("_SoftParticlesEnabled", 0);
            mat.SetColor("_BaseColor", Color.white);
            mat.SetTexture("_BaseMap", map);
            return mat;
        }

        private static Mesh Quad(bool secondUV)
        {
            return new Mesh
            {
                name = "Quad",
                vertices = new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) },
                triangles = new[] { 0, 2, 1, 0, 3, 2 },
                uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) },
                uv2 = secondUV ? new[] { new Vector2(0, 0), new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, 0.5f) } : new Vector2[0],
            };
        }

        // ---- fixtures ------------------------------------------------------------------------

        /// <summary>
        /// Billboards: a cone with a looping arc, random and curved Main values, bursts, a 2×2
        /// flipbook, color and size over life, spin, noise, and an additive URP material with a
        /// tiled, scrolling-free map and soft particles.
        /// </summary>
        private static GameObject Billboard()
        {
            var (go, ps, renderer) = MakeSystem("Sparks");
            var main = ps.main;
            main.duration = 2f;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.5f, 1.5f);
            main.startSpeed = 4f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.4f, AnimationCurve.Linear(0, 1, 1, 0.25f));
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.8f, 0.3f), new Color(1f, 0.4f, 0.1f));
            main.gravityModifier = 0.5f;
            main.maxParticles = 200;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.cullingMode = ParticleSystemCullingMode.Pause;
            ps.useAutoRandomSeed = false;
            ps.randomSeed = 4000000001u;

            var emission = ps.emission;
            emission.rateOverTime = 20f;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0.25f, new ParticleSystem.MinMaxCurve(10f, 20f)) { cycleCount = 3, repeatInterval = 0.5f, probability = 0.75f } });

            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 30f;
            shape.radius = 0.5f;
            shape.radiusThickness = 0.25f;
            shape.arc = 180f;
            shape.arcMode = ParticleSystemShapeMultiModeValue.Loop;
            shape.arcSpread = 0.25f;
            shape.arcSpeed = 2f;
            shape.rotation = new Vector3(-90f, 0f, 0f);

            var color = ps.colorOverLifetime;
            color.enabled = true;
            color.color = Ramp(Color.white, new Color(1f, 0.2f, 0f));

            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, new AnimationCurve(new Keyframe(0, 0, 0, 4), new Keyframe(0.25f, 1), new Keyframe(1, 0)));

            var rotation = ps.rotationOverLifetime;
            rotation.enabled = true;
            rotation.z = new ParticleSystem.MinMaxCurve(-1f, 1f);

            var noise = ps.noise;
            noise.enabled = true;
            noise.strength = 0.5f;
            noise.frequency = 0.8f;
            noise.scrollSpeed = 0.2f;

            var sheet = ps.textureSheetAnimation;
            sheet.enabled = true;
            sheet.numTilesX = 2;
            sheet.numTilesY = 2;

            var spark = new Texture2D(1, 1) { name = "sparkTiled", assetPath = "fixtures/spark.png", wrapMode = TextureWrapMode.Repeat };
            var mat = Urp("SparkAdditive", 1, 5, 1, spark);
            mat.SetColor("_BaseColor", new Color(1f, 1f, 1f, 0.5f));
            mat.SetTextureScale("_BaseMap", new Vector2(2f, 1f));
            mat.SetTextureOffset("_BaseMap", new Vector2(0.5f, 0f));
            mat.SetFloat("_SoftParticlesEnabled", 1);
            mat.SetFloat("_SoftParticlesNearFadeDistance", 0.1f);
            mat.SetFloat("_SoftParticlesFarFadeDistance", 2f);
            renderer.sharedMaterial = mat;
            renderer.sortMode = ParticleSystemSortMode.Distance;
            renderer.minParticleSize = 0.01f;
            renderer.maxParticleSize = 0.25f;
            return go;
        }

        /// <summary>
        /// Mesh particles in a scaled group: a box shape, 3D start rotation and separate-axes spin,
        /// Hierarchy scaling, a mesh with a second UV set and no normals, and an opaque URP material
        /// with Alpha Clipping and back-face culling. A second system covers what the runtime lacks
        /// and warns about Random Between Two Curves, separate-axes limits and Local
        /// scaling under a scaled parent.
        /// </summary>
        private static GameObject MeshParticles()
        {
            var root = new GameObject("Debris");
            root.transform.localScale = new Vector3(2f, 2f, 2f);

            var (_, ps, renderer) = MakeSystem("Chunks", root.transform);
            ps.transform.localPosition = new Vector3(0f, 1f, 0f);
            ps.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);
            var main = ps.main;
            main.loop = false;
            main.startSpeed = new ParticleSystem.MinMaxCurve(2f, 5f);
            main.startSize3D = true;
            main.startSizeX = 0.5f;
            main.startSizeY = new ParticleSystem.MinMaxCurve(0.25f, 0.75f);
            main.startSizeZ = 0.5f;
            main.startRotation3D = true;
            main.startRotationX = new ParticleSystem.MinMaxCurve(0f, Mathf.PI);
            main.startRotationY = 0.5f;
            main.startRotationZ = 0f;
            main.scalingMode = ParticleSystemScalingMode.Hierarchy;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.simulationSpeed = 1.5f;

            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(1f, 0.5f, 2f);

            var rotation = ps.rotationOverLifetime;
            rotation.enabled = true;
            rotation.separateAxes = true;
            rotation.x = 1f;
            rotation.y = new ParticleSystem.MinMaxCurve(-2f, 2f);
            rotation.z = 0.5f;

            var limit = ps.limitVelocityOverLifetime;
            limit.enabled = true;
            limit.limit = 3f;
            limit.dampen = 0.2f;

            renderer.renderMode = ParticleSystemRenderMode.Mesh;
            renderer.mesh = Quad(secondUV: true);
            var mat = Urp("ChunkCutout", 0, 1, 0, Spark());
            mat.SetFloat("_AlphaClip", 1);
            mat.SetFloat("_Cutoff", 0.3f);
            mat.SetFloat("_Cull", 2);
            renderer.sharedMaterial = mat;

            var (_, dust, dustRenderer) = MakeSystem("Dust", root.transform);
            var dustMain = dust.main;
            dustMain.startSpeed = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0, 1, 1), AnimationCurve.Linear(0, 1, 1, 2));
            dustMain.scalingMode = ParticleSystemScalingMode.Local;
            var dustShape = dust.shape;
            dustShape.shapeType = ParticleSystemShapeType.ConeVolume;
            dustShape.length = 2f;
            var dustLimit = dust.limitVelocityOverLifetime;
            dustLimit.enabled = true;
            dustLimit.separateAxes = true;
            dustLimit.limitX = 2f;
            dustRenderer.sharedMaterial = Urp("DustAlpha", 1, 5, 10, Spark());
            return root.transform.gameObject;
        }

        /// <summary>
        /// A rocket: a stretched billboard with a pivot and flip, emitting from a mesh surface,
        /// moved by velocity, force, inherited velocity and collision, with a death sub-emitter that
        /// leaves trails and a birth sub-emitter of sparks. The trail uses the Standard Particles
        /// shader in Subtractive mode; the rocket a legacy premultiplied shader.
        /// </summary>
        private static GameObject TrailsAndSubEmitters()
        {
            var (go, rocket, renderer) = MakeSystem("Rocket");
            var main = rocket.main;
            main.startLifetime = 2f;
            main.startSpeed = 6f;
            main.startColor = Color.white;

            var shape = rocket.shape;
            shape.shapeType = ParticleSystemShapeType.Mesh;
            shape.mesh = Quad(secondUV: false);

            var velocity = rocket.velocityOverLifetime;
            velocity.enabled = true;
            velocity.y = 1f;
            velocity.orbitalZ = 0.5f;
            velocity.radial = -0.25f;
            velocity.space = ParticleSystemSimulationSpace.World;

            var force = rocket.forceOverLifetime;
            force.enabled = true;
            force.y = -2f;

            var inherit = rocket.inheritVelocity;
            inherit.enabled = true;
            inherit.mode = ParticleSystemInheritVelocityMode.Current;
            inherit.curve = 0.5f;

            var collision = rocket.collision;
            collision.enabled = true;
            collision.bounce = 0.4f;

            var colorBySpeed = rocket.colorBySpeed;
            colorBySpeed.enabled = true;
            colorBySpeed.color = Ramp(Color.white, Color.black, 1f, 1f);
            colorBySpeed.range = new Vector2(0f, 10f);

            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.velocityScale = 0.1f;
            renderer.lengthScale = 3f;
            renderer.pivot = new Vector3(0f, 0.5f, 0f);
            renderer.flip = new Vector3(0.5f, 0f, 0f);
            var legacy = new Material(Shader.Find("Legacy Shaders/Particles/Alpha Blended Premultiply")) { name = "RocketPremultiply" };
            legacy.SetColor("_TintColor", new Color(0.5f, 0.5f, 0.5f, 0.5f));
            legacy.SetTexture("_MainTex", Spark());
            renderer.sharedMaterial = legacy;

            var (_, smoke, smokeRenderer) = MakeSystem("Smoke", go.transform);
            var smokeMain = smoke.main;
            smokeMain.startLifetime = 1f;
            smokeMain.startSize = 0.3f;
            smoke.emission.rateOverTime = 0f;
            smoke.emission.SetBursts(new[] { new ParticleSystem.Burst(0f, 8f) });
            var trails = smoke.trails;
            trails.enabled = true;
            trails.lifetime = 0.5f;
            trails.widthOverTrail = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 1, 1, 0));
            trails.worldSpace = true;
            smokeRenderer.renderMode = ParticleSystemRenderMode.None;
            var subtractive = new Material(Shader.Find("Particles/Standard Unlit")) { name = "SmokeSubtract" };
            subtractive.SetFloat("_Mode", 5);
            subtractive.SetFloat("_SrcBlend", 5);
            subtractive.SetFloat("_DstBlend", 1);
            subtractive.SetFloat("_BlendOp", 2);
            subtractive.SetFloat("_ZWrite", 0);
            subtractive.SetColor("_Color", new Color(0.2f, 0.2f, 0.2f, 1f));
            smokeRenderer.trailMaterial = subtractive;

            var (_, sparks, sparksRenderer) = MakeSystem("TrailSparks", go.transform);
            var sparksMain = sparks.main;
            sparksMain.startLifetime = 0.3f;
            sparks.emission.rateOverTime = 30f;
            var sizeBySpeed = sparks.sizeBySpeed;
            sizeBySpeed.enabled = true;
            sizeBySpeed.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.5f, 1, 1));
            sizeBySpeed.range = new Vector2(0f, 5f);
            var rotationBySpeed = sparks.rotationBySpeed;
            rotationBySpeed.enabled = true;
            rotationBySpeed.z = 3f;
            sparksRenderer.sharedMaterial = Urp("SparksAdd", 1, 1, 1, Spark());

            var subs = rocket.subEmitters;
            subs.enabled = true;
            subs.AddSubEmitter(smoke, ParticleSystemSubEmitterType.Death, ParticleSystemSubEmitterProperties.InheritColor | ParticleSystemSubEmitterProperties.InheritSize, 1f);
            subs.AddSubEmitter(sparks, ParticleSystemSubEmitterType.Birth, ParticleSystemSubEmitterProperties.InheritNothing, 0.5f);
            subs.AddSubEmitter(sparks, ParticleSystemSubEmitterType.Collision, ParticleSystemSubEmitterProperties.InheritNothing, 1f);
            return go;
        }

        /// <summary>One system per Unity blend set-up the exporter reads.</summary>
        private static GameObject Blending()
        {
            var root = new GameObject("Blending");
            void Add(string name, Material mat)
            {
                var (_, _, renderer) = MakeSystem(name, root.transform);
                renderer.sharedMaterial = mat;
            }
            Add("UrpAlpha", Urp("UrpAlpha", 1, 5, 10));
            Add("UrpPremultiply", Urp("UrpPremultiply", 1, 1, 10));
            Add("UrpAdditive", Urp("UrpAdditive", 1, 5, 1));
            Add("UrpMultiply", Urp("UrpMultiply", 1, 2, 0));
            Add("UrpOpaque", Urp("UrpOpaque", 0, 1, 0));
            var odd = Urp("UrpOdd", 1, 7, 8);
            Add("UrpOdd", odd);
            Add("LegacyAdditive", new Material(Shader.Find("Legacy Shaders/Particles/Additive")) { name = "LegacyAdditive" });
            Add("LegacySoftAdditive", new Material(Shader.Find("Legacy Shaders/Particles/Additive (Soft)")) { name = "LegacySoftAdditive" });
            Add("LegacyMultiply", new Material(Shader.Find("Legacy Shaders/Particles/Multiply")) { name = "LegacyMultiply" });
            Add("NoMaterial", null);

            // Built-in Standard Particles, with the blend StandardParticlesShaderGUI sets per mode.
            Material Standard(string name, int mode, int src, int dst, int op = 0)
            {
                var mat = new Material(Shader.Find("Particles/Standard Unlit")) { name = name };
                mat.SetFloat("_Mode", mode);
                mat.SetFloat("_SrcBlend", src);
                mat.SetFloat("_DstBlend", dst);
                mat.SetFloat("_BlendOp", op);
                mat.SetFloat("_ZWrite", mode <= 1 ? 1 : 0);
                mat.SetFloat("_Cutoff", 0.4f);
                mat.SetColor("_Color", Color.white);
                return mat;
            }
            Add("StdOpaque", Standard("StdOpaque", 0, 1, 0));
            Add("StdCutout", Standard("StdCutout", 1, 1, 0));
            Add("StdFade", Standard("StdFade", 2, 5, 10));
            Add("StdTransparent", Standard("StdTransparent", 3, 1, 10));
            Add("StdAdditive", Standard("StdAdditive", 4, 5, 1));
            Add("StdSubtractive", Standard("StdSubtractive", 5, 5, 1, 2));
            Add("StdModulate", Standard("StdModulate", 6, 2, 10));

            // A reflection cubemap, baked into an atlas, and a Mirror Once map.
            var reflective = Urp("Reflective", 1, 5, 10, new Texture2D(1, 1) { name = "mirrorOnce", assetPath = "fixtures/spark.png", wrapMode = TextureWrapMode.MirrorOnce });
            reflective.SetTexture("_Cube", new Cubemap { name = "sky", width = 2, height = 2 });
            Add("Reflective", reflective);
            return root;
        }
    }
}
