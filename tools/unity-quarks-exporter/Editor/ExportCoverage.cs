using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Shared knowledge of what the Unity → Quarks exporter can map today.
    /// Used by the pack analyzer (scoring / histograms) and by validity-filtered export
    /// so both stay on the same coverage model.
    /// </summary>
    public static class ExportCoverage
    {
        public enum Severity
        {
            /// <summary>Cosmetic / approximate mapping; effect still reads as the same idea.</summary>
            Minor = 0,
            /// <summary>Visible wrong volume, animation, or motion; salvageable with tweaks.</summary>
            Major = 1,
            /// <summary>Core look of the effect depends on an unmapped feature.</summary>
            Blocking = 2,
        }

        public enum Tier
        {
            Full = 0,
            Good = 1,
            Partial = 2,
            Poor = 3,
        }

        public sealed class Issue
        {
            public string Code;
            public Severity Severity;
            public string Message;
            public string SystemName;
        }

        public sealed class SystemFeatures
        {
            public string Name;
            public string ShapeType;
            public string RenderMode;
            public bool ShapeEnabled;
            public bool EmissionEnabled;
            public bool ColorOverLifetime;
            public bool SizeOverLifetime;
            public bool SizeOverLifetimeSeparateAxes;
            public bool RotationOverLifetime;
            public bool RotationOverLifetime3D;
            public bool VelocityOverLifetime;
            public bool InheritVelocity;
            public bool LimitVelocity;
            public bool LimitVelocitySeparateAxes;
            public bool ForceOverLifetime;
            public bool ForceOverLifetimeWorldSpace;
            public bool ColorBySpeed;
            public bool SizeBySpeed;
            public bool SizeBySpeedSeparateAxes;
            public bool RotationBySpeed;
            public bool Noise;
            public bool NoiseHasScrollOrRemap;
            public bool Collision;
            public bool Trails;
            public bool Lights;
            public bool CustomData;
            public bool ExternalForces;
            public bool Triggers;
            public bool TextureSheet;
            public bool TextureSheetSprites;
            public bool TextureSheetSingleRow;
            public bool SubEmitters;
            public bool SubEmitterCollisionOrTrigger;
            public bool TwoCurvesAnywhere;
            public bool TwoGradientsColorOverLife;
            public bool MeshShape;
            public bool MeshRenderer;
            public bool Gravity;
        }

        public sealed class EffectAssessment
        {
            public string AssetPath;
            public string Name;
            public string Fingerprint;
            public int SystemCount;
            public float Score;
            public Tier Tier;
            public readonly List<SystemFeatures> Systems = new List<SystemFeatures>();
            public readonly List<Issue> Issues = new List<Issue>();
        }

        /// <summary>Inspects one prefab root (or hierarchy) and returns a scored assessment.</summary>
        public static EffectAssessment Assess(GameObject root, string assetPath = null)
        {
            var result = new EffectAssessment
            {
                AssetPath = assetPath ?? root.name,
                Name = root.name,
            };

            var systems = root.GetComponentsInChildren<ParticleSystem>(true);
            result.SystemCount = systems.Length;

            var fingerprintParts = new List<string>();
            foreach (var ps in systems)
            {
                var renderer = ps.GetComponent<ParticleSystemRenderer>();
                var features = CollectFeatures(ps, renderer);
                result.Systems.Add(features);
                CollectIssues(ps, renderer, features, result.Issues);
                fingerprintParts.Add(FingerprintSystem(features));
            }

            fingerprintParts.Sort(StringComparer.Ordinal);
            result.Fingerprint = HashJoined(fingerprintParts);
            result.Score = ScoreFromIssues(result.Issues);
            result.Tier = TierFromScore(result.Score, result.Issues);
            return result;
        }

        /// <summary>Reads the Shuriken modules that matter for export coverage histograms.</summary>
        public static SystemFeatures CollectFeatures(ParticleSystem ps, ParticleSystemRenderer renderer)
        {
            var shape = ps.shape;
            var tsa = ps.textureSheetAnimation;
            var noise = ps.noise;
            var force = ps.forceOverLifetime;
            var sizeLife = ps.sizeOverLifetime;
            var sizeSpeed = ps.sizeBySpeed;
            var rotLife = ps.rotationOverLifetime;
            var limit = ps.limitVelocityOverLifetime;
            var colorLife = ps.colorOverLifetime;
            var sub = ps.subEmitters;

            bool twoCurves = false;
            twoCurves |= IsTwoCurves(ps.main.startLifetime) || IsTwoCurves(ps.main.startSpeed)
                || IsTwoCurves(ps.main.startSize) || IsTwoCurves(ps.main.startRotation);
            twoCurves |= ps.emission.enabled && (IsTwoCurves(ps.emission.rateOverTime) || IsTwoCurves(ps.emission.rateOverDistance));
            if (sizeLife.enabled) twoCurves |= sizeLife.separateAxes ? IsTwoCurves(sizeLife.x) : IsTwoCurves(sizeLife.size);
            if (rotLife.enabled) twoCurves |= IsTwoCurves(rotLife.z);
            if (force.enabled) twoCurves |= IsTwoCurves(force.x) || IsTwoCurves(force.y) || IsTwoCurves(force.z);
            if (noise.enabled) twoCurves |= IsTwoCurves(noise.strength);

            bool subCollision = false;
            if (sub.enabled)
            {
                for (int i = 0; i < sub.subEmittersCount; i++)
                {
                    var t = sub.GetSubEmitterType(i);
                    if (t == ParticleSystemSubEmitterType.Collision || t == ParticleSystemSubEmitterType.Trigger)
                    {
                        subCollision = true;
                    }
                }
            }

            return new SystemFeatures
            {
                Name = ps.gameObject.name,
                ShapeEnabled = shape.enabled,
                ShapeType = shape.enabled ? shape.shapeType.ToString() : "Disabled",
                RenderMode = renderer != null ? renderer.renderMode.ToString() : "Billboard",
                EmissionEnabled = ps.emission.enabled,
                ColorOverLifetime = colorLife.enabled,
                SizeOverLifetime = sizeLife.enabled,
                SizeOverLifetimeSeparateAxes = sizeLife.enabled && sizeLife.separateAxes,
                RotationOverLifetime = rotLife.enabled,
                RotationOverLifetime3D = rotLife.enabled && rotLife.separateAxes,
                VelocityOverLifetime = ps.velocityOverLifetime.enabled,
                InheritVelocity = ps.inheritVelocity.enabled,
                LimitVelocity = limit.enabled,
                LimitVelocitySeparateAxes = limit.enabled && limit.separateAxes,
                ForceOverLifetime = force.enabled,
                ForceOverLifetimeWorldSpace = force.enabled && force.space == ParticleSystemSimulationSpace.World,
                ColorBySpeed = ps.colorBySpeed.enabled,
                SizeBySpeed = sizeSpeed.enabled,
                SizeBySpeedSeparateAxes = sizeSpeed.enabled && sizeSpeed.separateAxes,
                RotationBySpeed = ps.rotationBySpeed.enabled,
                Noise = noise.enabled,
                NoiseHasScrollOrRemap = noise.enabled && (HasNonZero(noise.scrollSpeed) || noise.remapEnabled),
                Collision = ps.collision.enabled,
                Trails = ps.trails.enabled,
                Lights = ps.lights.enabled,
                CustomData = ps.customData.enabled,
                ExternalForces = ps.externalForces.enabled,
                Triggers = ps.trigger.enabled,
                TextureSheet = tsa.enabled,
                TextureSheetSprites = tsa.enabled && tsa.mode == ParticleSystemAnimationMode.Sprites,
                TextureSheetSingleRow = tsa.enabled && tsa.animation == ParticleSystemAnimationType.SingleRow,
                SubEmitters = sub.enabled && sub.subEmittersCount > 0,
                SubEmitterCollisionOrTrigger = subCollision,
                TwoCurvesAnywhere = twoCurves,
                TwoGradientsColorOverLife = colorLife.enabled
                    && colorLife.color.mode == ParticleSystemGradientMode.TwoGradients,
                MeshShape = shape.enabled && shape.shapeType == ParticleSystemShapeType.Mesh,
                MeshRenderer = renderer != null && renderer.renderMode == ParticleSystemRenderMode.Mesh,
                Gravity = Mathf.Abs(ConstantOf(ps.main.gravityModifier)) > 1e-5f,
            };
        }

        /// <summary>Appends coverage issues for one particle system into <paramref name="issues"/>.</summary>
        public static void CollectIssues(
            ParticleSystem ps,
            ParticleSystemRenderer renderer,
            SystemFeatures features,
            List<Issue> issues)
        {
            string sys = features.Name;

            if (features.Trails)
            {
                Add(issues, "trails.module", Severity.Blocking, sys,
                    "Trails module (per-particle ribbons) has no quarks mapping; look is dropped.");
            }
            if (features.Lights)
            {
                Add(issues, "lights.module", Severity.Major, sys,
                    "Lights module is skipped on export.");
            }
            if (features.CustomData)
            {
                Add(issues, "customData.module", Severity.Minor, sys,
                    "Custom Data module is skipped on export.");
            }
            if (features.ExternalForces)
            {
                Add(issues, "externalForces.module", Severity.Major, sys,
                    "External Forces module is skipped on export.");
            }
            if (features.Triggers)
            {
                Add(issues, "triggers.module", Severity.Major, sys,
                    "Trigger module is skipped on export.");
            }
            if (features.SubEmitterCollisionOrTrigger)
            {
                Add(issues, "subEmitters.collisionTrigger", Severity.Major, sys,
                    "Collision/Trigger sub-emitter types are not mapped (birth/death/frame only).");
            }

            if (features.ShapeEnabled)
            {
                switch (ps.shape.shapeType)
                {
                    case ParticleSystemShapeType.Cone:
                    case ParticleSystemShapeType.ConeVolume:
                    case ParticleSystemShapeType.Sphere:
                    case ParticleSystemShapeType.Hemisphere:
                    case ParticleSystemShapeType.Circle:
                    case ParticleSystemShapeType.Donut:
                    case ParticleSystemShapeType.Mesh:
                        break;
                    case ParticleSystemShapeType.Box:
                    case ParticleSystemShapeType.BoxShell:
                    case ParticleSystemShapeType.BoxEdge:
                        // Mapped to quarks rectangle (XY plane) — depth is flattened.
                        Add(issues, "shape.boxApproximate", Severity.Minor, sys,
                            "Box shape exports as rectangle (XY); Z depth is not preserved.");
                        break;
                    case ParticleSystemShapeType.SingleSidedEdge:
                        Add(issues, "shape.edge", Severity.Major, sys,
                            "Edge shape has no quarks equivalent; falls back to point.");
                        break;
                    default:
                        Add(issues, "shape.unsupported", Severity.Major, sys,
                            $"Shape '{ps.shape.shapeType}' falls back to point.");
                        break;
                }
            }

            if (features.TextureSheetSprites)
            {
                Add(issues, "tsa.sprites", Severity.Major, sys,
                    "Texture Sheet Animation Sprites mode is not mapped.");
            }
            else if (features.TextureSheetSingleRow)
            {
                Add(issues, "tsa.singleRow", Severity.Minor, sys,
                    "TSA Single Row is exported as a full-sheet FrameOverLife sweep.");
            }
            else if (features.TextureSheet)
            {
                Add(issues, "tsa.frameOverTime", Severity.Minor, sys,
                    "TSA frameOverTime / cycles are approximated as a linear full-sheet sweep.");
            }

            if (features.TwoCurvesAnywhere)
            {
                Add(issues, "curve.twoCurves", Severity.Major, sys,
                    "TwoCurves modes export the upper curve only (random-between-curves lost).");
            }
            if (features.TwoGradientsColorOverLife)
            {
                Add(issues, "color.twoGradients", Severity.Minor, sys,
                    "Color over Lifetime TwoGradients exports the max gradient only.");
            }
            if (features.SizeOverLifetimeSeparateAxes)
            {
                Add(issues, "size.separateAxes", Severity.Minor, sys,
                    "Size over Lifetime separate axes: only X is exported.");
            }
            if (features.SizeBySpeedSeparateAxes)
            {
                Add(issues, "sizeBySpeed.separateAxes", Severity.Minor, sys,
                    "Size by Speed separate axes: only X is exported.");
            }
            if (features.LimitVelocitySeparateAxes)
            {
                Add(issues, "limitVelocity.separateAxes", Severity.Minor, sys,
                    "Limit Velocity separate axes: only X limit is exported.");
            }
            if (features.RotationOverLifetime3D)
            {
                Add(issues, "rotation.overLife3D", Severity.Minor, sys,
                    "Rotation over Lifetime exports Z angular velocity only.");
            }
            if (features.NoiseHasScrollOrRemap)
            {
                Add(issues, "noise.scrollRemap", Severity.Minor, sys,
                    "Noise scroll speed / remap are not exported.");
            }
            if (features.ForceOverLifetime)
            {
                bool systemWorld = ps.main.simulationSpace == ParticleSystemSimulationSpace.World;
                bool forceWorld = ps.forceOverLifetime.space == ParticleSystemSimulationSpace.World;
                if (forceWorld != systemWorld)
                {
                    Add(issues, "force.spaceMismatch", Severity.Major, sys,
                        "Force over Lifetime space differs from simulation space; quarks ForceOverLife follows the system.");
                }
            }
            if (features.MeshShape && ps.shape.mesh == null)
            {
                Add(issues, "shape.meshMissing", Severity.Blocking, sys,
                    "Mesh shape has no mesh assigned; exports as point.");
            }
            if (features.MeshRenderer && (renderer == null || renderer.mesh == null))
            {
                Add(issues, "renderer.meshMissing", Severity.Blocking, sys,
                    "Mesh render mode has no mesh; particles will not render correctly.");
            }
        }

        /// <summary>True when the assessment is at least the requested tier (Full &lt; Good &lt; Partial &lt; Poor).</summary>
        public static bool MeetsMinTier(EffectAssessment a, Tier minTier) => a.Tier <= minTier;

        public static string TierName(Tier t)
        {
            switch (t)
            {
                case Tier.Full: return "full";
                case Tier.Good: return "good";
                case Tier.Partial: return "partial";
                default: return "poor";
            }
        }

        public static string SeverityName(Severity s)
        {
            switch (s)
            {
                case Severity.Minor: return "minor";
                case Severity.Major: return "major";
                default: return "blocking";
            }
        }

        // ---- scoring --------------------------------------------------------------------

        private static float ScoreFromIssues(List<Issue> issues)
        {
            float score = 1f;
            foreach (var issue in issues)
            {
                switch (issue.Severity)
                {
                    case Severity.Blocking:
                        score = Mathf.Min(score, 0.35f);
                        score *= 0.85f;
                        break;
                    case Severity.Major:
                        score *= 0.82f;
                        break;
                    default:
                        score *= 0.96f;
                        break;
                }
            }
            return Mathf.Clamp01(score);
        }

        private static Tier TierFromScore(float score, List<Issue> issues)
        {
            bool anyBlocking = false;
            bool anyMajor = false;
            foreach (var i in issues)
            {
                if (i.Severity == Severity.Blocking) anyBlocking = true;
                if (i.Severity == Severity.Major) anyMajor = true;
            }
            if (anyBlocking || score < 0.55f) return Tier.Poor;
            if (issues.Count == 0) return Tier.Full;
            if (!anyMajor && score >= 0.85f) return Tier.Good;
            if (score >= 0.55f) return Tier.Partial;
            return Tier.Poor;
        }

        private static void Add(List<Issue> issues, string code, Severity severity, string system, string message)
        {
            issues.Add(new Issue
            {
                Code = code,
                Severity = severity,
                SystemName = system,
                Message = message,
            });
        }

        private static string FingerprintSystem(SystemFeatures f)
        {
            // Identity for dedup: module/feature flags, not transforms or asset names.
            var sb = new StringBuilder(256);
            sb.Append(f.ShapeType).Append('|')
                .Append(f.RenderMode).Append('|')
                .Append(Flag(f.EmissionEnabled))
                .Append(Flag(f.ColorOverLifetime))
                .Append(Flag(f.SizeOverLifetime))
                .Append(Flag(f.SizeOverLifetimeSeparateAxes))
                .Append(Flag(f.RotationOverLifetime))
                .Append(Flag(f.RotationOverLifetime3D))
                .Append(Flag(f.VelocityOverLifetime))
                .Append(Flag(f.InheritVelocity))
                .Append(Flag(f.LimitVelocity))
                .Append(Flag(f.ForceOverLifetime))
                .Append(Flag(f.ForceOverLifetimeWorldSpace))
                .Append(Flag(f.ColorBySpeed))
                .Append(Flag(f.SizeBySpeed))
                .Append(Flag(f.RotationBySpeed))
                .Append(Flag(f.Noise))
                .Append(Flag(f.NoiseHasScrollOrRemap))
                .Append(Flag(f.Collision))
                .Append(Flag(f.Trails))
                .Append(Flag(f.Lights))
                .Append(Flag(f.CustomData))
                .Append(Flag(f.ExternalForces))
                .Append(Flag(f.Triggers))
                .Append(Flag(f.TextureSheet))
                .Append(Flag(f.TextureSheetSprites))
                .Append(Flag(f.TextureSheetSingleRow))
                .Append(Flag(f.SubEmitters))
                .Append(Flag(f.SubEmitterCollisionOrTrigger))
                .Append(Flag(f.TwoCurvesAnywhere))
                .Append(Flag(f.TwoGradientsColorOverLife))
                .Append(Flag(f.MeshShape))
                .Append(Flag(f.MeshRenderer))
                .Append(Flag(f.Gravity));
            return sb.ToString();
        }

        private static char Flag(bool v) => v ? '1' : '0';

        private static string HashJoined(List<string> parts)
        {
            string joined = string.Join("\n", parts);
            using (var sha = SHA1.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(joined));
                var sb = new StringBuilder(16);
                for (int i = 0; i < 8; i++) sb.Append(hash[i].ToString("x2"));
                return sb.ToString();
            }
        }

        private static bool IsTwoCurves(ParticleSystem.MinMaxCurve c) =>
            c.mode == ParticleSystemCurveMode.TwoCurves;

        private static bool HasNonZero(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return Mathf.Abs(c.constant) > 1e-5f;
                case ParticleSystemCurveMode.TwoConstants:
                    return Mathf.Abs(c.constantMin) > 1e-5f || Mathf.Abs(c.constantMax) > 1e-5f;
                default: return true;
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
    }
}
