using UnityEditor;
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

            // What Unity draws for this system: its particles, their trails, both or nothing.
            bool drawsParticles = renderer.enabled && renderer.renderMode != ParticleSystemRenderMode.None;
            bool drawsTrails = renderer.enabled && ps.trails.enabled && renderer.trailMaterial != null;
            // Particles that are not drawn but leave trails are drawn as quarks trails instead;
            // quarks draws a system one way, so where Unity draws both, the trails are left out.
            bool trailsInstead = !drawsParticles && drawsTrails;
            if (drawsParticles && drawsTrails)
            {
                Debug.LogWarning($"[Quarks Exporter] '{ps.name}' draws both particles and trails; quarks draws a system one way, so its trails are not exported.");
            }

            string materialUuid = trailsInstead ? ctx.AddMaterial(renderer.trailMaterial) : ctx.AddMaterialForRenderer(renderer);
            int renderMode = trailsInstead ? 3 : MapRenderMode(renderer.renderMode);
            string geometryUuid = renderMode == 2 && renderer.mesh != null ? ctx.AddGeometryForMesh(renderer.mesh) : null;
            JToken emissionOverTime = EmissionRate(ps, true);
            JToken startLife = AvoidKnifeEdgeLifetime(main.startLifetime, ps.emission);
            // Drawn as trails, the particle's colour and size are the trail's: fold in what the
            // Trails module adds to them.
            TrailLook trailLook = trailsInstead ? ReadTrailLook(ps) : TrailLook.None;

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
                .Set("startSize", trailLook.Width.HasValue ? BuildTrailWidth(main, ps.trails, trailLook.Width.Value) : BuildStartSize(main))
                .Set("startColor", ValueConverter.StartColor(trailsInstead ? TrailColor(main.startColor, ps.trails, trailLook.Tint) : main.startColor))
                .Set("emissionOverTime", emissionOverTime)
                .Set("emissionOverDistance", EmissionRate(ps, false))
                .Set("emissionBursts", BuildBursts(ps))
                .Set("onlyUsedByOther", ctx.IsSubTarget(ps))
                .Set("renderMode", renderMode)
                .Set("renderOrder", renderer.sortingOrder)
                .Set("rendererEmitterSettings", trailsInstead ? BuildTrailSettings(ps) : BuildRendererSettings(renderer, renderMode))
                .Set("material", materialUuid)
                // A system Unity draws nothing for still simulates — it may feed sub-emitters —
                // but is on no layer, so no camera renders it.
                .Set("layers", drawsParticles || drawsTrails ? 1 : 0);

            if (geometryUuid != null)
            {
                obj.Set("instancingGeometry", geometryUuid);
            }

            JObject shapeTransform = BuildShapeTransform(ps.shape);
            if (shapeTransform != null)
            {
                obj.Set("shapeTransform", shapeTransform);
            }

            BuildTextureSheet(ps, obj, behaviors);

            // On the *ps* object `blending` is Babylon's numbering — ParticleSystem.toJSON writes
            // materialBlendMode here and fromJSON reads it back as an alpha mode. That is the
            // opposite convention to the *material* object's `blending`, which is three.js's;
            // ExportContext converts there. Keep the two apart.
            obj.Set("blending", ctx.LastBlendMode)
                .Set("transparent", true)
                .Set("worldSpace", main.simulationSpace != ParticleSystemSimulationSpace.Local);

            // ---- behaviors from the over-lifetime / by-speed modules ----
            AddGravity(main, behaviors);
            AddRandomizeDirection(ps, behaviors);
            // A trail that does not inherit the particle's colour, or its size, takes neither
            // from the particle's own modules either.
            bool colourFromParticle = !trailsInstead || ps.trails.inheritParticleColor;
            bool sizeFromParticle = !trailsInstead || ps.trails.sizeAffectsWidth;
            if (colourFromParticle) AddColorOverLife(ps, behaviors);
            if (sizeFromParticle) AddSizeOverLife(ps, behaviors);
            AddRotationOverLife(ps, behaviors);
            AddVelocityOverLife(ps, behaviors);
            AddInheritVelocity(ps, behaviors);
            AddLimitVelocity(ps, behaviors);
            AddForceOverLife(ps, behaviors);
            if (colourFromParticle) AddColorBySpeed(ps, behaviors);
            if (sizeFromParticle) AddSizeBySpeed(ps, behaviors);
            AddRotationBySpeed(ps, behaviors);
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
                return ValueConverter.Curve(main.startRotationZ);
            }
            if (mesh)
            {
                // A scalar rotation on a mesh spins around Z in Unity; a plain quarks scalar would
                // spin around Y, so wrap it as a Z-only Euler to keep the axis correct.
                return Euler(ValueConverter.Constant(0), ValueConverter.Constant(0), ValueConverter.Curve(main.startRotation));
            }
            return ValueConverter.Curve(main.startRotation);
        }

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
            float duration = ps.main.duration;
            foreach (var b in bursts)
            {
                float interval = Mathf.Max(0.001f, b.repeatInterval);
                // Unity's 0 cycles means "repeat until the loop ends": that many waves fit.
                int cycles = b.cycleCount > 0
                    ? b.cycleCount
                    : Mathf.Max(1, Mathf.CeilToInt((duration - b.time) / interval - 1e-4f));
                arr.Add(new JObject()
                    .Set("time", b.time)
                    .Set("count", ValueConverter.Curve(b.count))
                    .Set("probability", b.probability)
                    .Set("interval", interval)
                    .Set("cycle", cycles));
            }
            return arr;
        }

        // ---- Shape -----------------------------------------------------------------------

        private static JToken BuildShape(ParticleSystem.ShapeModule shape, ExportContext ctx)
        {
            // With the module off Unity emits from the system's origin straight along +Z — a cone
            // of no radius and no angle, not quarks' point, which sprays in every direction.
            if (!shape.enabled) return ShapeBase("cone", 0f, 2f * Mathf.PI, 1f).Set("angle", 0f);

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

        /// <summary>
        /// The Shape module's Position / Rotation / Scale, which move the shape inside its system
        /// (a cone turned to point up, a sphere stretched into a column). Null when they leave the
        /// shape where it is, and when the module is off — Unity ignores them then.
        /// </summary>
        private static JObject BuildShapeTransform(ParticleSystem.ShapeModule shape)
        {
            if (!shape.enabled) return null;
            Vector3 p = shape.position;
            Quaternion q = Quaternion.Euler(shape.rotation);
            Vector3 s = shape.scale;
            if (p == Vector3.zero && s == Vector3.one && Quaternion.Angle(q, Quaternion.identity) < 1e-3f) return null;
            return new JObject()
                .Set("position", new JArray().Add(p.x).Add(p.y).Add(p.z))
                .Set("rotation", new JArray().Add(q.x).Add(q.y).Add(q.z).Add(q.w))
                .Set("scale", new JArray().Add(s.x).Add(s.y).Add(s.z));
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
                var settings = new JObject()
                    .Set("speedFactor", renderer.velocityScale)
                    .Set("lengthFactor", renderer.lengthScale);
                // Freeform Stretching (Unity 2022.2+) centres the particle and scales it along its
                // travel instead of trailing it back from the particle. Read from the serialized
                // renderer, so older editors, which have no such setting, simply leave it out.
                SerializedProperty freeform = new SerializedObject(renderer).FindProperty("m_FreeformStretching");
                if (freeform != null && freeform.propertyType == SerializedPropertyType.Boolean && freeform.boolValue)
                {
                    settings.Set("freeform", true);
                }
                return settings;
            }
            if (renderMode == 2) // mesh
            {
                // Render Alignment: View (Unity's default for meshes) lays the mesh along the
                // camera's axes, so it turns with the view like a billboard; World along the
                // world's; Local along the emitter's, which is what quarks does without a setting.
                switch (renderer.alignment)
                {
                    case ParticleSystemRenderSpace.View:
                        return new JObject().Set("alignment", "view");
                    case ParticleSystemRenderSpace.World:
                        return new JObject().Set("alignment", "world");
                    case ParticleSystemRenderSpace.Local:
                        return new JObject();
                    default:
                        Debug.LogWarning($"[Quarks Exporter] '{renderer.name}': Render Alignment {renderer.alignment} has no quarks counterpart; exported as View.");
                        return new JObject().Set("alignment", "view");
                }
            }
            return new JObject();
        }

        /// <summary>What the Trails module multiplies into a trail's colour and width, as constants.</summary>
        private struct TrailLook
        {
            public static readonly TrailLook None = new TrailLook { Tint = Color.white };
            public Color Tint;
            public float? Width;
        }

        /// <summary>
        /// The Trails module's colour over lifetime and over the trail, and its width over the trail,
        /// where they are constants — what Hovl-style trails use. A gradient along the trail has no
        /// quarks counterpart yet: the console says so and the trail keeps the particle's colour.
        /// </summary>
        private static TrailLook ReadTrailLook(ParticleSystem ps)
        {
            var trails = ps.trails;
            var look = new TrailLook { Tint = Color.white };
            foreach (var part in new[] { ("colour over lifetime", trails.colorOverLifetime), ("colour over trail", trails.colorOverTrail) })
            {
                if (part.Item2.mode == ParticleSystemGradientMode.Color)
                {
                    look.Tint *= part.Item2.color;
                }
                else
                {
                    Debug.LogWarning($"[Quarks Exporter] '{ps.name}': the trail's {part.Item1} is a gradient, which is not exported; the trail keeps the particle's colour there.");
                }
            }
            var width = trails.widthOverTrail;
            switch (width.mode)
            {
                case ParticleSystemCurveMode.Constant:
                    look.Width = width.constant;
                    break;
                case ParticleSystemCurveMode.TwoConstants:
                    look.Width = (width.constantMin + width.constantMax) * 0.5f;
                    break;
                default:
                    look.Width = width.curveMultiplier;
                    Debug.LogWarning($"[Quarks Exporter] '{ps.name}': the trail's width over trail is a curve; exported as its multiplier, {width.curveMultiplier}.");
                    break;
            }
            return look;
        }

        /// <summary>The trail's colour: the particle's, times the Trails module's, or the module's alone.</summary>
        private static ParticleSystem.MinMaxGradient TrailColor(ParticleSystem.MinMaxGradient particle, ParticleSystem.TrailModule trails, Color tint)
        {
            return trails.inheritParticleColor ? Multiply(particle, tint) : new ParticleSystem.MinMaxGradient(tint);
        }

        /// <summary>The trail's width: the particle's size times the module's width, or the width alone.</summary>
        private static JToken BuildTrailWidth(ParticleSystem.MainModule main, ParticleSystem.TrailModule trails, float width)
        {
            if (!trails.sizeAffectsWidth) return ValueConverter.Constant(width);
            return ScaleCurve(main.startSize3D ? main.startSizeX : main.startSize, width);
        }

        private static ParticleSystem.MinMaxGradient Multiply(ParticleSystem.MinMaxGradient g, Color k)
        {
            switch (g.mode)
            {
                case ParticleSystemGradientMode.Color:
                    return new ParticleSystem.MinMaxGradient(g.color * k);
                case ParticleSystemGradientMode.TwoColors:
                    return new ParticleSystem.MinMaxGradient(g.colorMin * k, g.colorMax * k);
                case ParticleSystemGradientMode.TwoGradients:
                    return new ParticleSystem.MinMaxGradient(Multiply(g.gradientMin, k), Multiply(g.gradientMax, k));
                case ParticleSystemGradientMode.RandomColor:
                    var random = new ParticleSystem.MinMaxGradient(Multiply(g.gradient, k));
                    random.mode = ParticleSystemGradientMode.RandomColor;
                    return random;
                default:
                    return new ParticleSystem.MinMaxGradient(Multiply(g.gradient, k));
            }
        }

        private static Gradient Multiply(Gradient g, Color k)
        {
            var result = new Gradient { mode = g.mode };
            var colours = g.colorKeys;
            var alphas = g.alphaKeys;
            for (int i = 0; i < colours.Length; i++) colours[i].color *= k;
            for (int i = 0; i < alphas.Length; i++) alphas[i].alpha *= k.a;
            result.SetKeys(colours, alphas);
            return result;
        }

        /// <summary>
        /// Trail length for quarks, which keeps one point per 1/60 s step: Unity's trail lifetime
        /// is a fraction of the particle's.
        /// </summary>
        private static JObject BuildTrailSettings(ParticleSystem ps)
        {
            float lifetime = MaxOf(ps.main.startLifetime);
            float fraction = MaxOf(ps.trails.lifetime);
            int points = Mathf.Clamp(Mathf.RoundToInt(lifetime * fraction * 60f), 2, 256);
            return new JObject()
                .Set("startLength", ValueConverter.Constant(points))
                .Set("followLocalOrigin", false);
        }

        private static float MaxOf(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return c.constant;
                case ParticleSystemCurveMode.TwoConstants: return c.constantMax;
                default: return c.curveMultiplier;
            }
        }

        // ---- Texture Sheet Animation -----------------------------------------------------

        private static void BuildTextureSheet(ParticleSystem ps, JObject obj, JArray behaviors)
        {
            var tsa = ps.textureSheetAnimation;
            if (tsa.enabled)
            {
                int u = Mathf.Max(1, tsa.numTilesX);
                int v = Mathf.Max(1, tsa.numTilesY);
                int tiles = Mathf.Max(1, u * v);
                obj.Set("startTileIndex", ValueConverter.Curve(tsa.startFrame))
                    .Set("uTileCount", u)
                    .Set("vTileCount", v)
                    .Set("blendTiles", false);
                // Unity frameOverTime is authored in normalized tile space (0..1), so scale it to
                // the concrete tile indices used by quarks. This preserves constants, random
                // ranges and curves instead of flattening everything into a linear sweep.
                behaviors.Add(new JObject()
                    .Set("type", "FrameOverLife")
                    .Set("frame", ScaleCurve(tsa.frameOverTime, tiles - 1)));
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
            // quarks SizeOverLife is uniform; with separate axes Unity throws on `.size`, so use X.
            var curve = m.separateAxes ? m.x : m.size;
            behaviors.Add(new JObject().Set("type", "SizeOverLife").Set("size", ValueConverter.Curve(curve)));
        }

        private static void AddRotationOverLife(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.rotationOverLifetime;
            if (!m.enabled) return;
            // Unity rotation-over-lifetime is in degrees/sec; quarks angularVelocity is radians/sec.
            behaviors.Add(new JObject()
                .Set("type", "RotationOverLife")
                .Set("angularVelocity", ScaleCurve(m.z, Mathf.Deg2Rad)));
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

        private static void AddRotationBySpeed(ParticleSystem ps, JArray behaviors)
        {
            var m = ps.rotationBySpeed;
            if (!m.enabled) return;
            behaviors.Add(new JObject()
                .Set("type", "RotationBySpeed")
                .Set("angularVelocity", ScaleCurve(m.z, Mathf.Deg2Rad))
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
                behaviors.Add(new JObject()
                    .Set("type", "EmitSubParticleSystem")
                    .Set("subParticleSystem", uuid)
                    .Set("useVelocityAsBasis", false)
                    .Set("mode", MapSubEmitMode(m.GetSubEmitterType(i)))
                    .Set("emitProbability", m.GetSubEmitterEmitProbability(i)));
            }
        }

        // ---- helpers ---------------------------------------------------------------------

        private static int MapSubEmitMode(ParticleSystemSubEmitterType type)
        {
            // quarks SubParticleEmitMode: Death=0, Birth=1, Frame=2
            switch (type)
            {
                case ParticleSystemSubEmitterType.Birth: return 1;
                case ParticleSystemSubEmitterType.Death: return 0;
                default: return 2;
            }
        }

        private static float ConstantOf(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return c.constant;
                case ParticleSystemCurveMode.TwoConstants: return (c.constantMin + c.constantMax) * 0.5f;
                default: return c.constantMax != 0 ? c.constantMax : c.constant;
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
