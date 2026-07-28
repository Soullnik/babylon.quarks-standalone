using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Scans a folder of particle-effect prefabs, collects per-system feature metadata,
    /// deduplicates by fingerprint, and writes a JSON report scored against exporter coverage.
    /// Run this on a large Unity VFX pack (~hundreds of unique effects) to see which gaps
    /// actually block ~90% validity — then fix the exporter against the histogram, not guesses.
    /// </summary>
    public static class EffectPackAnalyzer
    {
        [MenuItem("Tools/Quarks/Analyze Effect Pack Metadata", false, 20)]
        public static void AnalyzeSelectedFolder()
        {
            string assetFolder = GetSelectedAssetFolder();
            if (string.IsNullOrEmpty(assetFolder))
            {
                EditorUtility.DisplayDialog("Quarks Analyzer",
                    "Select a folder under Assets in the Project window (your effect pack root).", "OK");
                return;
            }

            string outPath = EditorUtility.SaveFilePanel(
                "Save effect pack metadata report",
                "",
                "quarks-effect-pack-report.json",
                "json");
            if (string.IsNullOrEmpty(outPath)) return;

            PackReport report = AnalyzeFolder(assetFolder);
            File.WriteAllText(outPath, report.ToJson().ToString());
            EditorUtility.RevealInFinder(outPath);

            EditorUtility.DisplayDialog(
                "Quarks Analyzer",
                FormatSummaryDialog(report),
                "OK");
        }

        [MenuItem("Tools/Quarks/Analyze Effect Pack Metadata", true)]
        private static bool ValidateAnalyzeSelectedFolder() => !string.IsNullOrEmpty(GetSelectedAssetFolder());

        [MenuItem("Tools/Quarks/Dump Conversion for Selected Effect", false, 21)]
        public static void DumpSelectedConversion()
        {
            GameObject root = Selection.activeGameObject;
            if (root == null || root.GetComponentsInChildren<ParticleSystem>(true).Length == 0)
            {
                EditorUtility.DisplayDialog("Quarks Analyzer",
                    "Select a GameObject with a ParticleSystem (or a parent of several).", "OK");
                return;
            }

            string path = EditorUtility.SaveFilePanel(
                "Save conversion dump",
                "",
                root.name + ".conversion.json",
                "json");
            if (string.IsNullOrEmpty(path)) return;

            JObject dump = ConversionDump.ForRoot(root);
            File.WriteAllText(path, dump.ToString());
            EditorUtility.RevealInFinder(path);

            int suspicions = 0;
            foreach (var kv in dump.Members)
            {
                if (kv.Key == "suspicionCount" && kv.Value is JNumber n) suspicions = (int)n.Value;
            }
            EditorUtility.DisplayDialog(
                "Quarks Analyzer",
                suspicions == 0
                    ? $"Wrote conversion dump for '{root.name}' with no suspicions."
                    : $"Wrote conversion dump for '{root.name}' with {suspicions} suspicion(s).\nCheck Console / JSON suspicions[].",
                "OK");

            if (suspicions > 0)
            {
                foreach (var kv in dump.Members)
                {
                    if (kv.Key != "suspicions" || !(kv.Value is JArray arr)) continue;
                    foreach (var item in arr.Items)
                    {
                        if (item is JObject obj)
                        {
                            Debug.LogWarning("[Quarks Conversion] " + obj.ToString());
                        }
                    }
                }
            }
        }

        [MenuItem("Tools/Quarks/Dump Conversion for Selected Effect", true)]
        private static bool ValidateDumpSelectedConversion() =>
            Selection.activeGameObject != null
            && Selection.activeGameObject.GetComponentsInChildren<ParticleSystem>(true).Length > 0;

        /// <summary>Scans every ParticleSystem prefab under <paramref name="assetFolder"/>.</summary>
        public static PackReport AnalyzeFolder(string assetFolder)
        {
            string[] guids = AssetDatabase.FindAssets("t:Prefab", new[] { assetFolder });
            var prefabPaths = new List<string>();
            foreach (string guid in guids)
            {
                string assetPath = AssetDatabase.GUIDToAssetPath(guid);
                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                if (prefab != null && prefab.GetComponentsInChildren<ParticleSystem>(true).Length > 0)
                {
                    prefabPaths.Add(assetPath);
                }
            }
            prefabPaths.Sort(StringComparer.Ordinal);

            var report = new PackReport
            {
                SourceFolder = assetFolder,
                GeneratedAt = DateTime.UtcNow.ToString("o"),
            };

            var uniqueFingerprints = new HashSet<string>();
            var gapUnique = new Dictionary<string, HashSet<string>>();
            var featureCounts = new Dictionary<string, int>();
            var suspicionUnique = new Dictionary<string, HashSet<string>>();
            int effectsWithSuspicions = 0;
            int totalSuspicions = 0;

            try
            {
                for (int i = 0; i < prefabPaths.Count; i++)
                {
                    string assetPath = prefabPaths[i];
                    string name = Path.GetFileNameWithoutExtension(assetPath);
                    if (EditorUtility.DisplayCancelableProgressBar(
                            "Quarks Analyzer",
                            $"Analyzing {name} ({i + 1}/{prefabPaths.Count})",
                            (float)i / Mathf.Max(1, prefabPaths.Count)))
                    {
                        report.Cancelled = true;
                        break;
                    }

                    GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                    GameObject instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                    if (instance == null)
                    {
                        report.Skipped++;
                        continue;
                    }

                    try
                    {
                        var assessment = ExportCoverage.Assess(instance, assetPath);
                        JObject conversion = ConversionDump.ForRoot(instance);
                        int suspicionCount = ReadIntMember(conversion, "suspicionCount");
                        assessment.Conversion = conversion;
                        assessment.SuspicionCount = suspicionCount;

                        report.Effects.Add(assessment);
                        report.PrefabCount++;
                        report.SystemCount += assessment.SystemCount;

                        bool isUnique = uniqueFingerprints.Add(assessment.Fingerprint);
                        if (isUnique) report.UniqueCount++;

                        TallyTiers(report, assessment.Tier);
                        TallyFeatures(featureCounts, assessment);
                        TallyGaps(gapUnique, assessment, isUnique);

                        if (suspicionCount > 0)
                        {
                            effectsWithSuspicions++;
                            totalSuspicions += suspicionCount;
                            TallySuspicions(suspicionUnique, conversion, assessment.Fingerprint, isUnique);
                        }
                    }
                    finally
                    {
                        UnityEngine.Object.DestroyImmediate(instance);
                    }
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }

            report.FeatureHistogram = ToSortedCounts(featureCounts);
            report.GapImpact = BuildGapImpact(gapUnique, report.UniqueCount);
            report.SuspicionImpact = BuildGapImpact(suspicionUnique, report.UniqueCount);
            report.EffectsWithSuspicions = effectsWithSuspicions;
            report.TotalSuspicions = totalSuspicions;
            report.EstimatedExportablePct = ComputeExportablePct(report);
            return report;
        }

        private static void TallySuspicions(
            Dictionary<string, HashSet<string>> suspicionUnique,
            JObject conversion,
            string fingerprint,
            bool isUnique)
        {
            if (!isUnique) return;
            JArray arr = FindArrayMember(conversion, "suspicions");
            if (arr == null) return;
            var seen = new HashSet<string>();
            foreach (var item in arr.Items)
            {
                if (!(item is JObject obj)) continue;
                string code = ReadStringMember(obj, "code");
                if (string.IsNullOrEmpty(code) || !seen.Add(code)) continue;
                if (!suspicionUnique.TryGetValue(code, out var set))
                {
                    set = new HashSet<string>();
                    suspicionUnique[code] = set;
                }
                set.Add(fingerprint);
            }
        }

        private static JArray FindArrayMember(JObject obj, string key)
        {
            foreach (var kv in obj.Members)
            {
                if (kv.Key == key && kv.Value is JArray arr) return arr;
            }
            return null;
        }

        private static int ReadIntMember(JObject obj, string key)
        {
            foreach (var kv in obj.Members)
            {
                if (kv.Key == key && kv.Value is JNumber n) return (int)n.Value;
            }
            return 0;
        }

        private static string ReadStringMember(JObject obj, string key)
        {
            foreach (var kv in obj.Members)
            {
                if (kv.Key != key) continue;
                if (kv.Value is JString s) return s.Value;
                if (kv.Value is JNull || kv.Value == null) return null;
                return kv.Value.ToString();
            }
            return null;
        }

        private static void TallyTier(PackReport report, ExportCoverage.Tier tier)
        {
            switch (tier)
            {
                case ExportCoverage.Tier.Full: report.FullCount++; break;
                case ExportCoverage.Tier.Good: report.GoodCount++; break;
                case ExportCoverage.Tier.Partial: report.PartialCount++; break;
                default: report.PoorCount++; break;
            }
        }

        private static void TallyFeatures(Dictionary<string, int> counts, ExportCoverage.EffectAssessment a)
        {
            foreach (var s in a.Systems)
            {
                Bump(counts, "shape." + s.ShapeType);
                Bump(counts, "render." + s.RenderMode);
                if (s.ColorOverLifetime) Bump(counts, "module.colorOverLifetime");
                if (s.SizeOverLifetime) Bump(counts, "module.sizeOverLifetime");
                if (s.RotationOverLifetime) Bump(counts, "module.rotationOverLifetime");
                if (s.VelocityOverLifetime) Bump(counts, "module.velocityOverLifetime");
                if (s.InheritVelocity) Bump(counts, "module.inheritVelocity");
                if (s.LimitVelocity) Bump(counts, "module.limitVelocity");
                if (s.ForceOverLifetime) Bump(counts, "module.forceOverLifetime");
                if (s.ColorBySpeed) Bump(counts, "module.colorBySpeed");
                if (s.SizeBySpeed) Bump(counts, "module.sizeBySpeed");
                if (s.RotationBySpeed) Bump(counts, "module.rotationBySpeed");
                if (s.Noise) Bump(counts, "module.noise");
                if (s.Collision) Bump(counts, "module.collision");
                if (s.Trails) Bump(counts, "module.trails");
                if (s.Lights) Bump(counts, "module.lights");
                if (s.CustomData) Bump(counts, "module.customData");
                if (s.ExternalForces) Bump(counts, "module.externalForces");
                if (s.Triggers) Bump(counts, "module.triggers");
                if (s.TextureSheet) Bump(counts, "module.textureSheet");
                if (s.TextureSheetSprites) Bump(counts, "tsa.sprites");
                if (s.TextureSheetSingleRow) Bump(counts, "tsa.singleRow");
                if (s.SubEmitters) Bump(counts, "module.subEmitters");
                if (s.TwoCurvesAnywhere) Bump(counts, "curve.twoCurves");
                if (s.TwoGradientsColorOverLife) Bump(counts, "color.twoGradients");
                if (s.MeshShape) Bump(counts, "shape.mesh");
                if (s.MeshRenderer) Bump(counts, "render.mesh");
                if (s.Gravity) Bump(counts, "main.gravity");
            }
        }

        private static void TallyGaps(
            Dictionary<string, HashSet<string>> gapUnique,
            ExportCoverage.EffectAssessment a,
            bool isUnique)
        {
            if (!isUnique) return;
            var seen = new HashSet<string>();
            foreach (var issue in a.Issues)
            {
                if (!seen.Add(issue.Code)) continue;
                if (!gapUnique.TryGetValue(issue.Code, out var set))
                {
                    set = new HashSet<string>();
                    gapUnique[issue.Code] = set;
                }
                set.Add(a.Fingerprint);
            }
        }

        private static List<KeyValuePair<string, int>> ToSortedCounts(Dictionary<string, int> counts)
        {
            var list = new List<KeyValuePair<string, int>>(counts);
            list.Sort((a, b) =>
            {
                int cmp = b.Value.CompareTo(a.Value);
                return cmp != 0 ? cmp : string.CompareOrdinal(a.Key, b.Key);
            });
            return list;
        }

        private static List<GapImpactRow> BuildGapImpact(
            Dictionary<string, HashSet<string>> gapUnique,
            int uniqueTotal)
        {
            var rows = new List<GapImpactRow>();
            foreach (var kv in gapUnique)
            {
                rows.Add(new GapImpactRow
                {
                    Code = kv.Key,
                    AffectedUnique = kv.Value.Count,
                    PctOfUnique = uniqueTotal > 0 ? (100f * kv.Value.Count / uniqueTotal) : 0f,
                });
            }
            rows.Sort((a, b) =>
            {
                int cmp = b.AffectedUnique.CompareTo(a.AffectedUnique);
                return cmp != 0 ? cmp : string.CompareOrdinal(a.Code, b.Code);
            });
            return rows;
        }

        /// <summary>
        /// Exportable ≈ Full + Good + Partial-without-blocking intent.
        /// Full+Good are counted as valid; Partial contributes half toward the 90% target.
        /// </summary>
        private static float ComputeExportablePct(PackReport report)
        {
            int n = report.PrefabCount;
            if (n == 0) return 0f;
            float weighted = report.FullCount + report.GoodCount + report.PartialCount * 0.5f;
            return 100f * weighted / n;
        }

        private static void Bump(Dictionary<string, int> counts, string key)
        {
            counts.TryGetValue(key, out int n);
            counts[key] = n + 1;
        }

        private static string GetSelectedAssetFolder()
        {
            if (Selection.activeObject == null) return null;
            string path = AssetDatabase.GetAssetPath(Selection.activeObject);
            return AssetDatabase.IsValidFolder(path) ? path : null;
        }

        private static string FormatSummaryDialog(PackReport report)
        {
            return
                $"Prefabs: {report.PrefabCount}  |  Unique fingerprints: {report.UniqueCount}\n" +
                $"Systems: {report.SystemCount}\n\n" +
                $"Validity tiers:\n" +
                $"  full     {report.FullCount}\n" +
                $"  good     {report.GoodCount}\n" +
                $"  partial  {report.PartialCount}\n" +
                $"  poor     {report.PoorCount}\n\n" +
                $"Conversion suspicions: {report.TotalSuspicions} across {report.EffectsWithSuspicions} effect(s)\n" +
                $"Estimated exportable: {report.EstimatedExportablePct:0.0}%\n" +
                $"(full+good + ½·partial)\n\n" +
                TopGapsText(report, 6) + "\n\n" +
                TopSuspicionsText(report, 6) +
                (report.Cancelled ? "\n\n(Scan was cancelled early.)" : "");
        }

        private static string TopGapsText(PackReport report, int max)
        {
            if (report.GapImpact.Count == 0) return "No coverage gaps found.";
            var lines = new List<string> { "Top coverage gaps by unique effects:" };
            int n = Mathf.Min(max, report.GapImpact.Count);
            for (int i = 0; i < n; i++)
            {
                var g = report.GapImpact[i];
                lines.Add($"  {g.Code}: {g.AffectedUnique} ({g.PctOfUnique:0.0}%)");
            }
            return string.Join("\n", lines);
        }

        private static string TopSuspicionsText(PackReport report, int max)
        {
            if (report.SuspicionImpact.Count == 0) return "No conversion suspicions found.";
            var lines = new List<string> { "Top conversion suspicions by unique effects:" };
            int n = Mathf.Min(max, report.SuspicionImpact.Count);
            for (int i = 0; i < n; i++)
            {
                var g = report.SuspicionImpact[i];
                lines.Add($"  {g.Code}: {g.AffectedUnique} ({g.PctOfUnique:0.0}%)");
            }
            return string.Join("\n", lines);
        }

        // ---- report model ---------------------------------------------------------------

        public sealed class GapImpactRow
        {
            public string Code;
            public int AffectedUnique;
            public float PctOfUnique;
        }

        public sealed class PackReport
        {
            public string SourceFolder;
            public string GeneratedAt;
            public bool Cancelled;
            public int PrefabCount;
            public int UniqueCount;
            public int SystemCount;
            public int Skipped;
            public int FullCount;
            public int GoodCount;
            public int PartialCount;
            public int PoorCount;
            public int EffectsWithSuspicions;
            public int TotalSuspicions;
            public float EstimatedExportablePct;
            public List<KeyValuePair<string, int>> FeatureHistogram = new List<KeyValuePair<string, int>>();
            public List<GapImpactRow> GapImpact = new List<GapImpactRow>();
            public List<GapImpactRow> SuspicionImpact = new List<GapImpactRow>();
            public List<ExportCoverage.EffectAssessment> Effects = new List<ExportCoverage.EffectAssessment>();

            /// <summary>Builds the JSON report object written to disk.</summary>
            public JObject ToJson()
            {
                var histogram = new JObject();
                foreach (var kv in FeatureHistogram) histogram.Set(kv.Key, kv.Value);

                var gaps = new JArray();
                foreach (var g in GapImpact)
                {
                    gaps.Add(new JObject()
                        .Set("code", g.Code)
                        .Set("affectedUnique", g.AffectedUnique)
                        .Set("pctOfUnique", Math.Round(g.PctOfUnique, 2)));
                }

                var suspicions = new JArray();
                foreach (var g in SuspicionImpact)
                {
                    suspicions.Add(new JObject()
                        .Set("code", g.Code)
                        .Set("affectedUnique", g.AffectedUnique)
                        .Set("pctOfUnique", Math.Round(g.PctOfUnique, 2)));
                }

                var effects = new JArray();
                foreach (var e in Effects)
                {
                    var issues = new JArray();
                    foreach (var issue in e.Issues)
                    {
                        issues.Add(new JObject()
                            .Set("code", issue.Code)
                            .Set("severity", ExportCoverage.SeverityName(issue.Severity))
                            .Set("system", issue.SystemName)
                            .Set("message", issue.Message));
                    }

                    var systems = new JArray();
                    foreach (var s in e.Systems)
                    {
                        systems.Add(new JObject()
                            .Set("name", s.Name)
                            .Set("shape", s.ShapeType)
                            .Set("renderMode", s.RenderMode)
                            .Set("trails", s.Trails)
                            .Set("noise", s.Noise)
                            .Set("textureSheet", s.TextureSheet)
                            .Set("subEmitters", s.SubEmitters)
                            .Set("twoCurves", s.TwoCurvesAnywhere));
                    }

                    // Full unity↔exported dump only when something looks wrong — keeps pack
                    // reports readable. Clean effects still get suspicionCount=0.
                    var effectObj = new JObject()
                        .Set("path", e.AssetPath)
                        .Set("name", e.Name)
                        .Set("fingerprint", e.Fingerprint)
                        .Set("systemCount", e.SystemCount)
                        .Set("score", Math.Round(e.Score, 4))
                        .Set("tier", ExportCoverage.TierName(e.Tier))
                        .Set("suspicionCount", e.SuspicionCount)
                        .Set("issues", issues)
                        .Set("systems", systems);
                    if (e.SuspicionCount > 0 && e.Conversion != null)
                    {
                        effectObj.Set("conversion", e.Conversion);
                    }
                    effects.Add(effectObj);
                }

                return new JObject()
                    .Set("metadata", new JObject()
                        .Set("generator", "unity-quark-exporter-analyzer")
                        .Set("version", 2)
                        .Set("generatedAt", GeneratedAt)
                        .Set("sourceFolder", SourceFolder)
                        .Set("cancelled", Cancelled))
                    .Set("summary", new JObject()
                        .Set("prefabCount", PrefabCount)
                        .Set("uniqueFingerprints", UniqueCount)
                        .Set("particleSystemCount", SystemCount)
                        .Set("skipped", Skipped)
                        .Set("estimatedExportablePct", Math.Round(EstimatedExportablePct, 2))
                        .Set("effectsWithSuspicions", EffectsWithSuspicions)
                        .Set("totalSuspicions", TotalSuspicions)
                        .Set("tiers", new JObject()
                            .Set("full", FullCount)
                            .Set("good", GoodCount)
                            .Set("partial", PartialCount)
                            .Set("poor", PoorCount)))
                    .Set("featureHistogram", histogram)
                    .Set("gapImpact", gaps)
                    .Set("suspicionImpact", suspicions)
                    .Set("effects", effects);
            }
        }
    }
}
