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
            ["surfaces"] = Surfaces,
            ["flipbooks"] = Flipbooks,
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

        private static Mesh Quad(bool secondUV, Color32[] colors = null, string name = "Quad")
        {
            return new Mesh
            {
                name = name,
                vertices = new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) },
                triangles = new[] { 0, 2, 1, 0, 3, 2 },
                uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) },
                uv2 = secondUV ? new[] { new Vector2(0, 0), new Vector2(0.5f, 0), new Vector2(0.5f, 0.5f), new Vector2(0, 0.5f) } : new Vector2[0],
                colors32 = colors ?? new Color32[0],
            };
        }

        private static Color32[] VertexColors(params byte[] grey)
        {
            var colors = new Color32[grey.Length];
            for (int i = 0; i < grey.Length; i++) colors[i] = new Color32(grey[i], grey[i], grey[i], 255);
            return colors;
        }

        // ---- fixtures ------------------------------------------------------------------------

        /// <summary>
        /// Billboards: a cone with a looping arc, random and curved Main values, bursts, a 2×2
        /// flipbook, color and size over life, spin, noise, and an additive URP material with a
        /// tiled, scrolling-free map and soft particles. Children cover Render Alignment: Local and
        /// World billboards, a stretched billboard aligned Local, which Unity draws as View, and
        /// Facing and Velocity, which are left out with a warning.
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
            main.stopAction = ParticleSystemStopAction.Destroy;
            main.ringBufferMode = ParticleSystemRingBufferMode.LoopUntilReplaced;
            main.ringBufferLoopRange = new Vector2(0.25f, 0.75f);
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

            // In World space Unity gives each new particle a share of the emitter's velocity.
            var inherit = ps.inheritVelocity;
            inherit.enabled = true;
            inherit.mode = ParticleSystemInheritVelocityMode.Initial;
            inherit.curve = 0.25f;

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
            // A burst the game switches on later: inactive, so it loads disabled.
            var (later, _, _) = MakeSystem("SparksLater", go.transform);
            later.SetActive(false);

            // A scorch mark lying in its node's XY plane, turned 30° in it, as a decal on the ground.
            var (scorchGo, scorch, scorchRenderer) = MakeSystem("Scorch", go.transform);
            scorchGo.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            var scorchMain = scorch.main;
            scorchMain.startSpeed = 0f;
            scorchMain.startRotation = Mathf.PI / 6f;
            scorchRenderer.alignment = ParticleSystemRenderSpace.Local;
            scorchRenderer.sharedMaterial = mat;
            var (_, _, ripplesRenderer) = MakeSystem("Ripples", go.transform);
            ripplesRenderer.alignment = ParticleSystemRenderSpace.World;
            ripplesRenderer.sharedMaterial = mat;
            var (_, _, streaksRenderer) = MakeSystem("Streaks", go.transform);
            streaksRenderer.renderMode = ParticleSystemRenderMode.Stretch;
            streaksRenderer.alignment = ParticleSystemRenderSpace.Local;
            streaksRenderer.sharedMaterial = mat;
            var (_, _, flaresRenderer) = MakeSystem("Flares", go.transform);
            flaresRenderer.alignment = ParticleSystemRenderSpace.Facing;
            flaresRenderer.sharedMaterial = mat;
            var (_, _, glintsRenderer) = MakeSystem("Glints", go.transform);
            glintsRenderer.alignment = ParticleSystemRenderSpace.Velocity;
            glintsRenderer.sharedMaterial = mat;

            // A Local system two nodes below a root mirrored along X, as the mirrored copy of an
            // effect's other half, which Unity does not mirror: scalingMode.test.ts's rootX
            // hierarchy, its rotations as Unity measured them, one particle sent from (0.7, 0.3,
            // 0.2) along the shape's +Z turned (30, 40, 0).
            var mirrored = new GameObject("MirroredRoot").transform;
            mirrored.SetParent(go.transform);
            mirrored.localPosition = new Vector3(0.5f, 0f, 0f);
            mirrored.localRotation = new Quaternion(0.00621f, 0.23172f, -0.35037f, 0.90748f);
            mirrored.localScale = new Vector3(-1.2f, 0.8f, 1.1f);
            var arm = new GameObject("Arm").transform;
            arm.SetParent(mirrored);
            arm.localPosition = new Vector3(-0.3f, 0.2f, 0.1f);
            arm.localRotation = new Quaternion(-0.19595f, 0.50677f, 0.25687f, 0.79925f);
            var (handGo, hand, handRenderer) = MakeSystem("Hand", arm);
            handGo.transform.localPosition = new Vector3(0.2f, -0.4f, 0.3f);
            handGo.transform.localRotation = new Quaternion(0.50880f, -0.28359f, 0.30500f, 0.75344f);
            handGo.transform.localScale = new Vector3(1.3f, 1f, 0.9f);
            var handMain = hand.main;
            handMain.startSpeed = 1f;
            handMain.startLifetime = 10f;
            handMain.scalingMode = ParticleSystemScalingMode.Local;
            handMain.simulationSpace = ParticleSystemSimulationSpace.World;
            hand.emission.rateOverTime = 0f;
            hand.emission.SetBursts(new[] { new ParticleSystem.Burst(0f, 1f) });
            var handShape = hand.shape;
            handShape.shapeType = ParticleSystemShapeType.Cone;
            handShape.angle = 0f;
            handShape.radius = 0.0001f;
            handShape.position = new Vector3(0.7f, 0.3f, 0.2f);
            handShape.rotation = new Vector3(30f, 40f, 0f);
            handRenderer.sharedMaterial = mat;
            return go;
        }

        /// <summary>
        /// Mesh particles in a scaled group: a box shape, 3D start rotation and separate-axes spin,
        /// Hierarchy scaling, a mesh with a second UV set and no normals, and an opaque URP material
        /// with Alpha Clipping and back-face culling. A second system covers Cone Volume, Random
        /// Between Two Curves and Local scaling under a scaled parent, and warns about
        /// separate-axes limits, which the runtime lacks. The chunks keep Unity's default Render
        /// Alignment, View; a third system's Facing is exported as View with a warning.
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
            // White vertex colours, which multiply by 1 and are left out of the export.
            renderer.mesh = Quad(secondUV: true, VertexColors(255, 255, 255, 255));
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
            dustShape.randomDirectionAmount = 0.5f;
            var dustLimit = dust.limitVelocityOverLifetime;
            dustLimit.enabled = true;
            dustLimit.separateAxes = true;
            dustLimit.limitX = 2f;
            dustLimit.limitY = 0.5f;
            dustLimit.limitZ = 3f;
            dustLimit.space = ParticleSystemSimulationSpace.World;
            // A floor below the dust, turned and offset so the plane has to be moved into its space.
            var floor = new GameObject("Floor").transform;
            floor.SetParent(root.transform);
            floor.localPosition = new Vector3(0f, -0.5f, 1f);
            floor.localRotation = Quaternion.Euler(10f, 0f, 0f);
            dust.transform.localScale = new Vector3(2f, 2f, 2f);
            var dustCollision = dust.collision;
            dustCollision.enabled = true;
            dustCollision.AddPlane(floor);
            dustCollision.bounce = 0.5f;
            dustCollision.dampen = 0.2f;
            dustCollision.lifetimeLoss = 0.1f;
            dustCollision.radiusScale = 0.01f;
            dustRenderer.sharedMaterial = Urp("DustAlpha", 1, 5, 10, Spark());

            var (_, _, shardsRenderer) = MakeSystem("Shards", root.transform);
            shardsRenderer.renderMode = ParticleSystemRenderMode.Mesh;
            shardsRenderer.mesh = renderer.mesh;
            shardsRenderer.alignment = ParticleSystemRenderSpace.Facing;
            shardsRenderer.sharedMaterial = mat;

            // A flat ring on a narrow cone with a 2D rotation, as a ground aura: Unity turns it about
            // its axisOfRotation, here Y, so it spins level.
            var (_, ring, ringRenderer) = MakeSystem("Ring", root.transform);
            var ringMain = ring.main;
            ringMain.startSpeed = 0f;
            ringMain.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            var ringShape = ring.shape;
            ringShape.shapeType = ParticleSystemShapeType.Cone;
            ringShape.radius = 0.01f;
            ringShape.angle = 0f;
            // Unity leaves a cone emitting from its base unrandomized, whatever this says.
            ringShape.randomDirectionAmount = 1f;
            var ringSpin = ring.rotationOverLifetime;
            ringSpin.enabled = true;
            ringSpin.z = 2f;
            // Separate Axes on a module that is off leaves the rotation 2D, about axisOfRotation.
            var ringBySpeed = ring.rotationBySpeed;
            ringBySpeed.separateAxes = true;
            ringRenderer.renderMode = ParticleSystemRenderMode.Mesh;
            // Faded out at one side by its vertex colours, as a stream fades at its ends.
            ringRenderer.mesh = Quad(secondUV: false, VertexColors(0, 51, 255, 255), "FadedQuad");
            ringRenderer.sharedMaterial = mat;

            // A Mesh shape without its mesh, which Unity emits from as from no shape: at the origin,
            // along +Z, turning about Z, its Randomize Direction, Align to Direction and shape
            // position unused.
            var (_, spokes, spokesRenderer) = MakeSystem("Spokes", root.transform);
            var spokesMain = spokes.main;
            spokesMain.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI / 2);
            var spokesShape = spokes.shape;
            spokesShape.shapeType = ParticleSystemShapeType.Mesh;
            spokesShape.randomDirectionAmount = 1f;
            spokesShape.alignToDirection = true;
            spokesShape.position = new Vector3(1f, 0f, 0f);
            spokesRenderer.renderMode = ParticleSystemRenderMode.Mesh;
            spokesRenderer.mesh = renderer.mesh;
            spokesRenderer.sharedMaterial = mat;

            // Systems Unity draws nothing of: Mesh mode without a mesh (its child still plays) and
            // a disabled renderer. Both become empty nodes.
            var (hollow, _, hollowRenderer) = MakeSystem("Hollow", root.transform);
            hollowRenderer.renderMode = ParticleSystemRenderMode.Mesh;
            hollowRenderer.sharedMaterial = mat;
            var (_, _, innerRenderer) = MakeSystem("Inner", hollow.transform);
            innerRenderer.sharedMaterial = mat;
            var (_, _, mutedRenderer) = MakeSystem("Muted", root.transform);
            mutedRenderer.enabled = false;
            mutedRenderer.sharedMaterial = mat;

            // Flat petals on a wide cone with a 2D rotation, spun by Rotation over Lifetime with
            // Separate Axes (X and Y still): Unity rotates them in 3D, by their Euler angles, so they
            // all lie in the emitter's XY plane, however the cone tilts them, and spin about its Z.
            var (_, petals, petalsRenderer) = MakeSystem("Petals", root.transform);
            var petalsMain = petals.main;
            petalsMain.startSpeed = 0f;
            petalsMain.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            var petalsShape = petals.shape;
            petalsShape.shapeType = ParticleSystemShapeType.Cone;
            petalsShape.radius = 0.28f;
            petalsShape.angle = 25f;
            var petalsSpin = petals.rotationOverLifetime;
            petalsSpin.enabled = true;
            petalsSpin.separateAxes = true;
            petalsSpin.z = -0.5f;
            petalsRenderer.renderMode = ParticleSystemRenderMode.Mesh;
            petalsRenderer.mesh = renderer.mesh;
            petalsRenderer.alignment = ParticleSystemRenderSpace.Local;
            petalsRenderer.sharedMaterial = mat;

            // The same with Rotation by Speed on with Separate Axes, which rotates them in 3D too.
            var (_, vanes, vanesRenderer) = MakeSystem("Vanes", root.transform);
            var vanesMain = vanes.main;
            vanesMain.startRotation = new ParticleSystem.MinMaxCurve(0f, Mathf.PI * 2f);
            var vanesShape = vanes.shape;
            vanesShape.shapeType = ParticleSystemShapeType.Cone;
            vanesShape.angle = 25f;
            var vanesBySpeed = vanes.rotationBySpeed;
            vanesBySpeed.enabled = true;
            vanesBySpeed.separateAxes = true;
            vanesBySpeed.z = 1f;
            vanesRenderer.renderMode = ParticleSystemRenderMode.Mesh;
            vanesRenderer.mesh = renderer.mesh;
            vanesRenderer.sharedMaterial = mat;
            return root.transform.gameObject;
        }

        /// <summary>
        /// A rocket: a stretched billboard with a pivot and flip, emitting from a mesh surface,
        /// moved by velocity, force and collision, with a death sub-emitter that
        /// leaves trails and a birth sub-emitter of sparks. The trail uses the Standard Particles
        /// shader in Subtractive mode; the rocket a legacy premultiplied shader.
        /// </summary>
        private static GameObject TrailsAndSubEmitters()
        {
            var (go, rocket, renderer) = MakeSystem("Rocket");
            renderer.sortingFudge = -2.5f;
            var main = rocket.main;
            main.stopAction = ParticleSystemStopAction.Disable;
            main.startLifetime = 2f;
            main.startSpeed = 6f;
            main.startColor = Color.white;

            var shape = rocket.shape;
            shape.shapeType = ParticleSystemShapeType.Mesh;
            shape.mesh = Quad(secondUV: false);

            var velocity = rocket.velocityOverLifetime;
            velocity.enabled = true;
            // Curves, as Unity has all three axes in one mode, whose keys stop short of the life's
            // ends: Unity holds the end keys' values, so x kicks for the first 3% of the life only
            // (bullet holes), y stays 1, and z rises from the middle on.
            velocity.x = new ParticleSystem.MinMaxCurve(2f, new AnimationCurve(new Keyframe(0, 1), new Keyframe(0.033f, 0)));
            velocity.y = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Constant(0, 1, 1));
            velocity.z = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0.5f, 0, 1, 1));
            velocity.orbitalZ = 0.5f;
            velocity.radial = -0.25f;
            velocity.space = ParticleSystemSimulationSpace.World;

            var force = rocket.forceOverLifetime;
            force.enabled = true;
            force.x = new ParticleSystem.MinMaxCurve(-1f, 1f);
            force.y = -2f;
            // Randomize: a new random x every frame.
            force.randomized = true;

            // Left out: the rocket simulates in Local space, where Unity inherits nothing.
            var inherit = rocket.inheritVelocity;
            inherit.enabled = true;
            inherit.mode = ParticleSystemInheritVelocityMode.Current;
            inherit.curve = 0.5f;

            var collision = rocket.collision;
            collision.enabled = true;
            collision.type = ParticleSystemCollisionType.World;
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
            smokeMain.scalingMode = ParticleSystemScalingMode.Shape;
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

            // Trails carried on particles that never show, as some effects carry
            // their streaks: Unity draws only the trails, so the system is a trail system. The same set-up
            // on particles that show keeps its particles.
            foreach (var (name, alpha) in new[] { ("Wisp", 0f), ("WispShown", 1f) })
            {
                var (_, wisp, wispRenderer) = MakeSystem(name, go.transform);
                var wispMain = wisp.main;
                wispMain.startLifetime = 0.7f;
                wispMain.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 1f, 1f, alpha));
                var wispTrails = wisp.trails;
                wispTrails.enabled = true;
                wispTrails.lifetime = 1f;
                // Their own colour, not the particle's.
                wispTrails.inheritParticleColor = false;
                wispRenderer.sharedMaterial = legacy;
                wispRenderer.trailMaterial = legacy;
            }

            var (_, sparks, sparksRenderer) = MakeSystem("TrailSparks", go.transform);
            var sparksMain = sparks.main;
            sparksMain.startLifetime = 0.3f;
            // Left out too: in Custom space Unity inherits nothing in Current mode.
            sparksMain.simulationSpace = ParticleSystemSimulationSpace.Custom;
            var sparksInherit = sparks.inheritVelocity;
            sparksInherit.enabled = true;
            sparksInherit.mode = ParticleSystemInheritVelocityMode.Current;
            sparks.emission.rateOverTime = 30f;
            var sizeBySpeed = sparks.sizeBySpeed;
            sizeBySpeed.enabled = true;
            sizeBySpeed.separateAxes = true;
            sizeBySpeed.x = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 0.5f, 1, 1));
            sizeBySpeed.y = 1.5f;
            sizeBySpeed.z = 1f;
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

            // A Trail Renderer on its own node, and one beside a particle system: trail systems
            // that record the node's path, tapering and fading toward the tail. The tracer's node
            // is scaled to 0, which a Trail Renderer ignores.
            var tracer = new GameObject("Tracer");
            tracer.transform.SetParent(go.transform);
            tracer.transform.localScale = Vector3.zero;
            var tracerTrail = tracer.AddComponent<TrailRenderer>();
            tracerTrail.time = 0.4f;
            tracerTrail.minVertexDistance = 0.05f;
            tracerTrail.widthCurve = AnimationCurve.Linear(0, 1, 1, 0);
            tracerTrail.widthMultiplier = 0.3f;
            var fade = new Gradient();
            fade.SetKeys(
                new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(new Color(1f, 0.5f, 0f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
            tracerTrail.colorGradient = fade;
            tracerTrail.textureMode = LineTextureMode.Tile;
            tracerTrail.sharedMaterial = Urp("TracerAdd", 1, 1, 1, Spark());
            var rocketTrail = go.AddComponent<TrailRenderer>();
            rocketTrail.alignment = LineAlignment.TransformZ;
            rocketTrail.sharedMaterial = legacy;
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

        /// <summary>
        /// Mesh particles drawn with Unity's mesh shaders, which keep their surface in the shader:
        /// a cutout (spikes), an opaque one, and Standard's Cutout and Opaque
        /// modes as its inspector sets them. Each is an opaque, lit surface that culls its back
        /// faces; the cutout ones clip at their _Cutoff.
        /// </summary>
        /// <summary>
        /// Texture Sheet Animation's time modes, Start Frame and Flip-Book Blending, on a 4x4 sheet,
        /// with what Unity draws for each measured in Unity 6000.6 (see the babylon.quarks tests).
        /// </summary>
        private static GameObject Flipbooks()
        {
            var root = new GameObject("Flipbooks");
            var blendStreams = new List<ParticleSystemVertexStream>
            {
                ParticleSystemVertexStream.Position,
                ParticleSystemVertexStream.Normal,
                ParticleSystemVertexStream.Color,
                ParticleSystemVertexStream.UV,
                ParticleSystemVertexStream.UV2,
                ParticleSystemVertexStream.AnimBlend,
            };
            ParticleSystem.TextureSheetAnimationModule Sheet(string name, Material mat, bool sendsBlend)
            {
                var (_, ps, renderer) = MakeSystem(name, root.transform);
                renderer.sharedMaterial = mat;
                if (sendsBlend) renderer.SetActiveVertexStreams(blendStreams);
                var sheet = ps.textureSheetAnimation;
                sheet.enabled = true;
                sheet.numTilesX = 4;
                sheet.numTilesY = 4;
                return sheet;
            }
            Material Standard(string name, int flipbookMode)
            {
                var mat = new Material(Shader.Find("Particles/Standard Unlit")) { name = name };
                mat.SetFloat("_Mode", 4);
                mat.SetFloat("_SrcBlend", 1);
                mat.SetFloat("_DstBlend", 1);
                mat.SetFloat("_ZWrite", 0);
                mat.SetFloat("_FlipbookMode", flipbookMode);
                return mat;
            }

            // 12 frames a second from a random frame, blended (URP's Flip-Book Blending).
            var urp = Urp("SmokeBlended", 1, 5, 10, Spark());
            urp.SetFloat("_FlipbookBlending", 1);
            var fps = Sheet("FpsBlended", urp, true);
            fps.timeMode = ParticleSystemAnimationTimeMode.FPS;
            fps.fps = 12f;
            fps.startFrame = new ParticleSystem.MinMaxCurve(0f, 1f);

            // One row at 8 frames a second, a quarter of the row on. The material blends, but the
            // renderer does not send the streams the blend needs, so Unity draws none.
            var row = Sheet("FpsRow", Standard("FlareNoStreams", 1), false);
            row.timeMode = ParticleSystemAnimationTimeMode.FPS;
            row.fps = 8f;
            row.animation = ParticleSystemAnimationType.SingleRow;
            row.rowMode = ParticleSystemAnimationRowMode.Custom;
            row.rowIndex = 2;
            row.startFrame = 0.25f;

            // Over life twice, from 0.3 of the sheet on, through a custom shader that is sent AnimBlend.
            var life = Sheet("LifeStart", new Material(Shader.Find("Effects/Embers")) { name = "Embers" }, true);
            life.cycleCount = 2;
            life.startFrame = 0.3f;

            // By speed, which quarks has no counterpart for: played over life.
            var speed = Sheet("SpeedMode", Standard("SparkSimple", 0), false);
            speed.timeMode = ParticleSystemAnimationTimeMode.Speed;

            // At 0 frames a second the frame stays.
            var held = Sheet("FpsHeld", Standard("GlyphHeld", 0), false);
            held.timeMode = ParticleSystemAnimationTimeMode.FPS;
            held.fps = 0f;

            // The streams are sent, but the material's Flip-Book Mode is Simple: no blend.
            Sheet("SimpleFlipbook", Standard("DustSimple", 0), true);
            return root;
        }

        private static GameObject Surfaces()
        {
            var root = new GameObject("Surfaces");
            var quad = Quad(secondUV: false);
            void Add(string name, Material mat)
            {
                var (_, _, renderer) = MakeSystem(name, root.transform);
                renderer.renderMode = ParticleSystemRenderMode.Mesh;
                renderer.mesh = quad;
                renderer.sharedMaterial = mat;
            }
            var spike = new Material(Shader.Find("Legacy Shaders/Transparent/Cutout/Diffuse")) { name = "SpikeCutout" };
            spike.SetColor("_Color", new Color(0.7f, 0.06f, 0.15f, 1f));
            spike.SetFloat("_Cutoff", 0.458f);
            spike.SetTexture("_MainTex", Spark());
            Add("SpikeCutout", spike);
            var rock = new Material(Shader.Find("Legacy Shaders/Diffuse")) { name = "RockOpaque" };
            rock.SetColor("_Color", Color.white);
            Add("RockOpaque", rock);

            // Standard, with what StandardShaderGUI sets per mode (read in Unity 6).
            Material Standard(string name, bool cutout)
            {
                var mat = new Material(Shader.Find("Standard")) { name = name };
                mat.SetFloat("_Mode", cutout ? 1 : 0);
                mat.SetFloat("_SrcBlend", 1);
                mat.SetFloat("_DstBlend", 0);
                mat.SetFloat("_ZWrite", 1);
                mat.SetFloat("_Cutoff", 0.7f);
                mat.SetColor("_Color", Color.white);
                if (cutout)
                {
                    mat.SetOverrideTag("RenderType", "TransparentCutout");
                    mat.EnableKeyword("_ALPHATEST_ON");
                }
                return mat;
            }
            Add("StdCutout", Standard("StdCutout", true));
            Add("StdOpaque", Standard("StdOpaque", false));
            return root;
        }
    }
}
