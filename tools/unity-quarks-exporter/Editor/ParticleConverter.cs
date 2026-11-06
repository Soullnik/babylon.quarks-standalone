using System.Collections.Generic;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Maps a Unity ParticleSystem's Shuriken modules onto a quarks "ps" object — the per-system
    /// payload of a ParticleEmitter node in the Quarks JSON envelope. Coverage targets the modules
    /// most commonly used to author effects; unmapped modules are skipped rather than guessed.
    /// </summary>
    public static class ParticleConverter
    {
        public static JObject BuildPs(ParticleSystem ps, ParticleSystemRenderer renderer, ExportContext ctx)
        {
            string previousOwner = ValueConverter.Owner;
            ValueConverter.Owner = ps.name;
            try
            {
                return BuildPsUnchecked(ps, renderer, ctx);
            }
            finally
            {
                ValueConverter.Owner = previousOwner;
            }
        }

        private static JObject BuildPsUnchecked(ParticleSystem ps, ParticleSystemRenderer renderer, ExportContext ctx)
        {
            var main = ps.main;
            var behaviors = new JArray();

            // Unity draws trails in a pass of their own beside the particles, but a quarks system has
            // one render mode. A system that draws only its trails (Render Mode None, or particles
            // that never show) becomes a quarks trail system; one that draws both keeps its particles
            // and loses the trails.
            bool trailOnly = IsTrailOnly(ps, renderer);
            WarnAboutTrails(ps, renderer, trailOnly);

            ParticleMaterial material = ctx.AddMaterialForRenderer(renderer, trailOnly);
            int renderMode = trailOnly ? RenderModeTrail : MapRenderMode(renderer.renderMode);
            string geometryUuid = renderMode == 2 && renderer.mesh != null ? ctx.AddGeometryForMesh(renderer.mesh) : null;
            JToken emissionOverTime = EmissionRate(ps, true);
            JToken startLife = AvoidKnifeEdgeLifetime(main.startLifetime, ps.emission);

            var obj = new JObject()
                .Set("looping", main.loop)
                .Set("prewarm", main.prewarm)
                .Set("duration", main.duration)
                .Set("startDelay", ValueConverter.Curve(main.startDelay))
                .Set("shape", BuildShape(ps.shape, ctx, ps.name))
                .Set("startLife", startLife)
                .Set("startSpeed", ValueConverter.Curve(main.startSpeed))
                .Set("startRotation", BuildStartRotation(main, renderMode))
                .Set("startSize", trailOnly ? BuildTrailWidth(ps) : BuildStartSize(main))
                .Set("startColor", trailOnly && !ps.trails.inheritParticleColor
                    ? ValueConverter.ConstantColor(Color.white)
                    : ValueConverter.StartColor(main.startColor, Color.white))
                .Set("emissionOverTime", emissionOverTime)
                .Set("emissionOverDistance", EmissionRate(ps, false))
                .Set("emissionBursts", BuildBursts(ps))
                .Set("maxParticles", main.maxParticles)
                .Set("onlyUsedByOther", ctx.IsSubTarget(ps))
                .Set("renderMode", renderMode)
                .Set("renderOrder", renderer.sortingOrder)
                .Set("rendererEmitterSettings", trailOnly ? BuildTrailSettings(ps) : BuildRendererSettings(renderer, renderMode))
                .Set("material", material.Uuid)
                .Set("layers", 1);

            if (!Mathf.Approximately(main.simulationSpeed, 1f))
            {
                obj.Set("playbackSpeed", main.simulationSpeed);
            }
            if (!ps.useAutoRandomSeed)
            {
                // Cast: a uint would bind to the float conversion and lose the low bits of large seeds.
                obj.Set("seed", (double)ps.randomSeed);
            }
            // Automatic and Always Simulate both keep simulating off screen, the runtime's default.
            switch (main.cullingMode)
            {
                case ParticleSystemCullingMode.Pause:
                    obj.Set("cullingMode", "pause");
                    break;
                case ParticleSystemCullingMode.PauseAndCatchup:
                    obj.Set("cullingMode", "pauseAndCatchUp");
                    break;
            }
            switch (renderer.sortMode)
            {
                case ParticleSystemSortMode.Distance:
                case ParticleSystemSortMode.Depth:
                    obj.Set("sortMode", "distance");
                    break;
                case ParticleSystemSortMode.OldestInFront:
                    obj.Set("sortMode", "oldestInFront");
                    break;
                case ParticleSystemSortMode.YoungestInFront:
                    obj.Set("sortMode", "youngestInFront");
                    break;
            }
            // Unity's screen-size limits (fractions of the viewport) only apply to billboards; the
            // runtime's default is unlimited, so Unity's default maximum of 0.5 is written out.
            if (renderMode != 2 && renderMode != 3)
            {
                if (renderer.minParticleSize > 0f)
                {
                    obj.Set("minParticleSize", renderer.minParticleSize);
                }
                if (renderer.maxParticleSize < 1f)
                {
                    obj.Set("maxParticleSize", renderer.maxParticleSize);
                }
            }

            if (geometryUuid != null)
            {
                obj.Set("instancingGeometry", geometryUuid);
            }
            if (!trailOnly) AddPivotAndFlip(ps, renderer, renderMode, obj);
            if (!trailOnly && EmitsFromShape(ps.shape) && ps.shape.alignToDirection)
            {
                obj.Set("alignToDirection", true);
            }

            BuildTextureSheet(ps, obj, behaviors, trailOnly);

            // Blending, depth and alpha test are the material entry's.
            obj.Set("worldSpace", main.simulationSpace != ParticleSystemSimulationSpace.Local);
            // Render Face only means something for a mesh; billboards always face the camera.
            if (renderMode == 2 && material.RenderFace != "both") obj.Set("renderFace", material.RenderFace);
            // Unity's Render Alignment lays out mesh particles and billboards only: its stretched,
            // horizontal and vertical billboards draw the same for every alignment.
            if (renderMode == 0 || renderMode == 2) AddRenderAlignment(ps, renderer, renderMode, obj);
            if (renderMode == 2) AddRotationAxis(ps, obj);
            // The legacy Alpha Blended Premultiply's texture is premultiplied, glow and all.
            if (material.PremultipliedTexture) obj.Set("premultipliedMap", true);
            // Unity's mesh shaders draw a particle without its colour.
            if (!material.ParticleColor) obj.Set("particleColor", false);
            AddMaterialColor(obj, material);
            // Unity sorts the renderer by its distance plus this; authors set it to layer systems.
            if (renderer.sortingFudge != 0f) obj.Set("sortingFudge", renderer.sortingFudge);
            if (material.SoftParticles)
            {
                obj.Set("softParticles", true);
                if (material.SoftNearFade > 0f) obj.Set("softNearFade", material.SoftNearFade);
                if (!Mathf.Approximately(material.SoftFarFade, 1f)) obj.Set("softFarFade", material.SoftFarFade);
            }
            AddScalingMode(ps, main, obj);
            AddStopAction(main, obj);
            AddRingBuffer(ps, main, obj, trailOnly);

            // ---- behaviors from the over-lifetime / by-speed modules ----
            AddGravity(main, behaviors);
            AddRandomizeDirection(ps, behaviors);
            if (trailOnly)
            {
                AddTrailColor(ps, behaviors);
                AddTrailWidthOverLength(ps, behaviors);
            }
            else
            {
                AddColorOverLife(ps, behaviors);
            }
            // A trail only takes the particle's size when Unity's Size affects Width is on.
            bool sizeMatters = !trailOnly || ps.trails.sizeAffectsWidth;
            if (sizeMatters) AddSizeOverLife(ps, behaviors);
            AddRotationOverLife(ps, behaviors, renderMode);
            AddVelocityOverLife(ps, behaviors);
            AddInheritVelocity(ps, behaviors);
            AddLimitVelocity(ps, behaviors);
            AddForceOverLife(ps, behaviors);
            // Without Inherit Particle Color, nothing about the particle's color reaches its trail.
            if (!trailOnly || ps.trails.inheritParticleColor) AddColorBySpeed(ps, behaviors);
            if (sizeMatters) AddSizeBySpeed(ps, behaviors);
            AddRotationBySpeed(ps, behaviors, renderMode);
            AddNoise(ps, behaviors);
            AddCollision(ps, behaviors);
            AddSubEmitters(ps, ctx, behaviors);

            obj.Set("behaviors", behaviors);
            return obj;
        }

        // ---- Main ------------------------------------------------------------------------

        private static JToken BuildStartRotation(ParticleSystem.MainModule main, int renderMode)
        {
            bool mesh = renderMode == 2;
            if (main.startRotation3D)
            {
                // Mesh particles carry a full 3D orientation (quarks EulerGenerator → quaternion).
                // Billboards only rotate in screen space, so use just the Z angle.
                if (mesh)
                {
                    return Euler(
                        ValueConverter.Curve(main.startRotationX),
                        ValueConverter.Curve(main.startRotationY),
                        ValueConverter.Curve(main.startRotationZ));
                }
                return ScaleCurve(main.startRotationZ, SpinSign(renderMode));
            }
            // A number rotation turns a mesh about its rotation axis, Z unless rotationAxis says
            // otherwise (see AddRotationAxis), as Unity turns it about its axisOfRotation, or about
            // Z when it rotates the particle in 3D.
            return ScaleCurve(main.startRotation, SpinSign(renderMode));
        }

        /// <summary>
        /// Unity turns a camera-facing quad clockwise for a positive angle, quarks counter-clockwise,
        /// so billboard angles and spins flip sign. Unity's API already gives radians (the inspector
        /// shows degrees), as quarks expects. Horizontal billboards and meshes keep their sign: their
        /// direction hasn't been checked against Unity.
        /// </summary>
        private static float SpinSign(int renderMode) =>
            renderMode == 0 || renderMode == 5 ? -1f : 1f;

        private static JToken Euler(JToken x, JToken y, JToken z) =>
            // Unity's intrinsic ZXY order (rotate Z, then X, then Y) is the same rotation as quarks'
            // intrinsic YXZ order — not XYZ. Using XYZ here turns an in-plane Unity spin (e.g. a
            // random Y-axis roll on a flat mesh) into a wobble out of plane.
            new JObject().Set("type", "Euler").Set("angleX", x).Set("angleY", y).Set("angleZ", z).Set("eulerOrder", "YXZ");

        private static JToken BuildStartSize(ParticleSystem.MainModule main)
        {
            if (main.startSize3D)
            {
                return new JObject()
                    .Set("type", "Vector3Function")
                    .Set("x", ValueConverter.Curve(main.startSizeX))
                    .Set("y", ValueConverter.Curve(main.startSizeY))
                    .Set("z", ValueConverter.Curve(main.startSizeZ));
            }
            return ValueConverter.Curve(main.startSize);
        }

        private static void AddGravity(ParticleSystem.MainModule main, JArray behaviors)
        {
            float g = ConstantOf(main.gravityModifier);
            if (Mathf.Abs(g) < 1e-5f) return;
            // Gravity pulls along world -Y whatever the emitter's own rotation is,
            // so it has to be a world-space force. ApplyForce adds its direction
            // straight to the velocity, which for a local-space system means the
            // emitter's rotation turns it: a particle system carrying Unity's usual
            // -90 degrees about X had its gravity pushing along world Z instead of
            // down. ForceOverLife is the behavior that undoes the emitter transform.
            // Unity's gravity, unlike its forces, ignores the emitter's scale in either
            // simulation space, so it keeps its strength in world units.
            behaviors.Add(new JObject()
                .Set("type", "ForceOverLife")
                .Set("x", ValueConverter.Constant(0f))
                .Set("y", ValueConverter.Constant(-9.81f * g))
                .Set("z", ValueConverter.Constant(0f))
                .Set("scaleWithEmitter", false));
        }

        // ---- Emission --------------------------------------------------------------------

        private static JToken EmissionRate(ParticleSystem ps, bool overTime)
        {
            var e = ps.emission;
            if (!e.enabled) return ValueConverter.Constant(0);
            return ValueConverter.Curve(overTime ? e.rateOverTime : e.rateOverDistance);
        }

        /// <summary>
        /// When constant rate × constant life is a whole number, the quarks fixed
        /// 1/60 step leaves one blank frame per period (age and emission sit one
        /// step apart). Unity softens the same edge with "life 1.01"; we add one
        /// simulation step of lifetime so occupancy is never exactly integer.
        /// Curves and ranges are left alone — only the constant/constant case is
        /// unambiguous enough to nudge.
        /// </summary>
        private static JToken AvoidKnifeEdgeLifetime(ParticleSystem.MinMaxCurve lifeCurve, ParticleSystem.EmissionModule emission)
        {
            JToken life = ValueConverter.Curve(lifeCurve);
            if (!emission.enabled) return life;
            if (lifeCurve.mode != ParticleSystemCurveMode.Constant) return life;
            if (emission.rateOverTime.mode != ParticleSystemCurveMode.Constant) return life;

            float lifeValue = lifeCurve.constant;
            float rateValue = emission.rateOverTime.constant;
            float occupancy = rateValue * lifeValue;
            if (occupancy <= 0f) return life;

            float nearest = Mathf.Round(occupancy);
            if (Mathf.Abs(occupancy - nearest) > 1e-3f) return life;

            return ValueConverter.Constant(lifeValue + 1f / 60f);
        }

        private static JToken BuildBursts(ParticleSystem ps)
        {
            var arr = new JArray();
            var e = ps.emission;
            if (!e.enabled || e.burstCount == 0) return arr;
            var bursts = new ParticleSystem.Burst[e.burstCount];
            e.GetBursts(bursts);
            foreach (var b in bursts)
            {
                arr.Add(new JObject()
                    .Set("time", b.time)
                    .Set("count", ValueConverter.Curve(b.count))
                    .Set("probability", b.probability)
                    .Set("interval", Mathf.Max(0.001f, b.repeatInterval))
                    .Set("cycle", Mathf.Max(1, b.cycleCount)));
            }
            return arr;
        }

        // ---- Shape -----------------------------------------------------------------------

        private static JToken BuildShape(ParticleSystem.ShapeModule shape, ExportContext ctx, string owner)
        {
            // No shape: every particle starts at the origin heading along +Z, which a cone with no
            // radius and no opening does too.
            if (!EmitsFromShape(shape)) return new JObject().Set("type", "cone").Set("radius", 0f).Set("angle", 0f);
            return AddShapeTransform(BuildShapeType(shape, ctx, owner), shape);
        }

        /// <summary>
        /// Whether Unity emits from the Shape module: it is on, and a shape that takes its points from
        /// a mesh, a renderer or a sprite has one. Otherwise Unity starts every particle at the
        /// emitter's origin heading along +Z, ignores the module's other settings (its position,
        /// rotation and scale, Randomize Direction, Align to Direction) and turns mesh particles about
        /// Z (measured in Unity 6).
        /// </summary>
        private static bool EmitsFromShape(ParticleSystem.ShapeModule shape)
        {
            if (!shape.enabled) return false;
            switch (shape.shapeType)
            {
                case ParticleSystemShapeType.Mesh: return shape.mesh != null;
                case ParticleSystemShapeType.MeshRenderer: return shape.meshRenderer != null;
                case ParticleSystemShapeType.SkinnedMeshRenderer: return shape.skinnedMeshRenderer != null;
                case ParticleSystemShapeType.Sprite: return shape.sprite != null;
                case ParticleSystemShapeType.SpriteRenderer: return shape.spriteRenderer != null;
                default: return true;
            }
        }

        /// <summary>
        /// Unity's Shape Position / Rotation / Scale → the quarks shape <c>transform</c>, written only
        /// when one of them is set. Both apply them the same way (measured in Unity): the spawn point
        /// goes to <c>position + rotation · (scale · p)</c> and the start direction through the same
        /// scale and rotation, keeping its speed. The rotation is Unity's own Euler → quaternion.
        /// </summary>
        private static JObject AddShapeTransform(JObject json, ParticleSystem.ShapeModule shape)
        {
            var transform = new JObject();
            Vector3 p = shape.position, r = shape.rotation, s = shape.scale;
            if (p != Vector3.zero) transform.Set("position", Vec3(p.x, p.y, p.z));
            if (r != Vector3.zero)
            {
                Quaternion q = Quaternion.Euler(r);
                transform.Set("rotation", new JArray().Add(q.x).Add(q.y).Add(q.z).Add(q.w));
            }
            if (s != Vector3.one && !ScaleIsShapeSize(shape.shapeType)) transform.Set("scale", Vec3(s.x, s.y, s.z));
            if (transform.Members.Count > 0) json.Set("transform", transform);
            return json;
        }

        /// <summary>
        /// Box and rectangle shapes have no size of their own in Unity: Shape Scale is their size, and
        /// it goes into the shape's own width / height / depth rather than into the transform.
        /// </summary>
        private static bool ScaleIsShapeSize(ParticleSystemShapeType type) =>
            type == ParticleSystemShapeType.Box
            || type == ParticleSystemShapeType.BoxShell
            || type == ParticleSystemShapeType.BoxEdge
            || type == ParticleSystemShapeType.Rectangle;

        private static JObject BuildShapeType(ParticleSystem.ShapeModule shape, ExportContext ctx, string owner)
        {
            switch (shape.shapeType)
            {
                case ParticleSystemShapeType.Cone:
                    return ShapeBase("cone", shape).Set("angle", shape.angle * Mathf.Deg2Rad);
                case ParticleSystemShapeType.ConeVolume:
                    return ShapeBase("cone", shape)
                        .Set("angle", shape.angle * Mathf.Deg2Rad)
                        .Set("emitFrom", ConeEmitFromVolume)
                        .Set("length", Mathf.Max(0f, shape.length));
                case ParticleSystemShapeType.Sphere:
                    return ShapeBase("sphere", shape);
                case ParticleSystemShapeType.Hemisphere:
                    return ShapeBase("hemisphere", shape);
                case ParticleSystemShapeType.Circle:
                    return ShapeBase("circle", shape);
                case ParticleSystemShapeType.Donut:
                    return ShapeBase("donut", shape).Set("donutRadius", shape.donutRadius);
                case ParticleSystemShapeType.Mesh:
                    // A Mesh shape without its mesh emits as no shape, see EmitsFromShape.
                    string meshNodeUuid = ctx.AddMeshSourceNode(shape.mesh);
                    return new JObject().Set("type", "mesh_surface").Set("mesh", meshNodeUuid);
                case ParticleSystemShapeType.Box:
                    return BoxShape(shape, shape.scale, BoxEmitFromVolume);
                case ParticleSystemShapeType.BoxShell:
                    return BoxShape(shape, shape.scale, BoxEmitFromShell);
                case ParticleSystemShapeType.BoxEdge:
                    return BoxShape(shape, shape.scale, BoxEmitFromEdge);
                case ParticleSystemShapeType.Rectangle:
                    // A filled rectangle in the XY plane, moving along +Z: a box with no depth.
                    return BoxShape(shape, new Vector3(shape.scale.x, shape.scale.y, 0f), BoxEmitFromVolume);
                case ParticleSystemShapeType.SingleSidedEdge:
                    return new JObject()
                        .Set("type", "edge")
                        .Set("radius", shape.radius)
                        // Unity's Random/Loop/PingPong/BurstSpread line up with quarks' EmitterMode.
                        .Set("mode", (int)shape.radiusMode)
                        .Set("spread", shape.radiusSpread)
                        .Set("speed", ValueConverter.Curve(shape.radiusSpeed));
                default:
                    // MeshRenderer, SkinnedMeshRenderer, Sprite and SpriteRenderer shapes have no
                    // quarks equivalent yet.
                    Debug.LogWarning($"[Quarks Exporter] '{owner}': shape {shape.shapeType} has no quarks counterpart and is exported as a point.");
                    return new JObject().Set("type", "point");
            }
        }

        // quarks BoxEmitFrom: Volume=0, Shell=1, Edge=2.
        private const int BoxEmitFromVolume = 0;
        private const int BoxEmitFromShell = 1;
        private const int BoxEmitFromEdge = 2;

        // quarks ConeEmitFrom: Base=0, Volume=1.
        private const int ConeEmitFromVolume = 1;

        /// <summary>Unity sizes its box shapes by the shape's Scale; all of them move particles along +Z.</summary>
        private static JObject BoxShape(ParticleSystem.ShapeModule shape, Vector3 size, int emitFrom)
        {
            var obj = new JObject()
                .Set("type", "box")
                .Set("width", size.x)
                .Set("height", size.y)
                .Set("depth", size.z)
                .Set("emitFrom", emitFrom);
            if (emitFrom != BoxEmitFromVolume)
            {
                Vector3 t = shape.boxThickness;
                obj.Set("boxThickness", Vec3(Mathf.Clamp01(t.x), Mathf.Clamp01(t.y), Mathf.Clamp01(t.z)));
            }
            return obj;
        }

        /// <summary>
        /// The fields Unity's round shapes share: Radius, Radius Thickness (1:1, 0 = the surface,
        /// 1 = the whole volume) and the Arc with its Mode, Spread and Speed. Unity's arc modes
        /// (Random, Loop, Ping-Pong, Burst Spread) line up with quarks' EmitterMode, Spread is the
        /// same fraction of the arc, and Speed is in arcs per second on both sides.
        /// </summary>
        private static JObject ShapeBase(string type, ParticleSystem.ShapeModule shape)
        {
            return new JObject()
                .Set("type", type)
                .Set("radius", shape.radius)
                .Set("thickness", Mathf.Clamp01(shape.radiusThickness))
                .Set("arc", shape.arc * Mathf.Deg2Rad)
                .Set("mode", (int)shape.arcMode)
                .Set("spread", Mathf.Clamp01(shape.arcSpread))
                .Set("speed", ValueConverter.Curve(shape.arcSpeed));
        }

        // ---- Renderer --------------------------------------------------------------------

        private static int MapRenderMode(ParticleSystemRenderMode mode)
        {
            switch (mode)
            {
                case ParticleSystemRenderMode.Billboard: return 0;
                case ParticleSystemRenderMode.Stretch: return 1;
                case ParticleSystemRenderMode.HorizontalBillboard: return 4;
                case ParticleSystemRenderMode.VerticalBillboard: return 5;
                case ParticleSystemRenderMode.Mesh: return 2;
                default: return 0;
            }
        }

        private static JToken BuildRendererSettings(ParticleSystemRenderer renderer, int renderMode)
        {
            if (renderMode == 1) // stretched billboard
            {
                // Unity Velocity Scale → speedFactor, Length Scale → lengthFactor, both faithfully
                // (the runtime keeps the stretch aligned to velocity even when speedFactor is 0).
                return new JObject()
                    .Set("speedFactor", renderer.velocityScale)
                    .Set("lengthFactor", renderer.lengthScale);
            }
            return new JObject();
        }

        /// <summary>
        /// Renderer Pivot and Flip, measured against Unity's own baked geometry. Flip is the fraction
        /// of particles whose texture is mirrored along U / V; the pivot is never mirrored with them.
        /// <list type="bullet">
        /// <item>Billboards: the pivot is in particle-size units, x/y turn with the particle and z
        /// moves the quad toward the camera (up for horizontal billboards) — the same as quarks.</item>
        /// <item>Horizontal billboards: quarks lays the quad's Y along world -Z where Unity lays it
        /// along +Z, so the pivot's Y flips sign, and the texture is upside down next to Unity's, so
        /// mirroring the other fraction along V puts it right.</item>
        /// <item>Stretched billboards: Unity moves the streak across itself by -x·size and along the
        /// velocity by 2·y·size and ignores z; quarks measures x from head to tail and y across. The
        /// quarks streak's V also runs the other way to Unity's, fixed by the same V complement.</item>
        /// </list>
        /// </summary>
        private static void AddPivotAndFlip(ParticleSystem ps, ParticleSystemRenderer renderer, int renderMode, JObject obj)
        {
            Vector3 pivot = renderer.pivot;
            float flipU = Mathf.Clamp01(renderer.flip.x);
            float flipV = Mathf.Clamp01(renderer.flip.y);
            switch (renderMode)
            {
                case 0: // billboard
                case 5: // vertical billboard
                    break;
                case 4: // horizontal billboard
                    pivot.y = -pivot.y;
                    flipV = 1f - flipV;
                    break;
                case 1: // stretched billboard
                    pivot = new Vector3(-2f * pivot.y, -pivot.x, 0f);
                    flipV = 1f - flipV;
                    break;
                default:
                    if (pivot != Vector3.zero || flipU > 0f || flipV > 0f)
                    {
                        Debug.LogWarning($"[Quarks Exporter] '{ps.name}': renderer Pivot / Flip have no quarks counterpart for {renderer.renderMode} and are skipped.");
                    }
                    return;
            }
            if (pivot != Vector3.zero) obj.Set("pivot", Vec3(pivot.x, pivot.y, pivot.z));
            if (flipU > 0f || flipV > 0f) obj.Set("flip", new JArray().Add(flipU).Add(flipV));
        }

        // ---- Trails ----------------------------------------------------------------------

        private const int RenderModeTrail = 3;

        /// <summary>quarks steps its simulation at 60Hz and records one trail sample per step.</summary>
        private const float TrailSamplesPerSecond = 60f;

        /// <summary>
        /// Why Unity draws nothing of the system, or null when it draws it: a disabled or missing
        /// renderer, Mesh mode without a mesh, or Render Mode None without trails.
        /// </summary>
        internal static string WhyNothingIsDrawn(ParticleSystem ps)
        {
            var renderer = ps.GetComponent<ParticleSystemRenderer>();
            if (renderer == null) return "it has no renderer";
            if (!renderer.enabled) return "its renderer is disabled";
            if (renderer.renderMode == ParticleSystemRenderMode.Mesh && renderer.mesh == null) return "it draws meshes but has no mesh";
            if (renderer.renderMode == ParticleSystemRenderMode.None && !ps.trails.enabled) return "its Render Mode is None";
            return null;
        }

        /// <summary>
        /// Whether the system becomes a quarks emitter. One Unity draws nothing of is left out
        /// (its node stays, for its children), unless its particles spawn sub-emitters.
        /// </summary>
        internal static bool IsExported(ParticleSystem ps) => ps.subEmitters.enabled || WhyNothingIsDrawn(ps) == null;

        /// <summary>
        /// Whether Unity draws only the system's trails: Render Mode None, or particles that never
        /// show (see <see cref="DrawsParticlesSeeThrough"/>), with the Trails module on, per particle.
        /// </summary>
        private static bool IsTrailOnly(ParticleSystem ps, ParticleSystemRenderer renderer)
        {
            var trails = ps.trails;
            return trails.enabled
                && trails.mode == ParticleSystemTrailMode.PerParticle
                && (renderer.renderMode == ParticleSystemRenderMode.None || DrawsParticlesSeeThrough(ps, renderer));
        }

        /// <summary>
        /// Whether the system's particles never show: every start colour it can pick has an alpha of
        /// 0, which Color over Lifetime and Color by Speed only multiply, and the material draws the
        /// particle's colour (see MaterialReader.ParticleColor). Trails carried on
        /// such particles are all Unity draws of them.
        /// </summary>
        private static bool DrawsParticlesSeeThrough(ParticleSystem ps, ParticleSystemRenderer renderer)
        {
            if (!MaterialReader.Read(renderer.sharedMaterial).ParticleColor) return false;
            const float none = 0.5f / 255f;
            var color = ps.main.startColor;
            switch (color.mode)
            {
                case ParticleSystemGradientMode.Color:
                    return color.color.a <= none;
                case ParticleSystemGradientMode.TwoColors:
                    return color.colorMin.a <= none && color.colorMax.a <= none;
                case ParticleSystemGradientMode.TwoGradients:
                    return MaxAlpha(color.gradientMin) <= none && MaxAlpha(color.gradientMax) <= none;
                default:
                    return MaxAlpha(color.gradient) <= none;
            }
        }

        private static float MaxAlpha(Gradient gradient)
        {
            if (gradient == null) return 1f;
            float max = 0f;
            foreach (var key in gradient.alphaKeys) max = Mathf.Max(max, key.alpha);
            return max;
        }

        private static void WarnAboutTrails(ParticleSystem ps, ParticleSystemRenderer renderer, bool trailOnly)
        {
            var trails = ps.trails;
            if (!trails.enabled) return;
            string who = $"[Quarks Exporter] '{ps.name}':";
            if (trails.mode == ParticleSystemTrailMode.Ribbon)
            {
                Debug.LogWarning($"{who} Ribbon trails have no quarks counterpart and are skipped.");
                return;
            }
            if (!trailOnly)
            {
                Debug.LogWarning($"{who} draws particles and trails; a quarks system has one render mode, so only the particles are exported.");
                return;
            }
            if (trails.textureMode != ParticleSystemTrailTextureMode.Stretch)
            {
                Debug.LogWarning($"{who} trail Texture Mode {trails.textureMode} is exported as Stretch.");
            }
            if (ConstantOf(trails.ratio) < 0.999f)
            {
                Debug.LogWarning($"{who} trail Ratio below 1 is exported as 1 (every particle gets a trail).");
            }
            if (trails.colorOverTrail.mode != ParticleSystemGradientMode.Color)
            {
                Debug.LogWarning($"{who} trail Color over Trail varies along the trail; only its value at the head is exported.");
            }
        }

        /// <summary>
        /// The trail width as quarks reads it — from the particle size. Unity's width is
        /// Width over Trail, times the particle size when Size affects Width is on.
        /// </summary>
        private static JToken BuildTrailWidth(ParticleSystem ps)
        {
            var trails = ps.trails;
            var main = ps.main;
            var size = main.startSize3D ? main.startSizeX : main.startSize;
            // A curved Width over Trail is applied along the trail by WidthOverLength; the head
            // sample is written from the particle size before that runs, so give it the head width.
            float width = trails.widthOverTrail.mode == ParticleSystemCurveMode.Curve
                || trails.widthOverTrail.mode == ParticleSystemCurveMode.TwoCurves
                ? trails.widthOverTrail.Evaluate(0f)
                : ConstantOf(trails.widthOverTrail);
            return trails.sizeAffectsWidth ? ScaleCurve(size, width) : ValueConverter.Constant(width);
        }

        private static void AddTrailWidthOverLength(ParticleSystem ps, JArray behaviors)
        {
            var trails = ps.trails;
            var width = trails.widthOverTrail;
            bool curved = width.mode == ParticleSystemCurveMode.Curve || width.mode == ParticleSystemCurveMode.TwoCurves;
            if (!curved) return;
            // WidthOverLength writes absolute widths, so the particle size is folded in up front
            // (and any size-over-lifetime change is lost along a curved trail).
            float sizeScale = trails.sizeAffectsWidth ? ConstantOf(ps.main.startSize3D ? ps.main.startSizeX : ps.main.startSize) : 1f;
            float multiplier = width.curveMultiplier * sizeScale;
            behaviors.Add(new JObject()
                .Set("type", "WidthOverLength")
                .Set("width", width.mode == ParticleSystemCurveMode.TwoCurves
                    ? ValueConverter.TwoCurves(width.curveMin, width.curveMax, multiplier)
                    : ValueConverter.Bezier(width.curve, multiplier)));
        }

        private static JToken BuildTrailSettings(ParticleSystem ps)
        {
            var trails = ps.trails;
            var main = ps.main;
            // Unity's trail Lifetime is how long each trail point lives, as a fraction of the
            // particle's lifetime; quarks keeps a fixed number of samples, one per step.
            float seconds = ConstantOf(trails.lifetime) * ConstantOf(main.startLifetime);
            if (trails.sizeAffectsLifetime)
            {
                seconds *= ConstantOf(main.startSize3D ? main.startSizeX : main.startSize);
            }
            float samples = Mathf.Max(2f, Mathf.Ceil(seconds * TrailSamplesPerSecond));

            var settings = new JObject()
                .Set("startLength", ValueConverter.Constant(samples))
                .Set("followLocalOrigin", false)
                // Unity stretches the texture from the particle (U = 0) back to the tail and tints
                // the whole trail with the particle's current color.
                .Set("uvFromHead", true)
                .Set("colorFromParticle", true);
            if (trails.dieWithParticles)
            {
                settings.Set("dieWithParticle", true);
            }
            // Trails > World Space: the points stay where they were laid down even though the
            // particles themselves move with the emitter.
            if (trails.worldSpace && main.simulationSpace == ParticleSystemSimulationSpace.Local)
            {
                settings.Set("recordWorldSpace", true);
            }
            return settings;
        }

        /// <summary>
        /// The trail is drawn in the particle's current color (colorFromParticle), so everything
        /// Unity multiplies into the whole trail over the particle's life — the particle's own
        /// Color over Lifetime, the trail's Color over Lifetime and the head of Color over Trail —
        /// folds into one ColorOverLife gradient.
        /// </summary>
        private static void AddTrailColor(ParticleSystem ps, JArray behaviors)
        {
            var trails = ps.trails;
            var particleColor = ps.colorOverLifetime;
            bool useParticleColor = trails.inheritParticleColor && particleColor.enabled;
            var trailColor = trails.colorOverLifetime;
            Color overTrail = trails.colorOverTrail.Evaluate(0f, 1f);

            var times = new SortedSet<float> { 0f, 1f };
            // Products of linear pieces are not linear, so sample in between the keys too.
            for (int i = 1; i < 10; i++) times.Add(i / 10f);
            ValueConverter.AddKeyTimes(times, trailColor.gradient);
            if (useParticleColor) ValueConverter.AddKeyTimes(times, particleColor.color.gradient);

            behaviors.Add(new JObject()
                .Set("type", "ColorOverLife")
                .Set("color", ValueConverter.SampledGradient(times, t =>
                {
                    Color c = trailColor.Evaluate(t, 1f) * overTrail;
                    return useParticleColor ? c * particleColor.color.Evaluate(t, 1f) : c;
                })));
        }

        // ---- Texture Sheet Animation -----------------------------------------------------

        /// <param name="trail">Unity's trails ignore Texture Sheet Animation, so trail systems keep one tile.</param>
        private static void BuildTextureSheet(ParticleSystem ps, JObject obj, JArray behaviors, bool trail)
        {
            var tsa = ps.textureSheetAnimation;
            if (tsa.enabled && !trail)
            {
                int u = Mathf.Max(1, tsa.numTilesX);
                int v = Mathf.Max(1, tsa.numTilesY);
                int tiles = Mathf.Max(1, u * v);
                obj.Set("startTileIndex", ValueConverter.Curve(tsa.startFrame))
                    .Set("uTileCount", u)
                    .Set("vTileCount", v)
                    .Set("blendTiles", false);
                // Unity frameOverTime is authored in normalized tile space (0..1) and shows tile
                // floor(value x tiles), holding 1.0 on the last tile. quarks floors the value it is
                // given, so scale by just under `tiles`: every tile then gets an equal share of the
                // sweep, where scaling by tiles - 1 left the last tile on screen for an instant at
                // most (and a random pick never chose it). Constants, random ranges and curves keep
                // their shape.
                // Single Row plays one row of the sheet: the frames are counted within the row,
                // and quarks adds the row's first frame (the row fixed, or picked per particle).
                bool singleRow = tsa.animation == ParticleSystemAnimationType.SingleRow && v > 1;
                float frameScale = (singleRow ? u : tiles) - 0.001f;
                var frameOverTime = tsa.frameOverTime;
                int cycles = Mathf.Max(1, tsa.cycleCount);
                bool curved = frameOverTime.mode == ParticleSystemCurveMode.Curve
                    || frameOverTime.mode == ParticleSystemCurveMode.TwoCurves;
                // Cycles replay the curve that many times over the particle's life; a constant or
                // random frame is the same in every cycle.
                float frameMultiplier = frameOverTime.curveMultiplier * frameScale;
                JToken frame = !curved || cycles <= 1
                    ? ScaleCurve(frameOverTime, frameScale)
                    : frameOverTime.mode == ParticleSystemCurveMode.TwoCurves
                        ? ValueConverter.TwoCurves(frameOverTime.curveMin, frameOverTime.curveMax, frameMultiplier, cycles)
                        : ValueConverter.Bezier(frameOverTime.curve, frameMultiplier, cycles);
                var frameOverLife = new JObject()
                    .Set("type", "FrameOverLife")
                    .Set("frame", frame);
                if (singleRow)
                {
                    if (tsa.rowMode == ParticleSystemAnimationRowMode.MeshIndex)
                        Debug.LogWarning($"[Quarks Exporter] '{ps.name}': Texture Sheet Animation Row Mode Mesh Index has no quarks counterpart; the first row plays.");
                    frameOverLife.Set("rowLength", u).Set("rowCount", v);
                    if (tsa.rowMode == ParticleSystemAnimationRowMode.Random) frameOverLife.Set("randomRow", true);
                    else if (tsa.rowMode == ParticleSystemAnimationRowMode.Custom && tsa.rowIndex > 0)
                        frameOverLife.Set("row", Mathf.Clamp(tsa.rowIndex, 0, v - 1));
                }
                behaviors.Add(frameOverLife);
            }
            else
            {
                obj.Set("startTileIndex", ValueConverter.Constant(0))
                    .Set("uTileCount", 1)
                    .Set("vTileCount", 1)
                    .Set("blendTiles", false);
            }
        }

        // ---- over-lifetime behaviors -----------------------------------------------------

        private static void AddColorOverLife(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.colorOverLifetime;
            if (!m.enabled) return;
            behaviors.Add(new JObject().Set("type", "ColorOverLife").Set("color", ValueConverter.StartColorGradient(m.color)));
        }

        private static void AddSizeOverLife(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.sizeOverLifetime;
            if (!m.enabled) return;
            // Separate axes become a per-axis Vector3Function; Unity throws on `.size` in that mode.
            JToken size = m.separateAxes ? PerAxis(m.x, m.y, m.z) : ValueConverter.Curve(m.size);
            behaviors.Add(new JObject().Set("type", "SizeOverLife").Set("size", size));
        }

        private static void AddRotationOverLife(ParticleSystem ps, JArray behaviors, int renderMode)
        {
            var m = ps.rotationOverLifetime;
            if (!m.enabled) return;
            if (m.separateAxes && renderMode == 2)
            {
                // A mesh particle turns about all three of its axes, in the same order as its
                // start rotation (see Euler). Unity adds the rates to the particle's Euler angles
                // and rebuilds its rotation from them, which is quarks' 'angles' integration.
                behaviors.Add(new JObject()
                    .Set("type", "Rotation3DOverLife")
                    .Set("angularVelocity", Euler(
                        ValueConverter.Curve(m.x),
                        ValueConverter.Curve(m.y),
                        ValueConverter.Curve(m.z)))
                    .Set("integration", "angles"));
                return;
            }
            // A billboard only turns in its own plane: about Z, whatever the separate axes say.
            // Radians/sec on both sides; only the direction differs (see SpinSign).
            behaviors.Add(new JObject()
                .Set("type", "RotationOverLife")
                .Set("angularVelocity", ScaleCurve(m.z, SpinSign(renderMode))));
        }

        /// <summary>
        /// The material's tint as the system's materialColor and materialColorScale, each written
        /// only when it changes something. The tint multiplies every particle (or the whole trail),
        /// in linear space in a Linear project, so it is not folded into the particles' colours,
        /// where babylon.quarks would turn it linear with them.
        /// </summary>
        internal static void AddMaterialColor(JObject system, ParticleMaterial material)
        {
            Color c = material.Tint;
            if (c.r != 1f || c.g != 1f || c.b != 1f || c.a != 1f)
            {
                system.Set("materialColor", new JArray().Add(c.r).Add(c.g).Add(c.b).Add(c.a));
            }
            if (material.TintScale != 1f) system.Set("materialColorScale", material.TintScale);
        }

        /// <summary>
        /// Unity turns a mesh particle's 2D rotation (start rotation and Rotation over Lifetime without
        /// separate axes) about its axisOfRotation, which the Shape module picks from where it sends the
        /// particle when it emits from the module, and which is Z when it does not (see EmitsFromShape):
        /// quarks' rotationAxis 'emission' and its default 'z'. A particle that rotates in 3D (see
        /// RotatesIn3D) is laid by its three Euler angles instead, its 2D start rotation the Z angle,
        /// so it keeps the default.
        /// </summary>
        private static void AddRotationAxis(ParticleSystem ps, JObject obj)
        {
            if (!RotatesIn3D(ps) && EmitsFromShape(ps.shape)) obj.Set("rotationAxis", "emission");
        }

        /// <summary>
        /// Whether Unity rotates a mesh particle in 3D: its start rotation is 3D, or Rotation over
        /// Lifetime or Rotation by Speed is on with Separate Axes, whatever their X and Y rates. Unity
        /// then lays the mesh by its rotation3D Euler angles, a 2D start rotation being the Z angle,
        /// and leaves axisOfRotation unused; a module with Separate Axes that is off changes nothing
        /// (measured in Unity 6).
        /// </summary>
        private static bool RotatesIn3D(ParticleSystem ps) =>
            ps.main.startRotation3D
            || (ps.rotationOverLifetime.enabled && ps.rotationOverLifetime.separateAxes)
            || (ps.rotationBySpeed.enabled && ps.rotationBySpeed.separateAxes);

        /// <summary>
        /// Unity's Render Alignment of a mesh particle or a billboard as babylon.quarks'
        /// renderAlignment. World and Local keep their names: a mesh is laid along those axes, and a
        /// billboard's quad lies in their XY plane instead of facing the camera. View is written for
        /// a mesh, whose quarks default is its simulation axes, and left out for a billboard, which
        /// faces the camera by default. Facing, which turns each particle toward the camera's
        /// position, is approximated by View, toward the camera's plane. Velocity has no counterpart
        /// and is left out, so meshes keep the system's simulation axes and billboards face the
        /// camera.
        /// </summary>
        private static void AddRenderAlignment(ParticleSystem ps, ParticleSystemRenderer renderer, int renderMode, JObject obj)
        {
            bool mesh = renderMode == 2;
            switch (renderer.alignment)
            {
                case ParticleSystemRenderSpace.View:
                    if (mesh) obj.Set("renderAlignment", "view");
                    break;
                case ParticleSystemRenderSpace.World:
                    obj.Set("renderAlignment", "world");
                    break;
                case ParticleSystemRenderSpace.Local:
                    obj.Set("renderAlignment", "local");
                    break;
                case ParticleSystemRenderSpace.Facing:
                    if (mesh) obj.Set("renderAlignment", "view");
                    Debug.LogWarning($"[Quarks Exporter] '{ps.name}': Render Alignment Facing is exported as View (facing the camera's plane, not its position).");
                    break;
                case ParticleSystemRenderSpace.Velocity:
                    Debug.LogWarning(mesh
                        ? $"[Quarks Exporter] '{ps.name}': Render Alignment Velocity has no quarks counterpart; the meshes keep the simulation space's axes."
                        : $"[Quarks Exporter] '{ps.name}': Render Alignment Velocity has no quarks counterpart; the billboards face the camera.");
                    break;
            }
        }

        /// <summary>
        /// Unity's Stop Action: Disable and Destroy under the same names. None is the runtime's
        /// default, and Callback is its <c>finished</c> event, which fires whatever the action.
        /// </summary>
        private static void AddStopAction(ParticleSystem.MainModule main, JObject obj)
        {
            switch (main.stopAction)
            {
                case ParticleSystemStopAction.Disable:
                    obj.Set("stopAction", "disable");
                    break;
                case ParticleSystemStopAction.Destroy:
                    obj.Set("stopAction", "destroy");
                    break;
            }
        }

        /// <summary>
        /// Unity's Ring Buffer Mode and Loop Range, under the same names; Disabled, the default
        /// in both, is left out, and so is the whole-life range.
        /// </summary>
        private static void AddRingBuffer(ParticleSystem ps, ParticleSystem.MainModule main, JObject obj, bool trailOnly)
        {
            if (main.ringBufferMode == ParticleSystemRingBufferMode.Disabled) return;
            if (trailOnly)
            {
                // Trail particles always die at the end of their life in babylon.quarks.
                Debug.LogWarning($"[Quarks Exporter] '{ps.name}': Ring Buffer Mode has no effect on a trail system and is skipped.");
                return;
            }
            obj.Set("ringBufferMode", main.ringBufferMode == ParticleSystemRingBufferMode.PauseUntilReplaced
                ? "pauseUntilReplaced"
                : "loopUntilReplaced");
            var range = main.ringBufferLoopRange;
            if (main.ringBufferMode == ParticleSystemRingBufferMode.LoopUntilReplaced && (range.x != 0f || range.y != 1f))
            {
                obj.Set("ringBufferLoopRange", new JArray().Add(range.x).Add(range.y));
            }
        }

        /// <summary>
        /// Unity's Scaling Mode, which babylon.quarks has under the same names; Local, the default
        /// in both, is left out.
        /// </summary>
        private static void AddScalingMode(ParticleSystem ps, ParticleSystem.MainModule main, JObject obj)
        {
            switch (main.scalingMode)
            {
                case ParticleSystemScalingMode.Hierarchy:
                    obj.Set("scalingMode", "hierarchy");
                    break;
                case ParticleSystemScalingMode.Shape:
                    obj.Set("scalingMode", "shape");
                    break;
            }
        }

        private static void AddVelocityOverLife(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.velocityOverLifetime;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "VelocityOverLife")
                .Set("linearX", ValueConverter.Curve(m.x))
                .Set("linearY", ValueConverter.Curve(m.y))
                .Set("linearZ", ValueConverter.Curve(m.z))
                .Set("orbitalX", ValueConverter.Curve(m.orbitalX))
                .Set("orbitalY", ValueConverter.Curve(m.orbitalY))
                .Set("orbitalZ", ValueConverter.Curve(m.orbitalZ))
                .Set("space", m.space == ParticleSystemSimulationSpace.World ? "world" : "local")
                .Set("radial", ValueConverter.Curve(m.radial))
                .Set("orbitalOffset", new JArray().Add(ConstantOf(m.orbitalOffsetX)).Add(ConstantOf(m.orbitalOffsetY)).Add(ConstantOf(m.orbitalOffsetZ))));
        }

        private static void AddLimitVelocity(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.limitVelocityOverLifetime;
            if (!m.enabled) return;
            // With separate axes each axis has its own limit, measured along the axes of the
            // module's space; Unity throws on `.limit` in that mode.
            var limit = new JObject()
                .Set("type", "LimitSpeedOverLife")
                .Set("speed", m.separateAxes ? PerAxis(m.limitX, m.limitY, m.limitZ) : ValueConverter.Curve(m.limit))
                .Set("dampen", m.dampen);
            if (m.separateAxes && m.space == ParticleSystemSimulationSpace.World) limit.Set("space", "world");
            behaviors.Add(limit);
        }

        /// <summary>A per-axis <c>Vector3Function</c> of three Unity curves.</summary>
        private static JObject PerAxis(ParticleSystem.MinMaxCurve x, ParticleSystem.MinMaxCurve y, ParticleSystem.MinMaxCurve z)
        {
            return new JObject()
                .Set("type", "Vector3Function")
                .Set("x", ValueConverter.Curve(x))
                .Set("y", ValueConverter.Curve(y))
                .Set("z", ValueConverter.Curve(z));
        }

        private static void AddForceOverLife(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.forceOverLifetime;
            if (!m.enabled) return;
            var force = new JObject()
                .Set("type", "ForceOverLife")
                .Set("x", ValueConverter.Curve(m.x))
                .Set("y", ValueConverter.Curve(m.y))
                .Set("z", ValueConverter.Curve(m.z));
            // Unity's force is in the emitter's axes unless the module says World (Local is its
            // default); quarks' is in world axes unless told otherwise. Without this, an effect on
            // a turned emitter is pushed the wrong way.
            if (m.space != ParticleSystemSimulationSpace.World) force.Set("space", "local");
            // Randomize: a random force picks a new value every frame instead of once per particle.
            if (m.randomized) force.Set("randomized", true);
            behaviors.Add(force);
        }

        private static void AddNoise(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.noise;
            if (!m.enabled) return;
            var noise = new JObject()
                .Set("type", "Noise")
                .Set("frequency", ValueConverter.Constant(m.frequency))
                .Set("power", ValueConverter.Curve(m.strength))
                .Set("positionAmount", ValueConverter.Constant(1))
                .Set("rotationAmount", ValueConverter.Constant(0))
                // The runtime samples the scroll speed once per frame, so only its constant travels.
                .Set("scrollSpeed", ValueConverter.Constant(ConstantOf(m.scrollSpeed)));
            if (m.remapEnabled)
            {
                // Unity reads the remap curve at the raw noise mapped from [-1, 1] to [0, 1]; so does the runtime.
                noise.Set("remap", ValueConverter.Curve(m.remap));
            }
            behaviors.Add(noise);
        }

        /// <summary>
        /// Inherit Velocity → <c>InheritVelocity</c>, where Unity applies it: in World space, and in
        /// Custom space for the Initial mode. A Local system inherits nothing in either mode, and a
        /// Custom one nothing in Current mode (measured in Unity 6 on a moving, turned node), so the
        /// module is left out there; babylon.quarks would otherwise add the emitter's velocity to
        /// particles that already move with it.
        /// </summary>
        private static void AddInheritVelocity(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.inheritVelocity;
            if (!m.enabled) return;
            var space = ps.main.simulationSpace;
            if (space == ParticleSystemSimulationSpace.Local) return;
            if (space == ParticleSystemSimulationSpace.Custom && m.mode == ParticleSystemInheritVelocityMode.Current) return;
            behaviors.Add(new JObject()
                .Set("type", "InheritVelocity")
                .Set("multiplier", ValueConverter.Curve(m.curve))
                .Set("mode", m.mode == ParticleSystemInheritVelocityMode.Current ? "current" : "initial"));
        }

        private static void AddRandomizeDirection(ParticleSystem ps, JArray behaviors)
        {
            var shape = ps.shape;
            if (!EmitsFromShape(shape) || shape.randomDirectionAmount <= 0f) return;
            // Unity leaves a Cone emitting from its base as it is, whatever the amount; only the
            // Cone Volume and the other shapes take it.
            if (shape.shapeType == ParticleSystemShapeType.Cone || shape.shapeType == ParticleSystemShapeType.ConeShell) return;
            // The same 0..1 blend toward a random direction as Unity's.
            behaviors.Add(new JObject()
                .Set("type", "RandomizeDirection")
                .Set("amount", Mathf.Clamp01(shape.randomDirectionAmount)));
        }

        private static void AddColorBySpeed(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.colorBySpeed;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "ColorBySpeed")
                .Set("color", ValueConverter.StartColorGradient(m.color))
                .Set("speedRange", SpeedRange(m.range)));
        }

        private static void AddSizeBySpeed(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.sizeBySpeed;
            if (!m.enabled) return;
            // Separate axes become a per-axis Vector3Function, as in Size over Lifetime.
            JToken size = m.separateAxes ? PerAxis(m.x, m.y, m.z) : ValueConverter.Curve(m.size);
            behaviors.Add(new JObject()
                .Set("type", "SizeBySpeed")
                .Set("size", size)
                .Set("speedRange", SpeedRange(m.range)));
        }

        private static void AddRotationBySpeed(ParticleSystem ps, JArray behaviors, int renderMode)
        {
            var m = ps.rotationBySpeed;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "RotationBySpeed")
                .Set("angularVelocity", ScaleCurve(m.z, SpinSign(renderMode)))
                .Set("speedRange", SpeedRange(m.range)));
        }

        private static void AddCollision(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.collision;
            if (!m.enabled) return;
            var collision = new JObject()
                .Set("type", "ApplyCollision")
                .Set("bounce", ConstantOf(m.bounce));
            if (m.type == ParticleSystemCollisionType.Planes)
            {
                // The planes go into the emitter's local space, so they follow it as Unity's
                // plane Transforms follow the effect they belong to. A normal takes the inverse
                // transpose, which for the emitter's own scale is a multiply by it.
                var planes = new JArray();
                Transform emitter = ps.transform;
                for (int i = 0; i < m.planeCount; i++)
                {
                    Transform plane = m.GetPlane(i);
                    if (plane == null) continue;
                    Vector3 position = emitter.InverseTransformPoint(plane.position);
                    Vector3 normal = Vector3.Scale(emitter.InverseTransformDirection(plane.up), emitter.lossyScale);
                    planes.Add(new JObject()
                        .Set("position", new JArray().Add(position.x).Add(position.y).Add(position.z))
                        .Set("normal", new JArray().Add(normal.x).Add(normal.y).Add(normal.z)));
                }
                // Planes mode without a plane collides with nothing; quarks would ask the host's world.
                if (planes.Items.Count == 0) return;
                collision.Set("planes", planes);
                if (m.radiusScale != 1f) collision.Set("radiusScale", m.radiusScale);
            }
            // World collisions bounce off the host's colliders, through the PhysicsResolver it registers.
            float dampen = ConstantOf(m.dampen);
            if (dampen != 0f) collision.Set("dampen", dampen);
            float lifetimeLoss = ConstantOf(m.lifetimeLoss);
            if (lifetimeLoss != 0f) collision.Set("lifetimeLoss", lifetimeLoss);
            if (m.minKillSpeed > 0f || m.maxKillSpeed < 10000f)
                Debug.LogWarning($"[Quarks Exporter] '{ps.name}': collision Min / Max Kill Speed have no quarks counterpart and are skipped.");
            behaviors.Add(collision);
        }

        private static JToken SpeedRange(Vector2 range) => ValueConverter.Interval(range.x, range.y);

        private static void AddSubEmitters(ParticleSystem ps, ExportContext ctx, JArray behaviors)
        {
            var m = ps.subEmitters;
            if (!m.enabled) return;
            for (int i = 0; i < m.subEmittersCount; i++)
            {
                ParticleSystem sub = m.GetSubEmitterSystem(i);
                string uuid = ctx.GetNodeUuid(sub);
                if (sub == null || uuid == null) continue;
                var type = m.GetSubEmitterType(i);
                if (type != ParticleSystemSubEmitterType.Birth && type != ParticleSystemSubEmitterType.Death)
                {
                    // quarks has no collision, trigger or scripted emit event. Its only other mode
                    // starts the sub-system's whole emission again on every frame, which buried
                    // rain and waterfalls under thousands of particles, so leave these out.
                    Debug.LogWarning($"[Quarks Exporter] '{ps.name}': {type} sub-emitter '{sub.name}' has no quarks counterpart and is skipped.");
                    continue;
                }
                var behavior = new JObject()
                    .Set("type", "EmitSubParticleSystem")
                    .Set("subParticleSystem", uuid)
                    .Set("useVelocityAsBasis", false)
                    .Set("mode", type == ParticleSystemSubEmitterType.Birth ? SubEmitBirth : SubEmitDeath)
                    .Set("emitProbability", m.GetSubEmitterEmitProbability(i));
                var inherit = new JArray();
                var properties = m.GetSubEmitterProperties(i);
                if ((properties & ParticleSystemSubEmitterProperties.InheritColor) != 0) inherit.Add("color");
                if ((properties & ParticleSystemSubEmitterProperties.InheritSize) != 0) inherit.Add("size");
                if ((properties & ParticleSystemSubEmitterProperties.InheritRotation) != 0) inherit.Add("rotation");
                if ((properties & ParticleSystemSubEmitterProperties.InheritLifetime) != 0) inherit.Add("lifetime");
                if (inherit.Items.Count > 0) behavior.Set("inherit", inherit);
                behaviors.Add(behavior);
            }
        }

        // ---- helpers ---------------------------------------------------------------------

        // quarks SubParticleEmitMode: Death=0, Birth=1 (Frame=2 has no Unity counterpart).
        private const int SubEmitDeath = 0;
        private const int SubEmitBirth = 1;

        private static float ConstantOf(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return c.constant;
                case ParticleSystemCurveMode.TwoConstants: return (c.constantMin + c.constantMax) * 0.5f;
                case ParticleSystemCurveMode.Curve:
                case ParticleSystemCurveMode.TwoCurves:
                    // A curve has no single value, so take its mean over the normalized time range.
                    // (constantMax doubles as the curve multiplier — the curve's peak scale, not a
                    // typical value.)
                    const int samples = 16;
                    float sum = 0f;
                    for (int i = 0; i <= samples; i++)
                    {
                        float t = i / (float)samples;
                        sum += c.mode == ParticleSystemCurveMode.TwoCurves
                            ? (c.Evaluate(t, 0f) + c.Evaluate(t, 1f)) * 0.5f
                            : c.Evaluate(t);
                    }
                    return sum / (samples + 1);
                default: return c.constant;
            }
        }

        private static JToken ScaleCurve(ParticleSystem.MinMaxCurve c, float scale)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return ValueConverter.Constant(c.constant * scale);
                case ParticleSystemCurveMode.TwoConstants: return ValueConverter.Interval(c.constantMin * scale, c.constantMax * scale);
                case ParticleSystemCurveMode.Curve: return ValueConverter.Bezier(c.curve, c.curveMultiplier * scale);
                case ParticleSystemCurveMode.TwoCurves:
                    return ValueConverter.TwoCurves(c.curveMin, c.curveMax, c.curveMultiplier * scale);
                default: return ValueConverter.Constant(c.constant * scale);
            }
        }

        private static JToken Vec3(float x, float y, float z) => new JArray().Add(x).Add(y).Add(z);
    }
}
