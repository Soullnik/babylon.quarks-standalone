using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Editor entry point: takes the selected GameObject hierarchy (a ParticleSystem or a parent of
    /// several) and writes a Quarks JSON effect that babylon.quarks' QuarksLoader can load. Groups
    /// map to Group nodes, ParticleSystems to ParticleEmitter nodes; sub-emitters are wired through
    /// EmitSubParticleSystem behaviors.
    /// </summary>
    public static class QuarksExporter
    {
        [MenuItem("Tools/Quarks/Export Selected Effect to JSON", false, 1)]
        public static void ExportSelected()
        {
            GameObject root = Selection.activeGameObject;
            if (root == null)
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    "Select a GameObject with a ParticleSystem (or a parent of several) in the Hierarchy.", "OK");
                return;
            }
            if (root.GetComponentsInChildren<ParticleSystem>(true).Length == 0)
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    "No ParticleSystem found under the selected GameObject.", "OK");
                return;
            }

            string path = EditorUtility.SaveFilePanel("Export Quarks effect", "", root.name + ".json", "json");
            if (string.IsNullOrEmpty(path)) return;

            ExportToFile(root, path);
            EditorUtility.RevealInFinder(path);
        }

        [MenuItem("Tools/Quarks/Export Selected Effect to JSON", true)]
        private static bool ValidateExportSelected() => Selection.activeGameObject != null;

        [MenuItem("Tools/Quarks/Export Folder of Effects to JSON", false, 2)]
        public static void ExportSelectedFolder()
        {
            string assetFolder = GetSelectedAssetFolder();
            if (string.IsNullOrEmpty(assetFolder))
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    "Select a folder under Assets in the Project window.", "OK");
                return;
            }

            string outputFolder = EditorUtility.OpenFolderPanel("Export Quarks effects to", "", "");
            if (string.IsNullOrEmpty(outputFolder)) return;

            ExportFolder(assetFolder, outputFolder);
        }

        [MenuItem("Tools/Quarks/Export Folder of Effects to JSON", true)]
        private static bool ValidateExportSelectedFolder() => !string.IsNullOrEmpty(GetSelectedAssetFolder());

        [MenuItem("Tools/Quarks/Export Folder (Good+ Validity Only)", false, 3)]
        public static void ExportSelectedFolderValidOnly()
        {
            string assetFolder = GetSelectedAssetFolder();
            if (string.IsNullOrEmpty(assetFolder))
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    "Select a folder under Assets in the Project window.", "OK");
                return;
            }

            string outputFolder = EditorUtility.OpenFolderPanel(
                "Export valid Quarks effects to", "", "");
            if (string.IsNullOrEmpty(outputFolder)) return;

            // Full + Good only — skip Partial/Poor so the batch is what we can stand behind.
            ExportFolder(assetFolder, outputFolder, ExportCoverage.Tier.Good, writeReport: true);
        }

        [MenuItem("Tools/Quarks/Export Folder (Good+ Validity Only)", true)]
        private static bool ValidateExportSelectedFolderValidOnly() =>
            !string.IsNullOrEmpty(GetSelectedAssetFolder());

        /// <summary>Writes one effect hierarchy to a JSON file on disk.</summary>
        public static void ExportToFile(GameObject root, string path)
        {
            var assessment = ExportCoverage.Assess(root);
            string json = Export(root);
            File.WriteAllText(path, json);

            string tier = ExportCoverage.TierName(assessment.Tier);
            if (assessment.Issues.Count == 0)
            {
                Debug.Log($"[Quarks Exporter] Exported '{root.name}' → {path} (validity: {tier}, score {assessment.Score:0.00})");
            }
            else
            {
                Debug.LogWarning(
                    $"[Quarks Exporter] Exported '{root.name}' → {path} (validity: {tier}, score {assessment.Score:0.00}, " +
                    $"{assessment.Issues.Count} coverage issue(s) — run Analyze Effect Pack Metadata for details)");
                foreach (var issue in assessment.Issues)
                {
                    Debug.LogWarning(
                        $"[Quarks Exporter]   [{ExportCoverage.SeverityName(issue.Severity)}] " +
                        $"{issue.SystemName}: {issue.Message}");
                }
            }
        }

        /// <summary>
        /// Exports every prefab with a ParticleSystem under <paramref name="assetFolder"/>.
        /// Output mirrors the subfolder layout relative to the selected Assets folder.
        /// </summary>
        public static void ExportFolder(string assetFolder, string outputFolder) =>
            ExportFolder(assetFolder, outputFolder, minTier: null, writeReport: false);

        /// <summary>
        /// Exports particle prefabs under <paramref name="assetFolder"/>, optionally keeping only
        /// effects whose coverage tier is at least <paramref name="minTier"/> (Full ≤ Good ≤ Partial ≤ Poor).
        /// When <paramref name="writeReport"/> is true, writes <c>export-validity-report.json</c>
        /// next to the output with per-effect scores and skip reasons.
        /// </summary>
        public static void ExportFolder(
            string assetFolder,
            string outputFolder,
            ExportCoverage.Tier? minTier,
            bool writeReport)
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

            if (prefabPaths.Count == 0)
            {
                EditorUtility.DisplayDialog("Quarks Exporter",
                    $"No prefabs with ParticleSystem found under '{assetFolder}'.", "OK");
                return;
            }

            prefabPaths.Sort();
            string folderPrefix = assetFolder.EndsWith("/") ? assetFolder : assetFolder + "/";

            int exported = 0;
            int skippedInstantiate = 0;
            int skippedValidity = 0;
            bool cancelled = false;
            var reportEffects = new JArray();

            try
            {
                for (int i = 0; i < prefabPaths.Count; i++)
                {
                    string assetPath = prefabPaths[i];
                    string prefabName = Path.GetFileNameWithoutExtension(assetPath);
                    if (EditorUtility.DisplayCancelableProgressBar(
                            "Quarks Exporter",
                            $"Exporting {prefabName} ({i + 1}/{prefabPaths.Count})",
                            (float)i / prefabPaths.Count))
                    {
                        cancelled = true;
                        break;
                    }

                    GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                    GameObject instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                    if (instance == null)
                    {
                        skippedInstantiate++;
                        continue;
                    }

                    try
                    {
                        var assessment = ExportCoverage.Assess(instance, assetPath);
                        bool export = !minTier.HasValue
                            || ExportCoverage.MeetsMinTier(assessment, minTier.Value);

                        if (writeReport)
                        {
                            reportEffects.Add(new JObject()
                                .Set("path", assessment.AssetPath)
                                .Set("name", assessment.Name)
                                .Set("fingerprint", assessment.Fingerprint)
                                .Set("score", System.Math.Round(assessment.Score, 4))
                                .Set("tier", ExportCoverage.TierName(assessment.Tier))
                                .Set("exported", export));
                        }

                        if (!export)
                        {
                            skippedValidity++;
                            continue;
                        }

                        string relative = assetPath.StartsWith(folderPrefix)
                            ? assetPath.Substring(folderPrefix.Length)
                            : Path.GetFileName(assetPath);
                        string relativeDir = Path.GetDirectoryName(relative);
                        if (!string.IsNullOrEmpty(relativeDir))
                        {
                            relativeDir = relativeDir.Replace('/', Path.DirectorySeparatorChar);
                        }
                        string outDir = string.IsNullOrEmpty(relativeDir)
                            ? outputFolder
                            : Path.Combine(outputFolder, relativeDir);
                        Directory.CreateDirectory(outDir);
                        string outPath = Path.Combine(outDir, prefabName + ".json");
                        ExportToFile(instance, outPath);
                        exported++;
                    }
                    finally
                    {
                        Object.DestroyImmediate(instance);
                    }
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }

            if (writeReport)
            {
                Directory.CreateDirectory(outputFolder);
                var report = new JObject()
                    .Set("metadata", new JObject()
                        .Set("generator", "unity-quark-exporter")
                        .Set("sourceFolder", assetFolder)
                        .Set("minTier", minTier.HasValue
                            ? ExportCoverage.TierName(minTier.Value)
                            : "none"))
                    .Set("summary", new JObject()
                        .Set("exported", exported)
                        .Set("skippedValidity", skippedValidity)
                        .Set("skippedInstantiate", skippedInstantiate)
                        .Set("cancelled", cancelled))
                    .Set("effects", reportEffects);
                File.WriteAllText(
                    Path.Combine(outputFolder, "export-validity-report.json"),
                    report.ToString());
            }

            string message = cancelled
                ? $"Cancelled after exporting {exported} of {prefabPaths.Count} effect(s)."
                : $"Exported {exported} effect(s) to:\n{outputFolder}";
            if (skippedValidity > 0)
            {
                message += $"\n\nSkipped {skippedValidity} prefab(s) below validity tier '{ExportCoverage.TierName(minTier ?? ExportCoverage.Tier.Good)}'.";
            }
            if (skippedInstantiate > 0)
            {
                message += $"\n\nSkipped {skippedInstantiate} prefab(s) that could not be instantiated.";
            }

            EditorUtility.DisplayDialog("Quarks Exporter", message, "OK");
            if (exported > 0 || writeReport)
            {
                EditorUtility.RevealInFinder(outputFolder);
            }
        }

        private static string GetSelectedAssetFolder()
        {
            if (Selection.activeObject == null) return null;
            string path = AssetDatabase.GetAssetPath(Selection.activeObject);
            return AssetDatabase.IsValidFolder(path) ? path : null;
        }

        /// <summary>Serializes a GameObject hierarchy into the Quarks JSON envelope string.</summary>
        public static string Export(GameObject root) => ExportEnvelope(root).ToString();

        /// <summary>Same as <see cref="Export"/> but returns the envelope object (for parity audits).</summary>
        public static JObject ExportEnvelope(GameObject root)
        {
            var ctx = new ExportContext();

            AssignUuids(root.transform, ctx);
            foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
            {
                var sub = ps.subEmitters;
                if (!sub.enabled) continue;
                for (int i = 0; i < sub.subEmittersCount; i++)
                {
                    ctx.MarkSubTarget(sub.GetSubEmitterSystem(i));
                }
            }

            JObject obj = SerializeNode(root.transform, ctx);

            if (ctx.MeshSourceNodes.Count > 0)
            {
                JArray children = obj.GetOrCreateArray("children");
                foreach (var meshNode in ctx.MeshSourceNodes)
                {
                    children.Add(meshNode);
                }
            }

            return new JObject()
                .Set("metadata", new JObject()
                    .Set("version", 4.5)
                    .Set("type", "Object3D")
                    .Set("generator", "unity-quark-exporter"))
                .Set("geometries", ctx.Geometries)
                .Set("materials", ctx.Materials)
                .Set("textures", ctx.Textures)
                .Set("images", ctx.Images)
                .Set("object", obj);
        }

        private static void AssignUuids(Transform t, ExportContext ctx)
        {
            ctx.AssignNodeUuid(t);
            foreach (Transform child in t)
            {
                AssignUuids(child, ctx);
            }
        }

        private static JObject SerializeNode(Transform t, ExportContext ctx)
        {
            var node = new JObject()
                .Set("uuid", ctx.GetTransformUuid(t))
                .Set("name", t.name)
                .Set("layers", 1)
                .Set("matrix", LocalMatrix(t));

            var ps = t.GetComponent<ParticleSystem>();
            if (ps != null)
            {
                var renderer = t.GetComponent<ParticleSystemRenderer>();
                node.Set("type", "ParticleEmitter").Set("ps", ParticleConverter.BuildPs(ps, renderer, ctx));
            }
            else
            {
                node.Set("type", "Group");
            }

            var children = new JArray();
            foreach (Transform child in t)
            {
                children.Add(SerializeNode(child, ctx));
            }
            if (children.Items.Count > 0)
            {
                node.Set("children", children);
            }
            return node;
        }

        /// <summary>Local TRS as a three.js/Babylon column-major 16-float matrix.</summary>
        private static JArray LocalMatrix(Transform t)
        {
            Matrix4x4 m = Matrix4x4.TRS(t.localPosition, t.localRotation, t.localScale);
            var arr = new JArray();
            for (int col = 0; col < 4; col++)
            {
                for (int row = 0; row < 4; row++)
                {
                    arr.Add(m[row, col]);
                }
            }
            return arr;
        }
    }
}
