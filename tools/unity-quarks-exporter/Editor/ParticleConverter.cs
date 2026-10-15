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
            var main = ps.main;
            var behaviors = new JArray();

            // Unity draws trails in a pass of their own beside the particles, but a quarks system has
            // one render mode. A system that draws only its trails (Render Mode None) becomes a quarks
            // trail system; one that draws both keeps its particles and loses the trails.
            bool trailOnly = IsTrailOnly(ps, renderer);
            WarnAboutTrails(ps, renderer, trailOnly);

            string materialUuid = ctx.AddMaterialForRenderer(renderer, trailOnly);
            int renderMode = trailOnly ? RenderModeTrail : MapRenderMode(renderer.renderMode);
            string geometryUuid = renderMode == 2 && renderer.mesh != null ? ctx.AddGeometryForMesh(renderer.mesh) : null;
            JToken emissionOverTime = EmissionRate(ps, true);
            JToken startLife = AvoidKnifeEdgeLifetime(main.startLifetime, ps.emission);

            var obj = new JObject()
                .Set("version", "3.0")
                .Set("autoDestroy", false)
                .Set("looping", main.loop)
                .Set("prewarm", main.prewarm)
                .Set("duration", main.duration)
                .Set("startDelay", ValueConverter.Curve(main.startDelay))
                .Set("shape", BuildShape(ps.shape, ctx))
                .Set("startLife", startLife)
                .Set("startSpeed", ValueConverter.Curve(main.startSpeed))
                .Set("startRotation", BuildStartRotation(main, renderMode))
                .Set("startSize", trailOnly ? BuildTrailWidth(ps) : BuildStartSize(main))
                .Set("startColor", trailOnly && !ps.trails.inheritParticleColor
                    ? ValueConverter.ConstantColor(UnityEngine.Color.white)
                    : ValueConverter.StartColor(main.startColor))
                .Set("emissionOverTime", emissionOverTime)
                .Set("emissionOverDistance", EmissionRate(ps, false))
                .Set("emissionBursts", BuildBursts(ps))
                .Set("onlyUsedByOther", ctx.IsSubTarget(ps))
                .Set("renderMode", renderMode)
                .Set("renderOrder", renderer.sortingOrder)
                .Set("rendererEmitterSettings", trailOnly ? BuildTrailSettings(ps) : BuildRendererSettings(renderer, renderMode))
                .Set("material", materialUuid)
                .Set("layers", 1);

            if (geometryUuid != null)
            {
                obj.Set("instancingGeometry", geometryUuid);
            }
            if (!trailOnly) AddPivotAndFlip(ps, renderer, renderMode, obj);

            BuildTextureSheet(ps, obj, behaviors, trailOnly);

            obj.Set("blending", ctx.LastBlendMode)
                .Set("transparent", true)
                .Set("worldSpace", main.simulationSpace != ParticleSystemSimulationSpace.Local);

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
            if (mesh)
            {
                // A scalar rotation on a mesh spins around Z in Unity; a plain quarks scalar would
                // spin around Y, so wrap it as a Z-only Euler to keep the axis correct.
                return Euler(ValueConverter.Constant(0), ValueConverter.Constant(0), ValueConverter.Curve(main.startRotation));
            }
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
            behaviors.Add(new JObject()
                .Set("type", "ForceOverLife")
                .Set("x", ValueConverter.Constant(0f))
                .Set("y", ValueConverter.Constant(-9.81f * g))
                .Set("z", ValueConverter.Constant(0f)));
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

        private static JToken BuildShape(ParticleSystem.ShapeModule shape, ExportContext ctx)
        {
            if (!shape.enabled) return new JObject().Set("type", "point");
            return AddShapeTransform(BuildShapeType(shape, ctx), shape);
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

        private static JObject BuildShapeType(ParticleSystem.ShapeModule shape, ExportContext ctx)
        {
            float arc = shape.arc * Mathf.Deg2Rad;
            float thickness = shape.radiusThickness;
            switch (shape.shapeType)
            {
                case ParticleSystemShapeType.Cone:
                case ParticleSystemShapeType.ConeVolume:
                    return ShapeBase("cone", shape.radius, arc, thickness).Set("angle", shape.angle * Mathf.Deg2Rad);
                case ParticleSystemShapeType.Sphere:
                    return ShapeBase("sphere", shape.radius, arc, thickness);
                case ParticleSystemShapeType.Hemisphere:
                    return ShapeBase("hemisphere", shape.radius, arc, thickness);
                case ParticleSystemShapeType.Circle:
                    return ShapeBase("circle", shape.radius, arc, thickness);
                case ParticleSystemShapeType.Donut:
                    return ShapeBase("donut", shape.radius, arc, thickness).Set("donutRadius", shape.donutRadius);
                case ParticleSystemShapeType.Mesh:
                    if (shape.mesh != null)
                    {
                        string meshNodeUuid = ctx.AddMeshSourceNode(shape.mesh);
                        return new JObject().Set("type", "mesh_surface").Set("mesh", meshNodeUuid);
                    }
                    return new JObject().Set("type", "point");
                default:
                    // Box/Edge and other volumes have no direct quarks equivalent yet.
                    return new JObject().Set("type", "point");
            }
        }

        private static JObject ShapeBase(string type, float radius, float arc, float thickness)
        {
            return new JObject()
                .Set("type", type)
                .Set("radius", radius)
                // Unity radiusThickness maps 1:1 to quarks thickness (0 = surface shell, 1 = full volume).
                .Set("thickness", Mathf.Clamp01(thickness))
                .Set("arc", arc)
                .Set("mode", 0)
                .Set("spread", 0)
                .Set("speed", ValueConverter.Constant(0));
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

        private static bool IsTrailOnly(ParticleSystem ps, ParticleSystemRenderer renderer)
        {
            var trails = ps.trails;
            return renderer.renderMode == ParticleSystemRenderMode.None
                && trails.enabled
                && trails.mode == ParticleSystemTrailMode.PerParticle;
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
            var curve = width.mode == ParticleSystemCurveMode.TwoCurves ? width.curveMax : width.curve;
            behaviors.Add(new JObject()
                .Set("type", "WidthOverLength")
                .Set("width", ValueConverter.Bezier(curve, width.curveMultiplier * sizeScale)));
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
                float frameScale = tiles - 0.001f;
                var frameOverTime = tsa.frameOverTime;
                int cycles = Mathf.Max(1, tsa.cycleCount);
                bool curved = frameOverTime.mode == ParticleSystemCurveMode.Curve
                    || frameOverTime.mode == ParticleSystemCurveMode.TwoCurves;
                // Cycles replay the curve that many times over the particle's life; a constant or
                // random frame is the same in every cycle.
                JToken frame = curved && cycles > 1
                    ? ValueConverter.Bezier(
                        frameOverTime.mode == ParticleSystemCurveMode.TwoCurves ? frameOverTime.curveMax : frameOverTime.curve,
                        frameOverTime.curveMultiplier * frameScale,
                        cycles)
                    : ScaleCurve(frameOverTime, frameScale);
                behaviors.Add(new JObject()
                    .Set("type", "FrameOverLife")
                    .Set("frame", frame));
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
            JToken size = m.separateAxes
                ? new JObject()
                    .Set("type", "Vector3Function")
                    .Set("x", ValueConverter.Curve(m.x))
                    .Set("y", ValueConverter.Curve(m.y))
                    .Set("z", ValueConverter.Curve(m.z))
                : ValueConverter.Curve(m.size);
            behaviors.Add(new JObject().Set("type", "SizeOverLife").Set("size", size));
        }

        private static void AddRotationOverLife(ParticleSystem ps, JArray behaviors, int renderMode)
        {
            var m = ps.rotationOverLifetime;
            if (!m.enabled) return;
            // Radians/sec on both sides; only the direction differs (see SpinSign).
            behaviors.Add(new JObject()
                .Set("type", "RotationOverLife")
                .Set("angularVelocity", ScaleCurve(m.z, SpinSign(renderMode))));
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
                .Set("space", m.space == ParticleSystemSimulationSpace.World ? "world" : "local"));
        }

        private static void AddLimitVelocity(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.limitVelocityOverLifetime;
            if (!m.enabled) return;
            // With separate axes Unity throws on `.limit`; use the X-axis limit as representative.
            var curve = m.separateAxes ? m.limitX : m.limit;
            behaviors.Add(new JObject()
                .Set("type", "LimitSpeedOverLife")
                .Set("speed", ValueConverter.Curve(curve))
                .Set("dampen", m.dampen));
        }

        private static void AddForceOverLife(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.forceOverLifetime;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "ForceOverLife")
                .Set("x", ValueConverter.Curve(m.x))
                .Set("y", ValueConverter.Curve(m.y))
                .Set("z", ValueConverter.Curve(m.z)));
        }

        private static void AddNoise(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.noise;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "Noise")
                .Set("frequency", ValueConverter.Constant(m.frequency))
                .Set("power", ValueConverter.Curve(m.strength))
                .Set("positionAmount", ValueConverter.Constant(1))
                .Set("rotationAmount", ValueConverter.Constant(0)));
        }

        private static void AddInheritVelocity(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.inheritVelocity;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "InheritVelocity")
                .Set("multiplier", ValueConverter.Curve(m.curve))
                .Set("mode", m.mode == ParticleSystemInheritVelocityMode.Current ? "current" : "initial"));
        }

        private static void AddRandomizeDirection(ParticleSystem ps, JArray behaviors)
        {
            var shape = ps.shape;
            if (!shape.enabled || shape.randomDirectionAmount <= 0f) return;
            // Unity's randomDirectionAmount is a 0..1 blend; map to a 0..π scatter angle.
            behaviors.Add(new JObject()
                .Set("type", "ChangeEmitDirection")
                .Set("angle", ValueConverter.Constant(shape.randomDirectionAmount * Mathf.PI)));
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
            var curve = m.separateAxes ? m.x : m.size;
            behaviors.Add(new JObject()
                .Set("type", "SizeBySpeed")
                .Set("size", ValueConverter.Curve(curve))
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
            // quarks ApplyCollision resolves against a host-provided collider; only `bounce` is
            // portable (the plane/world colliders themselves aren't part of the effect JSON).
            behaviors.Add(new JObject()
                .Set("type", "ApplyCollision")
                .Set("bounce", ConstantOf(m.bounce)));
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
                behaviors.Add(new JObject()
                    .Set("type", "EmitSubParticleSystem")
                    .Set("subParticleSystem", uuid)
                    .Set("useVelocityAsBasis", false)
                    .Set("mode", type == ParticleSystemSubEmitterType.Birth ? SubEmitBirth : SubEmitDeath)
                    .Set("emitProbability", m.GetSubEmitterEmitProbability(i)));
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
                case ParticleSystemCurveMode.TwoCurves: return ValueConverter.Bezier(c.curveMax, c.curveMultiplier * scale);
                default: return ValueConverter.Constant(c.constant * scale);
            }
        }

        private static JToken Vec3(float x, float y, float z) => new JArray().Add(x).Add(y).Add(z);
    }
}
