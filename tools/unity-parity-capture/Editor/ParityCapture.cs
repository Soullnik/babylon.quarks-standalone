using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using BabylonQuarks.UnityExporter;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BabylonQuarks.ParityCapture
{
    internal sealed class ParitySettings
    {
        public string AssetFolder;
        public string OutputRoot;
        public int Resolution = 512;
        public int Frames = 24;
        public int GrayKeyframes = 4;
        /// <summary>Frames per second of each system rendered on its own; 0 leaves that out.</summary>
        public float SoloFps = 12f;
        public float CsvRate = 30f;
        public int SnapshotCap = 1500;
        public uint Seed = 12345;
        public int MaxVolumeProfiles = 2;
        public long MaxAssetBytes = 400L * 1024 * 1024;

        public JMap ToJson() => new JMap()
            .Set("assetFolder", AssetFolder).Set("resolution", Resolution).Set("frames", Frames)
            .Set("grayKeyframes", GrayKeyframes).Set("soloFps", SoloFps).Set("csvRate", CsvRate).Set("snapshotCap", SnapshotCap)
            .Set("seed", Seed).Set("maxVolumeProfiles", MaxVolumeProfiles).Set("maxAssetBytes", MaxAssetBytes);
    }

    /// <summary>
    /// Collects everything needed to compare a folder of Unity particle effects with babylon.quarks,
    /// from Unity itself, into one archive: exports, project and material ground truth, a measured
    /// blend per material, deterministic simulation data and rendered frames.
    ///
    /// Menu: select a folder in the Project window, then Tools → Quarks → Capture Parity Data.
    /// Batch: Unity -batchmode -projectPath &lt;project&gt; -executeMethod
    ///   BabylonQuarks.ParityCapture.ParityCaptureTool.RunBatch
    ///   -quarksParityFolder "Assets/…" -quarksParityOut "&lt;dir&gt;" [-quarksParityResolution 512] [-quarksParityFrames 24]
    ///   [-quarksParitySoloFps 12]
    ///   (do not pass -nographics: the frames and the blend probe need a GPU).
    /// </summary>
    public static class ParityCaptureTool
    {
        public const string Version = "1";

        [MenuItem("Tools/Quarks/Capture Parity Data (selected folder)…", false, 20)]
        public static void CaptureSelectedFolder()
        {
            string folder = SelectedFolder();
            if (folder == null)
            {
                EditorUtility.DisplayDialog("Quarks Parity Capture",
                    "Select a folder under Assets in the Project window — every prefab with a ParticleSystem inside it is captured.", "OK");
                return;
            }
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            string output = EditorUtility.OpenFolderPanel("Where to write the parity archive", "", "");
            if (string.IsNullOrEmpty(output)) return;

            SceneSetup[] scenes = EditorSceneManager.GetSceneManagerSetup();
            string archive = null;
            try
            {
                archive = Run(new ParitySettings { AssetFolder = folder, OutputRoot = output }, interactive: true);
            }
            finally
            {
                EditorUtility.ClearProgressBar();
                RestoreScenes(scenes);
            }
            if (archive != null)
            {
                EditorUtility.RevealInFinder(archive);
                EditorUtility.DisplayDialog("Quarks Parity Capture", "Done:\n" + archive, "OK");
            }
        }

        [MenuItem("Tools/Quarks/Capture Parity Data (selected folder)…", true)]
        private static bool ValidateCaptureSelectedFolder() => SelectedFolder() != null;

        /// <summary>Entry point for -executeMethod. Exits the editor with 0 on success, 1 on failure.</summary>
        public static void RunBatch()
        {
            int exitCode = 1;
            try
            {
                string[] args = Environment.GetCommandLineArgs();
                var settings = new ParitySettings
                {
                    AssetFolder = Arg(args, "-quarksParityFolder"),
                    OutputRoot = Arg(args, "-quarksParityOut"),
                };
                if (int.TryParse(Arg(args, "-quarksParityResolution"), NumberStyles.Integer, CultureInfo.InvariantCulture, out int res)) settings.Resolution = res;
                if (int.TryParse(Arg(args, "-quarksParityFrames"), NumberStyles.Integer, CultureInfo.InvariantCulture, out int frames)) settings.Frames = frames;
                if (float.TryParse(Arg(args, "-quarksParitySoloFps"), NumberStyles.Float, CultureInfo.InvariantCulture, out float soloFps)) settings.SoloFps = soloFps;
                if (string.IsNullOrEmpty(settings.AssetFolder) || string.IsNullOrEmpty(settings.OutputRoot))
                {
                    Debug.LogError("[Quarks Parity] Pass -quarksParityFolder \"Assets/…\" and -quarksParityOut \"<dir>\".");
                }
                else if (Run(settings, interactive: false) != null)
                {
                    exitCode = 0;
                }
            }
            catch (Exception e)
            {
                Debug.LogException(e);
            }
            EditorApplication.Exit(exitCode);
        }

        private static string Arg(string[] args, string name)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == name) return args[i + 1];
            }
            return null;
        }

        private static string SelectedFolder()
        {
            if (Selection.activeObject == null) return null;
            string path = AssetDatabase.GetAssetPath(Selection.activeObject);
            return AssetDatabase.IsValidFolder(path) ? path : null;
        }

        private static void RestoreScenes(SceneSetup[] scenes)
        {
            if (scenes == null || scenes.Length == 0 || scenes.Any(s => string.IsNullOrEmpty(s.path)))
            {
                EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                return;
            }
            EditorSceneManager.RestoreSceneManagerSetup(scenes);
        }

        // ---- the capture ----------------------------------------------------------------------

        internal static string Run(ParitySettings settings, bool interactive)
        {
            string stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture);
            string outDir = Path.Combine(settings.OutputRoot, "QuarksParity_" + stamp);
            Directory.CreateDirectory(outDir);

            var manifest = new JMap()
                .Set("tool", "BabylonQuarks.ParityCapture")
                .Set("version", Version)
                .Set("started", DateTime.Now.ToString("o", CultureInfo.InvariantCulture))
                .Set("settings", settings.ToJson());
            JMap steps = manifest.Map("steps");
            var effects = new List<object>();
            manifest.Set("effects", effects);

            using (var log = new ParityLog())
            {
                log.Note("output: " + outDir);
                try
                {
                    Execute(settings, interactive, outDir, manifest, steps, effects, log);
                }
                catch (OperationCanceledException)
                {
                    manifest.Set("cancelled", true);
                    log.Note("cancelled by the user; writing what was captured so far");
                }
                finally
                {
                    manifest.Set("cameraRenderPath", OffscreenRender.PathName);
                    manifest.Set("finished", DateTime.Now.ToString("o", CultureInfo.InvariantCulture))
                        .Set("errors", log.Errors).Set("warnings", log.Warnings);
                    PJson.Write(Path.Combine(outDir, "manifest.json"), manifest);
                    File.WriteAllText(Path.Combine(outDir, "README.txt"), Readme(), new UTF8Encoding(false));
                    log.WriteTo(Path.Combine(outDir, "log.txt"));
                }
            }

            string zip = TryZip(outDir);
            return zip ?? outDir;
        }

        private static void Execute(ParitySettings settings, bool interactive, string outDir, JMap manifest,
            JMap steps, List<object> effects, ParityLog log)
        {
            Action<string, float> progress = (text, t) =>
            {
                if (interactive && EditorUtility.DisplayCancelableProgressBar("Quarks Parity Capture", text, t))
                {
                    throw new OperationCanceledException();
                }
            };

            progress("Environment", 0f);
            JMap environment = null;
            log.Step("environment", steps, () =>
            {
                environment = ParityEnvironment.Capture(log);
                PJson.Write(Path.Combine(outDir, "environment.json"), environment);
                ParityEnvironment.CopyProjectSettings(outDir);
            });

            var prefabs = new List<string>();
            log.Step("discover", steps, () =>
            {
                foreach (string guid in AssetDatabase.FindAssets("t:Prefab", new[] { settings.AssetFolder }))
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    if (prefab != null && prefab.GetComponentsInChildren<ParticleSystem>(true).Length > 0) prefabs.Add(path);
                }
                prefabs.Sort(StringComparer.Ordinal);
                manifest.Set("prefabs", prefabs.ToArray());
                log.Note("prefabs with a ParticleSystem: " + prefabs.Count);
            });
            if (prefabs.Count == 0) return;

            progress("Copying assets", 0.02f);
            log.Step("assets", steps, () => manifest.Set("assets", CopyDependencies(prefabs, outDir, settings.MaxAssetBytes, log)));

            // Materials, measured in a scene of their own.
            var materials = new Dictionary<string, Material>();
            foreach (string path in prefabs)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                foreach (ParticleSystemRenderer r in prefab.GetComponentsInChildren<ParticleSystemRenderer>(true))
                {
                    foreach (Material m in r.sharedMaterials.Concat(new[] { r.trailMaterial }))
                    {
                        if (m != null) materials[ParityMaterials.Id(m)] = m;
                    }
                }
            }
            string materialsDir = Path.Combine(outDir, "materials");
            Directory.CreateDirectory(materialsDir);
            var materialIndex = new List<object>();
            manifest.Set("materials", materialIndex);
            log.Step("materials", steps, () =>
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                using (var rig = new ParityProbeRig())
                {
                    int i = 0;
                    foreach (var kv in materials)
                    {
                        progress("Material " + kv.Value.name, 0.05f + 0.1f * i++ / Math.Max(1, materials.Count));
                        var entry = new JMap().Set("id", kv.Key).Set("name", kv.Value.name);
                        materialIndex.Add(entry);
                        log.Step("material " + kv.Key, entry, () =>
                        {
                            JMap description = ParityMaterials.Describe(kv.Value, log);
                            log.Step("probe", description, () => description.Set("measuredBlend", ParityMaterials.Probe(kv.Value, rig, log)));
                            PJson.Write(Path.Combine(materialsDir, kv.Key + ".json"), description);
                        });
                    }
                }
            });

            // Effects, in a capture scene with our camera, light and optional post-processing.
            log.Step("effects", steps, () =>
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                OffscreenRender.Reset();
                using (var render = new ParityRender(settings.Resolution))
                {
                    List<RenderVariant> variants = Variants(render, settings, manifest, log);
                    var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < prefabs.Count; i++)
                    {
                        string path = prefabs[i];
                        string folderName = UniqueFolderName(Path.GetFileNameWithoutExtension(path), usedNames);
                        var entry = new JMap().Set("prefab", path).Set("folder", "effects/" + folderName);
                        effects.Add(entry);
                        float from = 0.15f + 0.85f * i / prefabs.Count;
                        float span = 0.85f / prefabs.Count;
                        log.Step("effect " + folderName, entry, () =>
                            CaptureEffect(path, Path.Combine(outDir, "effects", folderName), settings, render, variants, entry, log,
                                (text, t) => progress(folderName + ": " + text, from + span * t)));
                    }
                }
            });
        }

        private static List<RenderVariant> Variants(ParityRender render, ParitySettings settings, JMap manifest, ParityLog log)
        {
            var variants = new List<RenderVariant>
            {
                new RenderVariant { Id = "raw_black", Background = Color.black },
                new RenderVariant { Id = "raw_gray", Background = new Color(0.5f, 0.5f, 0.5f, 1f), KeyframesOnly = true },
            };
            if (render.SupportsVolumes)
            {
                int k = 0;
                foreach (string guid in AssetDatabase.FindAssets("t:VolumeProfile"))
                {
                    if (k >= settings.MaxVolumeProfiles) break;
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    UnityEngine.Object profile = AssetDatabase.LoadMainAssetAtPath(path);
                    if (profile == null) continue;
                    variants.Add(new RenderVariant
                    {
                        Id = "post_" + k, Background = Color.black, PostProcessing = true, VolumeProfile = profile,
                    });
                    k++;
                }
                if (k == 0)
                {
                    variants.Add(new RenderVariant { Id = "post_pipeline", Background = Color.black, PostProcessing = true });
                }
            }
            else
            {
                log.Note("no Volume type (not a scriptable render pipeline project): post-processed variants skipped");
            }
            manifest.Set("variants", variants.Select(v => (object)new JMap()
                .Set("id", v.Id).Set("background", v.Background).Set("postProcessing", v.PostProcessing)
                .Set("volumeProfile", SerializedDump.Reference(v.VolumeProfile)).Set("keyframesOnly", v.KeyframesOnly)).ToList());
            return variants;
        }

        private static void CaptureEffect(string prefabPath, string dir, ParitySettings settings, ParityRender render,
            List<RenderVariant> variants, JMap entry, ParityLog log, Action<string, float> progress)
        {
            Directory.CreateDirectory(dir);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            var instance = PrefabUtility.InstantiatePrefab(prefab, EditorSceneManager.GetActiveScene()) as GameObject;
            if (instance == null) throw new InvalidOperationException("could not instantiate " + prefabPath);
            try
            {
                progress("export", 0f);
                log.Step("export", entry, () =>
                {
                    log.BeginCapture();
                    try
                    {
                        File.WriteAllText(Path.Combine(dir, "effect.json"), QuarksExporter.Export(instance), new UTF8Encoding(false));
                    }
                    finally
                    {
                        File.WriteAllText(Path.Combine(dir, "export-log.txt"), log.EndCapture(), new UTF8Encoding(false));
                    }
                });

                log.Step("renderers", entry, () => PJson.Write(Path.Combine(dir, "renderers.json"), Renderers(instance)));

                var sim = new ParitySimulation(instance, settings.Seed);
                PJson.Write(Path.Combine(dir, "simulation.json"), sim.Describe());

                Bounds bounds = new Bounds(instance.transform.position, Vector3.one);
                progress("simulation", 0.05f);
                log.Step("simulationCsv", entry, () =>
                    bounds = sim.WriteCsv(Path.Combine(dir, "simulation.csv"), settings.CsvRate, t => progress("simulation", 0.05f + 0.25f * t)));
                if (bounds.size == Vector3.zero) bounds = new Bounds(bounds.center, Vector3.one);

                log.Step("snapshots", entry, () =>
                {
                    var snapshots = new List<object>();
                    foreach (float f in new[] { 0.25f, 0.5f, 1f })
                    {
                        snapshots.Add(sim.Snapshot(sim.Duration * f, settings.SnapshotCap));
                    }
                    PJson.Write(Path.Combine(dir, "snapshots.json"), snapshots);
                });

                JMap camera = render.Frame(bounds);
                var frameTimes = new float[settings.Frames];
                for (int k = 0; k < settings.Frames; k++) frameTimes[k] = sim.Duration * (k + 1) / settings.Frames;
                camera.Set("frameTimes", frameTimes);
                var variantInfo = new JMap();
                camera.Set("variants", variantInfo);

                for (int v = 0; v < variants.Count; v++)
                {
                    RenderVariant variant = variants[v];
                    float vFrom = 0.3f + 0.7f * v / variants.Count;
                    log.Step("frames " + variant.Id, entry, () =>
                    {
                        string framesDir = Path.Combine(dir, "frames", variant.Id);
                        Directory.CreateDirectory(framesDir);
                        JMap applied = render.Apply(variant);

                        instance.SetActive(false);
                        Color32[] empty = render.Render();
                        instance.SetActive(true);

                        var indices = new List<int>();
                        if (variant.KeyframesOnly)
                        {
                            for (int k = 1; k <= settings.GrayKeyframes; k++)
                            {
                                indices.Add(Math.Max(0, frameTimes.Length * k / settings.GrayKeyframes - 1));
                            }
                        }
                        else
                        {
                            for (int k = 0; k < frameTimes.Length; k++) indices.Add(k);
                        }

                        var sheet = new List<Color32[]>();
                        var coverage = new List<object>();
                        var times = new List<object>();
                        foreach (int k in indices)
                        {
                            progress("frames " + variant.Id, vFrom + 0.7f / variants.Count * sheet.Count / indices.Count);
                            sim.SimulateTo(frameTimes[k]);
                            string file = Path.Combine(framesDir, k.ToString("000", CultureInfo.InvariantCulture) + ".png");
                            sheet.Add(render.Capture(file, empty, out double cov));
                            coverage.Add(PJson.Round(cov, 4));
                            times.Add(PJson.Round(frameTimes[k], 4));
                        }
                        ParityRender.ContactSheet(Path.Combine(dir, "contact_" + variant.Id + ".png"), sheet, render.Resolution);
                        variantInfo.Set(variant.Id, new JMap().Set("applied", applied).Set("frameIndices", indices.ToArray())
                            .Set("times", times).Set("coverage", coverage));
                        if (coverage.All(c => Convert.ToDouble(c, CultureInfo.InvariantCulture) == 0.0))
                        {
                            Debug.LogWarning("[Quarks Parity] " + variant.Id + ": every frame is identical to the empty view — nothing rendered.");
                        }
                    });
                }
                if (settings.SoloFps > 0f)
                {
                    log.Step("solo", entry, () => CaptureSolo(instance, dir, settings, render, variants, sim, camera, progress));
                }
                PJson.Write(Path.Combine(dir, "camera.json"), camera);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(instance);
            }
        }

        /// <summary>
        /// Each system on its own: every other renderer off, the simulation untouched, through the
        /// same camera — at <see cref="ParitySettings.SoloFps"/> over black and at a few keyframes over
        /// grey. What one layer of an effect looks like, and how it changes from frame to frame,
        /// without the others drawn over it. Written to solo/&lt;system&gt;/&lt;variant&gt;/NNN.png and
        /// described under "solo" in camera.json.
        /// </summary>
        private static void CaptureSolo(GameObject instance, string dir, ParitySettings settings, ParityRender render,
            List<RenderVariant> variants, ParitySimulation sim, JMap camera, Action<string, float> progress)
        {
            ParticleSystem[] systems = instance.GetComponentsInChildren<ParticleSystem>(true);
            var renderers = systems.Select(s => s.GetComponent<ParticleSystemRenderer>()).ToArray();
            var drawn = renderers.Select(r => r != null && r.enabled).ToArray();
            int count = Math.Max(1, (int)Math.Floor(sim.Duration * settings.SoloFps + 1e-4));
            var times = new float[count];
            for (int k = 0; k < count; k++) times[k] = (k + 1) / settings.SoloFps;
            var soloVariants = variants.Where(v => !v.PostProcessing).ToList();
            var list = new List<object>();
            try
            {
                for (int i = 0; i < systems.Length; i++)
                {
                    // A system Unity draws nothing for has nothing to show on its own.
                    if (!drawn[i]) continue;
                    for (int j = 0; j < renderers.Length; j++)
                    {
                        if (renderers[j] != null) renderers[j].enabled = j == i;
                    }
                    var variantInfo = new JMap();
                    foreach (RenderVariant variant in soloVariants)
                    {
                        progress("solo " + i + " " + variant.Id, 0.95f);
                        string framesDir = Path.Combine(dir, "solo", i.ToString(CultureInfo.InvariantCulture), variant.Id);
                        Directory.CreateDirectory(framesDir);
                        render.Apply(variant);
                        instance.SetActive(false);
                        Color32[] empty = render.Render();
                        instance.SetActive(true);
                        var indices = new List<int>();
                        if (variant.KeyframesOnly)
                        {
                            for (int k = 1; k <= settings.GrayKeyframes; k++) indices.Add(Math.Max(0, count * k / settings.GrayKeyframes - 1));
                        }
                        else
                        {
                            for (int k = 0; k < count; k++) indices.Add(k);
                        }
                        var coverage = new List<object>();
                        foreach (int k in indices)
                        {
                            sim.SimulateTo(times[k]);
                            render.Capture(Path.Combine(framesDir, k.ToString("000", CultureInfo.InvariantCulture) + ".png"), empty, out double cov);
                            coverage.Add(PJson.Round(cov, 4));
                        }
                        variantInfo.Set(variant.Id, new JMap().Set("frameIndices", indices.ToArray()).Set("coverage", coverage));
                    }
                    list.Add(new JMap()
                        .Set("system", i)
                        .Set("path", sim.PathOf(systems[i].transform))
                        .Set("variants", variantInfo));
                }
            }
            finally
            {
                for (int j = 0; j < renderers.Length; j++)
                {
                    if (renderers[j] != null) renderers[j].enabled = drawn[j];
                }
            }
            camera.Set("solo", new JMap()
                .Set("fps", settings.SoloFps)
                .Set("times", times.Select(t => (object)PJson.Round(t, 4)).ToList())
                .Set("systems", list));
        }

        /// <summary>Which materials each system renders with, by the ids used in materials/.</summary>
        private static List<object> Renderers(GameObject instance)
        {
            var list = new List<object>();
            ParticleSystem[] systems = instance.GetComponentsInChildren<ParticleSystem>(true);
            for (int i = 0; i < systems.Length; i++)
            {
                var r = systems[i].GetComponent<ParticleSystemRenderer>();
                var entry = new JMap().Set("system", i);
                if (r != null)
                {
                    entry.Set("enabled", r.enabled)
                        .Set("renderMode", r.renderMode.ToString())
                        .Set("materials", r.sharedMaterials.Select(m => m == null ? null : (object)ParityMaterials.Id(m)).ToList())
                        .Set("trailMaterial", r.trailMaterial == null ? null : ParityMaterials.Id(r.trailMaterial));
                    var streams = new List<ParticleSystemVertexStream>();
                    r.GetActiveVertexStreams(streams);
                    entry.Set("activeVertexStreams", streams.Select(s => (object)s.ToString()).ToList());
                    entry.Set("serialized", SerializedDump.Dump(r, descend: p => !p.StartsWith("m_Mesh")));
                }
                list.Add(entry);
            }
            return list;
        }

        private static JMap CopyDependencies(List<string> prefabs, string outDir, long maxBytes, ParityLog log)
        {
            var deps = new SortedSet<string>(StringComparer.Ordinal);
            foreach (string prefab in prefabs)
            {
                foreach (string d in AssetDatabase.GetDependencies(prefab, true)) deps.Add(d);
            }
            long total = 0;
            int copied = 0;
            var skipped = new List<object>();
            foreach (string asset in deps)
            {
                // Code is not needed to reproduce a look; identified by what the asset is, not its extension.
                Type type = AssetDatabase.GetMainAssetTypeAtPath(asset);
                if (type == typeof(MonoScript) || AssetImporter.GetAtPath(asset) is PluginImporter) continue;
                string source = Path.GetFullPath(asset);
                if (!File.Exists(source))
                {
                    skipped.Add(new JMap().Set("asset", asset).Set("reason", "no file on disk (built-in)"));
                    continue;
                }
                long size = new FileInfo(source).Length;
                if (total + size > maxBytes)
                {
                    skipped.Add(new JMap().Set("asset", asset).Set("reason", "archive size limit"));
                    continue;
                }
                string target = Path.Combine(outDir, "assets", asset);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                File.Copy(source, target, true);
                if (File.Exists(source + ".meta")) File.Copy(source + ".meta", target + ".meta", true);
                total += size;
                copied++;
            }
            log.Note("assets copied: " + copied + ", bytes: " + total + ", skipped: " + skipped.Count);
            return new JMap().Set("dependencies", deps.Count).Set("copied", copied).Set("bytes", total).Set("skipped", skipped);
        }

        private static string UniqueFolderName(string label, HashSet<string> used)
        {
            var sb = new StringBuilder();
            foreach (char c in label) sb.Append(Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 ? '_' : c);
            string name = sb.Length == 0 ? "effect" : sb.ToString();
            string candidate = name;
            for (int n = 2; !used.Add(candidate); n++) candidate = name + "_" + n;
            return candidate;
        }

        /// <summary>
        /// Zips the capture folder with System.IO.Compression when the editor's scripting profile
        /// has it (looked up at run time, so the tool compiles on every profile). Returns null
        /// when zipping is not available — the folder is then the result.
        /// </summary>
        private static string TryZip(string dir)
        {
            string zip = dir + ".zip";
            foreach (string assembly in new[] { null, "System.IO.Compression.ZipFile", "System.IO.Compression.FileSystem" })
            {
                Type zipFile = null;
                try
                {
                    zipFile = assembly == null
                        ? ParityEnvironment.FindType("System.IO.Compression.ZipFile")
                        : Type.GetType("System.IO.Compression.ZipFile, " + assembly, false) ??
                          Assembly.Load(assembly).GetType("System.IO.Compression.ZipFile", false);
                }
                catch (Exception)
                {
                    // Not in this scripting profile; try the next place.
                }
                MethodInfo create = zipFile?.GetMethod("CreateFromDirectory", new[] { typeof(string), typeof(string) });
                if (create == null) continue;
                try
                {
                    if (File.Exists(zip)) File.Delete(zip);
                    create.Invoke(null, new object[] { dir, zip });
                    return zip;
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Quarks Parity] Zipping failed (" + e.GetBaseException().Message + "); send the folder instead: " + dir);
                    return null;
                }
            }
            Debug.Log("[Quarks Parity] No zip support in this editor profile; compress this folder yourself: " + dir);
            return null;
        }

        private static string Readme() =>
            "Quarks parity capture — everything Unity knows about these effects, for comparison with babylon.quarks.\n\n" +
            "manifest.json      settings, prefabs, render variants, per-step status and timings\n" +
            "log.txt            every console message during the capture, with step context\n" +
            "environment.json   colour space, render pipeline + renderer assets, quality, post-processing profiles\n" +
            "ProjectSettings/   raw project settings files\n" +
            "assets/            the prefabs and their dependencies (materials, shaders, textures, .meta)\n" +
            "materials/<id>.json shader properties + values, keywords, tags, passes, compiled pass state,\n" +
            "                   the exporter's blend verdict and the measured blend (quad over 3 backgrounds)\n" +
            "effects/<name>/    effect.json (exporter output), export-log.txt, renderers.json,\n" +
            "                   simulation.json + simulation.csv (per-system aggregates, fixed seed),\n" +
            "                   snapshots.json (every particle at 25/50/100%), camera.json,\n" +
            "                   frames/<variant>/NNN.png, contact_<variant>.png,\n" +
            "                   solo/<system>/<variant>/NNN.png (each system alone, times in camera.json)\n";
    }
}
