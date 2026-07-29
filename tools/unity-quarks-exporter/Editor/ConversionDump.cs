using System.Collections.Generic;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Side-by-side dump of Unity source values vs what the exporter actually emits.
    /// Catches the class of bugs that coverage scoring misses: feature is "supported",
    /// but a value was translated wrong (blend on a child, gravity space, curve mode, …).
    /// </summary>
    public static class ConversionDump
    {
        public sealed class Suspicion
        {
            public string Code;
            public string Severity;
            public string SystemName;
            public string Message;
        }

        /// <summary>Builds a conversion dump for one effect hierarchy (all particle systems).</summary>
        public static JObject ForRoot(GameObject root)
        {
            var systems = root.GetComponentsInChildren<ParticleSystem>(true);
            var systemDumps = new JArray();
            var suspicions = new List<Suspicion>();

            foreach (var ps in systems)
            {
                var renderer = ps.GetComponent<ParticleSystemRenderer>();
                systemDumps.Add(ForSystem(ps, renderer, suspicions));
            }

            var suspicionArr = new JArray();
            foreach (var s in suspicions)
            {
                suspicionArr.Add(new JObject()
                    .Set("code", s.Code)
                    .Set("severity", s.Severity)
                    .Set("system", s.SystemName)
                    .Set("message", s.Message));
            }

            return new JObject()
                .Set("name", root.name)
                .Set("systemCount", systems.Length)
                .Set("suspicionCount", suspicions.Count)
                .Set("suspicions", suspicionArr)
                .Set("systems", systemDumps);
        }

        /// <summary>Dumps one ParticleSystem: unity source vs exported quarks fields.</summary>
        public static JObject ForSystem(
            ParticleSystem ps,
            ParticleSystemRenderer renderer,
            List<Suspicion> suspicions)
        {
            var main = ps.main;
            var shape = ps.shape;
            Material mat = renderer != null ? renderer.sharedMaterial : null;

            JObject unityMat = DumpMaterial(mat);
            int exportedBlend = ExportContext.DetectBlend(mat);
            JObject exportedShape = DumpExportedShape(shape);
            JObject unityShape = DumpUnityShape(shape);

            FlagBlendSuspicions(ps.name, mat, exportedBlend, suspicions);
            FlagShapeSuspicions(ps.name, shape, exportedShape, suspicions);

            return new JObject()
                .Set("name", ps.name)
                .Set("path", HierarchyPath(ps.transform))
                .Set("unity", new JObject()
                    .Set("main", new JObject()
                        .Set("duration", main.duration)
                        .Set("looping", main.loop)
                        .Set("prewarm", main.prewarm)
                        .Set("simulationSpace", main.simulationSpace.ToString())
                        .Set("startDelay", DumpCurve(main.startDelay))
                        .Set("startLifetime", DumpCurve(main.startLifetime))
                        .Set("startSpeed", DumpCurve(main.startSpeed))
                        .Set("startSize", main.startSize3D
                            ? new JObject()
                                .Set("x", DumpCurve(main.startSizeX))
                                .Set("y", DumpCurve(main.startSizeY))
                                .Set("z", DumpCurve(main.startSizeZ))
                            : DumpCurve(main.startSize))
                        .Set("startSize3D", main.startSize3D)
                        .Set("startRotation", main.startRotation3D
                            ? new JObject()
                                .Set("x", DumpCurve(main.startRotationX))
                                .Set("y", DumpCurve(main.startRotationY))
                                .Set("z", DumpCurve(main.startRotationZ))
                            : DumpCurve(main.startRotation))
                        .Set("startRotation3D", main.startRotation3D)
                        .Set("startColor", DumpGradient(main.startColor))
                        .Set("gravityModifier", DumpCurve(main.gravityModifier)))
                    .Set("emission", DumpEmission(ps))
                    .Set("shape", unityShape)
                    .Set("renderer", new JObject()
                        .Set("renderMode", renderer != null ? renderer.renderMode.ToString() : "null")
                        .Set("sortingOrder", renderer != null ? renderer.sortingOrder : 0)
                        .Set("velocityScale", renderer != null ? renderer.velocityScale : 0)
                        .Set("lengthScale", renderer != null ? renderer.lengthScale : 0)
                        .Set("mesh", renderer != null && renderer.mesh != null ? renderer.mesh.name : null))
                    .Set("material", unityMat)
                    .Set("modules", new JObject()
                        .Set("colorOverLifetime", ps.colorOverLifetime.enabled)
                        .Set("sizeOverLifetime", ps.sizeOverLifetime.enabled)
                        .Set("rotationOverLifetime", ps.rotationOverLifetime.enabled)
                        .Set("velocityOverLifetime", ps.velocityOverLifetime.enabled)
                        .Set("forceOverLifetime", ps.forceOverLifetime.enabled)
                        .Set("forceSpace", ps.forceOverLifetime.enabled
                            ? ps.forceOverLifetime.space.ToString()
                            : null)
                        .Set("noise", ps.noise.enabled)
                        .Set("noisePositionAmount", ps.noise.enabled ? DumpCurve(ps.noise.positionAmount) : null)
                        .Set("noiseRotationAmount", ps.noise.enabled ? DumpCurve(ps.noise.rotationAmount) : null)
                        .Set("trails", ps.trails.enabled)
                        .Set("textureSheet", ps.textureSheetAnimation.enabled)))
                .Set("exported", new JObject()
                    .Set("worldSpace", main.simulationSpace != ParticleSystemSimulationSpace.Local)
                    .Set("duration", main.duration)
                    .Set("looping", main.loop)
                    .Set("prewarm", main.prewarm)
                    .Set("startDelay", ValueConverter.Curve(main.startDelay))
                    .Set("startLife", ValueConverter.Curve(main.startLifetime))
                    .Set("startSpeed", ValueConverter.Curve(main.startSpeed))
                    .Set("startSize", DumpExportedStartSize(main))
                    .Set("startRotation", DumpExportedStartRotation(main, renderer))
                    .Set("startColor", ValueConverter.StartColor(main.startColor))
                    .Set("gravityAsForceY", -9.81f * ConstantOf(main.gravityModifier))
                    .Set("shape", exportedShape)
                    .Set("renderMode", MapRenderMode(renderer))
                    .Set("blending", exportedBlend)
                    .Set("blendingName", ExportContext.BlendName(exportedBlend))
                    .Set("emissionOverTime", ps.emission.enabled
                        ? ValueConverter.Curve(ps.emission.rateOverTime)
                        : ValueConverter.Constant(0))
                    .Set("noise", ps.noise.enabled
                        ? new JObject()
                            .Set("frequency", ps.noise.frequency)
                            .Set("power", ValueConverter.Curve(ps.noise.strength))
                            .Set("positionAmount", ValueConverter.Curve(ps.noise.positionAmount))
                            .Set("rotationAmount", ValueConverter.Curve(ps.noise.rotationAmount))
                        : null));
        }

        // ---- unity field dumps ----------------------------------------------------------

        private static JObject DumpMaterial(Material mat)
        {
            if (mat == null)
            {
                return new JObject()
                    .Set("present", false)
                    .Set("name", null)
                    .Set("shader", null);
            }

            var obj = new JObject()
                .Set("present", true)
                .Set("name", mat.name)
                .Set("shader", mat.shader != null ? mat.shader.name : null);

            if (ExportContext.TryParticleColorMode(mat, out int colorMode))
            {
                obj.Set("colorMode", colorMode)
                    .Set("colorModeName", ExportContext.ColorModeName(colorMode));
            }
            if (mat.HasProperty("_SrcBlend"))
                obj.Set("srcBlend", (int)mat.GetFloat("_SrcBlend"));
            if (mat.HasProperty("_DstBlend"))
                obj.Set("dstBlend", (int)mat.GetFloat("_DstBlend"));
            if (mat.mainTexture != null)
                obj.Set("mainTexture", mat.mainTexture.name);

            int inferred = ExportContext.DetectBlend(mat);
            obj.Set("inferredBlend", inferred)
                .Set("inferredBlendName", ExportContext.BlendName(inferred));
            return obj;
        }

        private static JObject DumpUnityShape(ParticleSystem.ShapeModule shape)
        {
            if (!shape.enabled)
            {
                return new JObject().Set("enabled", false).Set("type", "Disabled");
            }
            return new JObject()
                .Set("enabled", true)
                .Set("type", shape.shapeType.ToString())
                .Set("radius", shape.radius)
                .Set("angle", shape.angle)
                .Set("arc", shape.arc)
                .Set("radiusThickness", shape.radiusThickness)
                .Set("donutRadius", shape.donutRadius)
                .Set("scale", Vec3(shape.scale))
                .Set("randomDirectionAmount", shape.randomDirectionAmount)
                .Set("mesh", shape.mesh != null ? shape.mesh.name : null);
        }

        private static JObject DumpEmission(ParticleSystem ps)
        {
            var e = ps.emission;
            if (!e.enabled)
            {
                return new JObject().Set("enabled", false);
            }
            return new JObject()
                .Set("enabled", true)
                .Set("rateOverTime", DumpCurve(e.rateOverTime))
                .Set("rateOverDistance", DumpCurve(e.rateOverDistance))
                .Set("burstCount", e.burstCount);
        }

        private static JObject DumpCurve(ParticleSystem.MinMaxCurve c)
        {
            var obj = new JObject().Set("mode", c.mode.ToString());
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant:
                    obj.Set("value", c.constant);
                    break;
                case ParticleSystemCurveMode.TwoConstants:
                    obj.Set("min", c.constantMin).Set("max", c.constantMax);
                    break;
                case ParticleSystemCurveMode.Curve:
                    obj.Set("multiplier", c.curveMultiplier)
                        .Set("keyCount", c.curve != null ? c.curve.length : 0);
                    break;
                case ParticleSystemCurveMode.TwoCurves:
                    obj.Set("multiplier", c.curveMultiplier)
                        .Set("keyCountMin", c.curveMin != null ? c.curveMin.length : 0)
                        .Set("keyCountMax", c.curveMax != null ? c.curveMax.length : 0)
                        .Set("exportsAs", "upperCurveOnly");
                    break;
            }
            return obj;
        }

        private static JObject DumpGradient(ParticleSystem.MinMaxGradient g)
        {
            return new JObject()
                .Set("mode", g.mode.ToString())
                .Set("exportsAs", g.mode == ParticleSystemGradientMode.TwoGradients
                    ? "maxGradientOnlyInColorOverLife"
                    : g.mode.ToString());
        }

        // ---- exported mirrors -----------------------------------------------------------

        private static JToken DumpExportedStartSize(ParticleSystem.MainModule main)
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

        private static JToken DumpExportedStartRotation(
            ParticleSystem.MainModule main,
            ParticleSystemRenderer renderer)
        {
            int renderMode = MapRenderMode(renderer);
            bool mesh = renderMode == 2;
            if (main.startRotation3D)
            {
                if (mesh)
                {
                    return new JObject()
                        .Set("type", "Euler")
                        .Set("angleX", ValueConverter.Curve(main.startRotationX))
                        .Set("angleY", ValueConverter.Curve(main.startRotationY))
                        .Set("angleZ", ValueConverter.Curve(main.startRotationZ))
                        .Set("eulerOrder", "YXZ");
                }
                return ValueConverter.Curve(main.startRotationZ);
            }
            if (mesh)
            {
                return new JObject()
                    .Set("type", "Euler")
                    .Set("angleX", ValueConverter.Constant(0))
                    .Set("angleY", ValueConverter.Constant(0))
                    .Set("angleZ", ValueConverter.Curve(main.startRotation))
                    .Set("eulerOrder", "YXZ");
            }
            return ValueConverter.Curve(main.startRotation);
        }

        private static JObject DumpExportedShape(ParticleSystem.ShapeModule shape)
        {
            // Mirror ParticleConverter.BuildShape decisions without needing ExportContext mesh nodes.
            if (!shape.enabled) return new JObject().Set("type", "point");

            float arc = shape.arc * Mathf.Deg2Rad;
            float thickness = shape.radiusThickness;
            switch (shape.shapeType)
            {
                case ParticleSystemShapeType.Cone:
                case ParticleSystemShapeType.ConeVolume:
                    return new JObject()
                        .Set("type", "cone")
                        .Set("radius", shape.radius)
                        .Set("angle", shape.angle * Mathf.Deg2Rad)
                        .Set("arc", arc)
                        .Set("thickness", Mathf.Clamp01(thickness));
                case ParticleSystemShapeType.Sphere:
                    return new JObject().Set("type", "sphere").Set("radius", shape.radius)
                        .Set("arc", arc).Set("thickness", Mathf.Clamp01(thickness));
                case ParticleSystemShapeType.Hemisphere:
                    return new JObject().Set("type", "hemisphere").Set("radius", shape.radius)
                        .Set("arc", arc).Set("thickness", Mathf.Clamp01(thickness));
                case ParticleSystemShapeType.Circle:
                    return new JObject().Set("type", "circle").Set("radius", shape.radius)
                        .Set("arc", arc).Set("thickness", Mathf.Clamp01(thickness));
                case ParticleSystemShapeType.Donut:
                    return new JObject().Set("type", "donut").Set("radius", shape.radius)
                        .Set("donutRadius", shape.donutRadius)
                        .Set("arc", arc).Set("thickness", Mathf.Clamp01(thickness));
                case ParticleSystemShapeType.Mesh:
                    return new JObject()
                        .Set("type", shape.mesh != null ? "mesh_surface" : "point")
                        .Set("mesh", shape.mesh != null ? shape.mesh.name : null);
                case ParticleSystemShapeType.Box:
                case ParticleSystemShapeType.BoxShell:
                case ParticleSystemShapeType.BoxEdge:
                    {
                        Vector3 scale = shape.scale;
                        float t = shape.shapeType == ParticleSystemShapeType.BoxShell
                            || shape.shapeType == ParticleSystemShapeType.BoxEdge
                            ? 0f
                            : Mathf.Clamp01(shape.radiusThickness > 0f ? shape.radiusThickness : 1f);
                        return new JObject()
                            .Set("type", "rectangle")
                            .Set("width", Mathf.Abs(scale.x))
                            .Set("height", Mathf.Abs(scale.y))
                            .Set("thickness", t)
                            .Set("note", "Z depth flattened");
                    }
                default:
                    return new JObject()
                        .Set("type", "point")
                        .Set("fallbackFrom", shape.shapeType.ToString());
            }
        }

        // ---- suspicions -----------------------------------------------------------------

        private static void FlagBlendSuspicions(
            string systemName,
            Material mat,
            int exportedBlend,
            List<Suspicion> suspicions)
        {
            if (mat == null)
            {
                suspicions.Add(new Suspicion
                {
                    Code = "blend.nullMaterial",
                    Severity = "minor",
                    SystemName = systemName,
                    Message =
                        "No material on renderer — exporter defaults blending to additive (Unity default particle) " +
                        "and embeds no texture. Assign a material if the look depends on a specific atlas/blend.",
                });
                return;
            }

            if (mat.HasProperty("_DstBlend"))
            {
                int dst = (int)mat.GetFloat("_DstBlend");
                if (dst == 1 && exportedBlend != 1)
                {
                    suspicions.Add(new Suspicion
                    {
                        Code = "blend.dstOneNotAdditive",
                        Severity = "major",
                        SystemName = systemName,
                        Message =
                            $"Material _DstBlend=One (additive) but exporter inferred {ExportContext.BlendName(exportedBlend)} ({exportedBlend}).",
                    });
                }
            }

            if (ExportContext.TryParticleColorMode(mat, out int mode) && mode == 1 && exportedBlend != 1)
            {
                suspicions.Add(new Suspicion
                {
                    Code = "blend.colorModeAdditiveMismatch",
                    Severity = "major",
                    SystemName = systemName,
                    Message =
                        $"Shader _ColorMode Additive (1) but exporter inferred {ExportContext.BlendName(exportedBlend)} ({exportedBlend}).",
                });
            }
        }

        private static void FlagShapeSuspicions(
            string systemName,
            ParticleSystem.ShapeModule shape,
            JObject exportedShape,
            List<Suspicion> suspicions)
        {
            if (!shape.enabled) return;

            string exportedType = ReadStringMember(exportedShape, "type");
            string fallbackFrom = ReadStringMember(exportedShape, "fallbackFrom");

            if (exportedType == "point" && fallbackFrom != null)
            {
                suspicions.Add(new Suspicion
                {
                    Code = "shape.collapsedToPoint",
                    Severity = "major",
                    SystemName = systemName,
                    Message =
                        $"Unity shape {shape.shapeType} exported as point — emission volume lost.",
                });
            }

            if (exportedType == "rectangle"
                && (shape.shapeType == ParticleSystemShapeType.Box
                    || shape.shapeType == ParticleSystemShapeType.BoxShell
                    || shape.shapeType == ParticleSystemShapeType.BoxEdge)
                && Mathf.Abs(shape.scale.z) > 1e-3f)
            {
                suspicions.Add(new Suspicion
                {
                    Code = "shape.boxZFlattened",
                    Severity = "minor",
                    SystemName = systemName,
                    Message =
                        $"Box scale.z={shape.scale.z} flattened when mapping to rectangle (XY only).",
                });
            }
        }

        // ---- helpers --------------------------------------------------------------------

        private static int MapRenderMode(ParticleSystemRenderer renderer)
        {
            if (renderer == null) return 0;
            switch (renderer.renderMode)
            {
                case ParticleSystemRenderMode.Billboard: return 0;
                case ParticleSystemRenderMode.Stretch: return 1;
                case ParticleSystemRenderMode.Mesh: return 2;
                case ParticleSystemRenderMode.HorizontalBillboard: return 4;
                case ParticleSystemRenderMode.VerticalBillboard: return 5;
                default: return 0;
            }
        }

        private static string ReadStringMember(JObject obj, string key)
        {
            foreach (var kv in obj.Members)
            {
                if (kv.Key != key) continue;
                if (kv.Value is JNull || kv.Value == null) return null;
                if (kv.Value is JString s) return s.Value;
                return kv.Value.ToString();
            }
            return null;
        }

        private static JArray Vec3(Vector3 v) => new JArray().Add(v.x).Add(v.y).Add(v.z);

        private static float ConstantOf(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return c.constant;
                case ParticleSystemCurveMode.TwoConstants: return (c.constantMin + c.constantMax) * 0.5f;
                default: return c.constantMax != 0 ? c.constantMax : c.constant;
            }
        }

        private static string HierarchyPath(Transform t)
        {
            var parts = new List<string>();
            while (t != null)
            {
                parts.Add(t.name);
                t = t.parent;
            }
            parts.Reverse();
            return string.Join("/", parts);
        }
    }
}
