using System.Collections.Generic;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Forensic dump of a Unity Shuriken ParticleSystem — every module and curve mode
    /// the exporter might care about. Used by <see cref="EffectParityAudit"/>.
    /// </summary>
    public static class UnityEffectProbe
    {
        /// <summary>Full Unity-side snapshot for one particle system.</summary>
        public static JObject Probe(ParticleSystem ps, ParticleSystemRenderer renderer, Transform root = null)
        {
            var main = ps.main;
            var shape = ps.shape;
            var e = ps.emission;
            var tsa = ps.textureSheetAnimation;
            Transform t = ps.transform;

            return new JObject()
                .Set("name", ps.name)
                .Set("path", HierarchyPath(t, root))
                .Set("transform", new JObject()
                    .Set("localPosition", Vec3(t.localPosition))
                    .Set("localRotationEuler", Vec3(t.localEulerAngles))
                    .Set("localScale", Vec3(t.localScale))
                    .Set("activeInHierarchy", ps.gameObject.activeInHierarchy))
                .Set("main", ProbeMain(main))
                .Set("emission", ProbeEmission(e))
                .Set("shape", ProbeShape(shape))
                .Set("velocityOverLifetime", ProbeVelocity(ps.velocityOverLifetime))
                .Set("limitVelocityOverLifetime", ProbeLimitVelocity(ps.limitVelocityOverLifetime))
                .Set("inheritVelocity", ProbeInheritVelocity(ps.inheritVelocity))
                .Set("forceOverLifetime", ProbeForce(ps.forceOverLifetime))
                .Set("colorOverLifetime", ProbeColorOverLife(ps.colorOverLifetime))
                .Set("sizeOverLifetime", ProbeSizeOverLife(ps.sizeOverLifetime))
                .Set("rotationOverLifetime", ProbeRotationOverLife(ps.rotationOverLifetime))
                .Set("colorBySpeed", ProbeColorBySpeed(ps.colorBySpeed))
                .Set("sizeBySpeed", ProbeSizeBySpeed(ps.sizeBySpeed))
                .Set("rotationBySpeed", ProbeRotationBySpeed(ps.rotationBySpeed))
                .Set("noise", ProbeNoise(ps.noise))
                .Set("collision", ProbeCollision(ps.collision))
                .Set("textureSheetAnimation", ProbeTsa(tsa))
                .Set("trails", ProbeTrails(ps.trails))
                .Set("subEmitters", ProbeSubEmitters(ps.subEmitters))
                .Set("renderer", ProbeRenderer(renderer))
                .Set("material", ProbeMaterial(renderer != null ? renderer.sharedMaterial : null))
                .Set("flags", new JObject()
                    .Set("lights", ps.lights.enabled)
                    .Set("customData", ps.customData.enabled)
                    .Set("externalForces", ps.externalForces.enabled)
                    .Set("triggers", ps.trigger.enabled));
        }

        private static JObject ProbeMain(ParticleSystem.MainModule m) =>
            new JObject()
                .Set("duration", m.duration)
                .Set("looping", m.loop)
                .Set("prewarm", m.prewarm)
                .Set("simulationSpace", m.simulationSpace.ToString())
                .Set("simulationSpeed", m.simulationSpeed)
                .Set("maxParticles", m.maxParticles)
                .Set("startDelay", ProbeCurve(m.startDelay))
                .Set("startLifetime", ProbeCurve(m.startLifetime))
                .Set("startSpeed", ProbeCurve(m.startSpeed))
                .Set("startSize3D", m.startSize3D)
                .Set("startSize", m.startSize3D
                    ? new JObject()
                        .Set("x", ProbeCurve(m.startSizeX))
                        .Set("y", ProbeCurve(m.startSizeY))
                        .Set("z", ProbeCurve(m.startSizeZ))
                    : ProbeCurve(m.startSize))
                .Set("startRotation3D", m.startRotation3D)
                .Set("startRotation", m.startRotation3D
                    ? new JObject()
                        .Set("x", ProbeCurve(m.startRotationX))
                        .Set("y", ProbeCurve(m.startRotationY))
                        .Set("z", ProbeCurve(m.startRotationZ))
                    : ProbeCurve(m.startRotation))
                .Set("startColor", ProbeGradient(m.startColor))
                .Set("gravityModifier", ProbeCurve(m.gravityModifier))
                .Set("scalingMode", m.scalingMode.ToString());

        private static JObject ProbeEmission(ParticleSystem.EmissionModule e)
        {
            if (!e.enabled) return new JObject().Set("enabled", false);
            var bursts = new JArray();
            if (e.burstCount > 0)
            {
                var raw = new ParticleSystem.Burst[e.burstCount];
                e.GetBursts(raw);
                foreach (var b in raw)
                {
                    bursts.Add(new JObject()
                        .Set("time", b.time)
                        .Set("count", ProbeCurve(b.count))
                        .Set("cycleCount", b.cycleCount)
                        .Set("repeatInterval", b.repeatInterval)
                        .Set("probability", b.probability));
                }
            }
            return new JObject()
                .Set("enabled", true)
                .Set("rateOverTime", ProbeCurve(e.rateOverTime))
                .Set("rateOverDistance", ProbeCurve(e.rateOverDistance))
                .Set("bursts", bursts);
        }

        private static JObject ProbeShape(ParticleSystem.ShapeModule s)
        {
            if (!s.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("shapeType", s.shapeType.ToString())
                .Set("radius", s.radius)
                .Set("angle", s.angle)
                .Set("arc", s.arc)
                .Set("radiusThickness", s.radiusThickness)
                .Set("donutRadius", s.donutRadius)
                .Set("scale", Vec3(s.scale))
                .Set("position", Vec3(s.position))
                .Set("rotation", Vec3(s.rotation))
                .Set("randomDirectionAmount", s.randomDirectionAmount)
                .Set("sphericalDirectionAmount", s.sphericalDirectionAmount)
                .Set("randomPositionAmount", s.randomPositionAmount)
                .Set("alignToDirection", s.alignToDirection)
                .Set("mesh", s.mesh != null ? s.mesh.name : null)
                .Set("meshShapeType", s.meshShapeType.ToString())
                .Set("meshMaterialIndex", s.meshMaterialIndex);
        }

        private static JObject ProbeVelocity(ParticleSystem.VelocityOverLifetimeModule v)
        {
            if (!v.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("space", v.space.ToString())
                .Set("x", ProbeCurve(v.x))
                .Set("y", ProbeCurve(v.y))
                .Set("z", ProbeCurve(v.z))
                .Set("orbitalX", ProbeCurve(v.orbitalX))
                .Set("orbitalY", ProbeCurve(v.orbitalY))
                .Set("orbitalZ", ProbeCurve(v.orbitalZ));
        }

        private static JObject ProbeLimitVelocity(ParticleSystem.LimitVelocityOverLifetimeModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("separateAxes", m.separateAxes)
                .Set("dampen", m.dampen)
                .Set("limit", m.separateAxes ? ProbeCurve(m.limitX) : ProbeCurve(m.limit))
                .Set("limitX", ProbeCurve(m.limitX))
                .Set("limitY", ProbeCurve(m.limitY))
                .Set("limitZ", ProbeCurve(m.limitZ));
        }

        private static JObject ProbeInheritVelocity(ParticleSystem.InheritVelocityModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("mode", m.mode.ToString())
                .Set("curve", ProbeCurve(m.curve));
        }

        private static JObject ProbeForce(ParticleSystem.ForceOverLifetimeModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("space", m.space.ToString())
                .Set("x", ProbeCurve(m.x))
                .Set("y", ProbeCurve(m.y))
                .Set("z", ProbeCurve(m.z));
        }

        private static JObject ProbeColorOverLife(ParticleSystem.ColorOverLifetimeModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("color", ProbeGradient(m.color));
        }

        private static JObject ProbeSizeOverLife(ParticleSystem.SizeOverLifetimeModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("separateAxes", m.separateAxes)
                .Set("size", m.separateAxes ? null : ProbeCurve(m.size))
                .Set("x", ProbeCurve(m.x))
                .Set("y", ProbeCurve(m.y))
                .Set("z", ProbeCurve(m.z));
        }

        private static JObject ProbeRotationOverLife(ParticleSystem.RotationOverLifetimeModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("separateAxes", m.separateAxes)
                .Set("x", ProbeCurve(m.x))
                .Set("y", ProbeCurve(m.y))
                .Set("z", ProbeCurve(m.z));
        }

        private static JObject ProbeColorBySpeed(ParticleSystem.ColorBySpeedModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("color", ProbeGradient(m.color))
                .Set("speedRange", Vec2(m.range));
        }

        private static JObject ProbeSizeBySpeed(ParticleSystem.SizeBySpeedModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("separateAxes", m.separateAxes)
                .Set("size", m.separateAxes ? null : ProbeCurve(m.size))
                .Set("x", ProbeCurve(m.x))
                .Set("speedRange", Vec2(m.range));
        }

        private static JObject ProbeRotationBySpeed(ParticleSystem.RotationBySpeedModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("separateAxes", m.separateAxes)
                .Set("z", ProbeCurve(m.z))
                .Set("speedRange", Vec2(m.range));
        }

        private static JObject ProbeNoise(ParticleSystem.NoiseModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("frequency", m.frequency)
                .Set("strength", ProbeCurve(m.strength))
                .Set("positionAmount", ProbeCurve(m.positionAmount))
                .Set("rotationAmount", ProbeCurve(m.rotationAmount))
                .Set("scrollSpeed", ProbeCurve(m.scrollSpeed))
                .Set("remapEnabled", m.remapEnabled)
                .Set("octaveCount", m.octaveCount)
                .Set("quality", m.quality.ToString());
        }

        private static JObject ProbeCollision(ParticleSystem.CollisionModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("type", m.type.ToString())
                .Set("bounce", ProbeCurve(m.bounce))
                .Set("lifetimeLoss", ProbeCurve(m.lifetimeLoss))
                .Set("dampen", ProbeCurve(m.dampen));
        }

        private static JObject ProbeTsa(ParticleSystem.TextureSheetAnimationModule tsa)
        {
            if (!tsa.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("mode", tsa.mode.ToString())
                .Set("animation", tsa.animation.ToString())
                .Set("numTilesX", tsa.numTilesX)
                .Set("numTilesY", tsa.numTilesY)
                .Set("cycleCount", tsa.cycleCount)
                .Set("rowMode", tsa.rowMode.ToString())
                .Set("rowIndex", tsa.rowIndex)
                .Set("uvChannelMask", (int)tsa.uvChannelMask)
                .Set("timeMode", tsa.timeMode.ToString())
                .Set("fps", tsa.fps)
                .Set("startFrame", ProbeCurve(tsa.startFrame))
                .Set("frameOverTime", ProbeCurve(tsa.frameOverTime));
        }

        private static JObject ProbeTrails(ParticleSystem.TrailModule m)
        {
            if (!m.enabled) return new JObject().Set("enabled", false);
            return new JObject()
                .Set("enabled", true)
                .Set("mode", m.mode.ToString())
                .Set("ratio", m.ratio)
                .Set("lifetime", ProbeCurve(m.lifetime))
                .Set("minVertexDistance", m.minVertexDistance)
                .Set("worldSpace", m.worldSpace)
                .Set("dieWithParticles", m.dieWithParticles)
                .Set("sizeAffectsWidth", m.sizeAffectsWidth)
                .Set("inheritParticleColor", m.inheritParticleColor);
        }

        private static JObject ProbeSubEmitters(ParticleSystem.SubEmittersModule sub)
        {
            if (!sub.enabled || sub.subEmittersCount == 0)
                return new JObject().Set("enabled", false);
            var arr = new JArray();
            for (int i = 0; i < sub.subEmittersCount; i++)
            {
                ParticleSystem target = sub.GetSubEmitterSystem(i);
                arr.Add(new JObject()
                    .Set("type", sub.GetSubEmitterType(i).ToString())
                    .Set("target", target != null ? target.gameObject.name : null)
                    .Set("probability", sub.GetSubEmitterEmitProbability(i)));
            }
            return new JObject().Set("enabled", true).Set("emitters", arr);
        }

        private static JObject ProbeRenderer(ParticleSystemRenderer r)
        {
            if (r == null) return new JObject().Set("present", false);
            return new JObject()
                .Set("present", true)
                .Set("renderMode", r.renderMode.ToString())
                .Set("sortingOrder", r.sortingOrder)
                .Set("sortingFudge", r.sortingFudge)
                .Set("minParticleSize", r.minParticleSize)
                .Set("maxParticleSize", r.maxParticleSize)
                .Set("velocityScale", r.velocityScale)
                .Set("lengthScale", r.lengthScale)
                .Set("cameraVelocityScale", r.cameraVelocityScale)
                .Set("normalDirection", r.normalDirection)
                .Set("alignment", r.alignment.ToString())
                .Set("pivot", Vec3(r.pivot))
                .Set("flip", Vec3(r.flip))
                .Set("mesh", r.mesh != null ? r.mesh.name : null)
                .Set("trailMaterial", r.trailMaterial != null ? r.trailMaterial.name : null);
        }

        private static JObject ProbeMaterial(Material mat)
        {
            if (mat == null)
            {
                return new JObject()
                    .Set("present", false)
                    .Set("inferredBlend", ExportContext.DetectBlend(null))
                    .Set("inferredBlendName", ExportContext.BlendName(ExportContext.DetectBlend(null)));
            }
            var obj = new JObject()
                .Set("present", true)
                .Set("name", mat.name)
                .Set("shader", mat.shader != null ? mat.shader.name : null);
            if (ExportContext.TryParticleColorMode(mat, out int colorMode))
            {
                obj.Set("colorMode", colorMode).Set("colorModeName", ExportContext.ColorModeName(colorMode));
            }
            if (mat.HasProperty("_SrcBlend")) obj.Set("srcBlend", (int)mat.GetFloat("_SrcBlend"));
            if (mat.HasProperty("_DstBlend")) obj.Set("dstBlend", (int)mat.GetFloat("_DstBlend"));
            if (mat.HasProperty("_TintColor")) obj.Set("tintColor", ColorJson(mat.GetColor("_TintColor")));
            if (mat.mainTexture != null) obj.Set("mainTexture", mat.mainTexture.name);
            int blend = ExportContext.DetectBlend(mat);
            obj.Set("inferredBlend", blend).Set("inferredBlendName", ExportContext.BlendName(blend));
            return obj;
        }

        // ---- curves / gradients -------------------------------------------------------

        public static JObject ProbeCurve(ParticleSystem.MinMaxCurve c)
        {
            var obj = new JObject().Set("mode", c.mode.ToString());
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant:
                    obj.Set("constant", c.constant);
                    break;
                case ParticleSystemCurveMode.TwoConstants:
                    obj.Set("min", c.constantMin).Set("max", c.constantMax);
                    break;
                case ParticleSystemCurveMode.Curve:
                    obj.Set("multiplier", c.curveMultiplier)
                        .Set("keys", SampleCurve(c.curve, c.curveMultiplier));
                    break;
                case ParticleSystemCurveMode.TwoCurves:
                    obj.Set("multiplier", c.curveMultiplier)
                        .Set("minKeys", SampleCurve(c.curveMin, c.curveMultiplier))
                        .Set("maxKeys", SampleCurve(c.curveMax, c.curveMultiplier));
                    break;
            }
            return obj;
        }

        public static JObject ProbeGradient(ParticleSystem.MinMaxGradient g)
        {
            var obj = new JObject().Set("mode", g.mode.ToString());
            switch (g.mode)
            {
                case ParticleSystemGradientMode.Color:
                    obj.Set("color", ColorJson(g.color));
                    break;
                case ParticleSystemGradientMode.TwoColors:
                    obj.Set("min", ColorJson(g.colorMin)).Set("max", ColorJson(g.colorMax));
                    break;
                case ParticleSystemGradientMode.Gradient:
                case ParticleSystemGradientMode.RandomColor:
                    obj.Set("samples", SampleGradient(g.gradient));
                    break;
                case ParticleSystemGradientMode.TwoGradients:
                    obj.Set("minSamples", SampleGradient(g.gradientMin))
                        .Set("maxSamples", SampleGradient(g.gradientMax));
                    break;
            }
            return obj;
        }

        private static JArray SampleCurve(AnimationCurve curve, float mult)
        {
            var arr = new JArray();
            if (curve == null || curve.length == 0) return arr;
            foreach (float t in new[] { 0f, 0.25f, 0.5f, 0.75f, 1f })
            {
                arr.Add(new JObject().Set("t", t).Set("v", curve.Evaluate(t) * mult));
            }
            return arr;
        }

        private static JArray SampleGradient(Gradient g)
        {
            var arr = new JArray();
            if (g == null) return arr;
            foreach (float t in new[] { 0f, 0.25f, 0.5f, 0.75f, 1f })
            {
                Color c = g.Evaluate(t);
                arr.Add(new JObject().Set("t", t).Set("rgba", ColorJson(c)));
            }
            return arr;
        }

        private static JObject ColorJson(Color c) =>
            new JObject().Set("r", c.r).Set("g", c.g).Set("b", c.b).Set("a", c.a);

        private static JArray Vec2(Vector2 v) => new JArray().Add(v.x).Add(v.y);
        private static JArray Vec3(Vector3 v) => new JArray().Add(v.x).Add(v.y).Add(v.z);

        /// <summary>Hierarchy path; when <paramref name="root"/> is set, path is relative to that root.</summary>
        public static string HierarchyPath(Transform t, Transform root = null)
        {
            var parts = new List<string>();
            while (t != null)
            {
                parts.Add(t.name);
                if (root != null && t == root) break;
                t = t.parent;
            }
            parts.Reverse();
            return string.Join("/", parts);
        }
    }
}
