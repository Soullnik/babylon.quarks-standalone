using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter.Tests
{
    /// <summary>
    /// Exports every fixture and compares the JSON, and the warnings logged on the way, with the
    /// golden files in golden/. `--update` rewrites the golden files instead. The babylon.quarks
    /// tests load the same golden files with QuarksLoader, so the two together check that what the
    /// exporter writes is what the runtime reads.
    /// </summary>
    public static class Program
    {
        private static int _failures;

        public static int Main(string[] args)
        {
            bool update = args.Contains("--update");
            string root = FindProjectDir();
            Directory.SetCurrentDirectory(root);
            string golden = Path.Combine(root, "golden");
            // Start from nothing, so a renamed or removed fixture leaves no golden file behind.
            if (update && Directory.Exists(golden)) Directory.Delete(golden, true);
            Directory.CreateDirectory(golden);

            CheckVersion(root);
            CheckModuleUse(root);
            CheckLinearProject();
            CheckCurveEnds();
            foreach (var fixture in Fixtures.All)
            {
                Debug.Warnings.Clear();
                string json = QuarksExporter.Export(fixture.Value());
                Compare(golden, fixture.Key + ".json", Normalize(json), update);
                Compare(golden, fixture.Key + ".warnings.txt", string.Join("\n", Debug.Warnings) + "\n", update);
            }
            ExportWithFiles(golden, update);

            Console.WriteLine(_failures == 0 ? "Unity exporter: every golden file matches." : $"Unity exporter: {_failures} golden file(s) differ.");
            return _failures == 0 ? 0 : 1;
        }

        /// <summary>Textures and geometries written as files next to the effect, shared between effects.</summary>
        private static void ExportWithFiles(string golden, bool update)
        {
            string outDir = Path.Combine(Path.GetTempPath(), "quarks-exporter-test-" + Guid.NewGuid().ToString("N"));
            try
            {
                var options = new ExportOptions { TexturesAsFiles = true, GeometriesAsFiles = true, AssetsFolder = "shared" };
                Debug.Warnings.Clear();
                AssetFileStore store = QuarksExporter.ExportToFile(Fixtures.All["mesh"](), Path.Combine(outDir, "mesh.json"), options);
                QuarksExporter.ExportToFile(Fixtures.All["trails"](), Path.Combine(outDir, "trails.json"), options, store);
                foreach (string file in Directory.GetFiles(outDir, "*", SearchOption.AllDirectories).OrderBy(f => f, StringComparer.Ordinal))
                {
                    string relative = Path.GetRelativePath(outDir, file).Replace('\\', '/');
                    string name = "files/" + relative;
                    if (relative.EndsWith(".json"))
                    {
                        Compare(golden, name, Normalize(File.ReadAllText(file)), update);
                    }
                    else
                    {
                        Compare(golden, name + ".size.txt", new FileInfo(file).Length + "\n", update);
                    }
                }
            }
            finally
            {
                if (Directory.Exists(outDir)) Directory.Delete(outDir, true);
            }
        }

        /// <summary>The exporter's version stays out of the golden files, so a release does not change them.</summary>
        private static string Normalize(string json) =>
            json.Replace(ExporterInfo.Generator, "babylon.quarks Unity exporter {version}") + "\n";

        /// <summary>
        /// In a Linear project a texture imported as sRGB is written with colorSpace 'srgb', so
        /// babylon.quarks decodes it as Unity samples it, and one imported with sRGB off is not; a
        /// Gamma project, the golden files', writes none.
        /// </summary>
        private static void CheckLinearProject()
        {
            var saved = QualitySettings.activeColorSpace;
            var srgb = new Regex(@"""colorSpace"":\s*""srgb""");
            try
            {
                QualitySettings.activeColorSpace = ColorSpace.Linear;
                string decoded = QuarksExporter.Export(Fixtures.All["mesh"]());
                TextureImporter.LinearPaths.Add("fixtures/spark.png");
                string asStored = QuarksExporter.Export(Fixtures.All["mesh"]());
                if (!srgb.IsMatch(decoded) || asStored.Contains("colorSpace"))
                {
                    Console.WriteLine("FAIL texture colorSpace: an sRGB texture in a Linear project is written with colorSpace 'srgb', a linear one without.");
                    _failures++;
                }
            }
            finally
            {
                QualitySettings.activeColorSpace = saved;
                TextureImporter.LinearPaths.Clear();
            }
        }

        /// <summary>
        /// A curve whose keys stop short of 0 or 1 holds its end values there, as Unity reads it.
        /// The numbers were measured in Unity 6000.6 on one particle with a lifetime of 2 s: Size
        /// over Lifetime with keys (0.3, 1) (0.7, 0.2), and Rotation over Lifetime Z with keys
        /// (0, 1) (0.1433, -0.0078) times π rad/s (a web's), which turns the particle
        /// -0.0245 rad a second from a seventh of its life on.
        /// </summary>
        private static void CheckCurveEnds()
        {
            var size = new AnimationCurve(new Keyframe(0.3f, 1, 0, 0), new Keyframe(0.7f, 0.2f, 0, 0));
            var sizeInUnity = new (float age, float value)[]
            {
                (0.05f, 1), (0.3f, 1), (0.35f, 0.96563f), (0.4f, 0.875f), (0.45f, 0.74688f), (0.5f, 0.6f),
                (0.55f, 0.45312f), (0.6f, 0.325f), (0.65f, 0.23438f), (0.7f, 0.2f), (0.95f, 0.2f),
            };
            var spin = new AnimationCurve(new Keyframe(0, 1, 0, 0), new Keyframe(0.14325842f, -0.0078f, 0, 0));
            var spinInUnity = new (float age, float value)[] { (0, Mathf.PI), (0.2f, -0.0245f), (0.95f, -0.0245f) };
            // Two cycles replay the size curve, holding it on both sides within each half.
            var sizeTwice = new (float age, float value)[] { (0.1f, 1), (0.25f, 0.6f), (0.45f, 0.2f), (0.55f, 1), (0.75f, 0.6f), (0.95f, 0.2f) };

            CheckCurve("size keys (0.3, 1) (0.7, 0.2)", ValueConverter.Bezier(size, 1), sizeInUnity);
            CheckCurve("rotation keys (0, 1) (0.1433, -0.0078) x pi", ValueConverter.Bezier(spin, Mathf.PI), spinInUnity);
            CheckCurve("size keys (0.3, 1) (0.7, 0.2), 2 cycles", ValueConverter.Bezier(size, 1, 2), sizeTwice);
        }

        private static void CheckCurve(string label, JToken curve, (float age, float value)[] expected)
        {
            foreach (var (age, value) in expected)
            {
                double actual = EvaluatePiecewiseBezier((JObject)curve, age);
                if (Math.Abs(actual - value) > 1e-3)
                {
                    Console.WriteLine($"FAIL curve {label}: {actual:F5} at {age}, Unity reads {value}.");
                    _failures++;
                    return;
                }
            }
        }

        /// <summary>A PiecewiseBezier's value at <paramref name="t"/>, as quarks.core reads it.</summary>
        private static double EvaluatePiecewiseBezier(JObject curve, double t)
        {
            var pieces = ((JArray)Member(curve, "functions")).Items.Cast<JObject>().ToList();
            double Number(JObject o, string key) => double.Parse(Member(o, key).ToString(), System.Globalization.CultureInfo.InvariantCulture);
            int index = pieces.FindLastIndex(p => Number(p, "start") <= t);
            if (index < 0) return Number((JObject)Member(pieces[0], "function"), "p0");
            double start = Number(pieces[index], "start");
            double end = index + 1 < pieces.Count ? Number(pieces[index + 1], "start") : 1;
            double u = end > start ? (t - start) / (end - start) : 0;
            var fn = (JObject)Member(pieces[index], "function");
            double v = 1 - u;
            return v * v * v * Number(fn, "p0") + 3 * v * v * u * Number(fn, "p1") + 3 * v * u * u * Number(fn, "p2") + u * u * u * Number(fn, "p3");
        }

        private static JToken Member(JObject o, string key) => o.Members.First(m => m.Key == key).Value;

        private static void CheckVersion(string root)
        {
            string packageJson = File.ReadAllText(Path.Combine(root, "..", "package.json"));
            Match match = Regex.Match(packageJson, "\"version\"\\s*:\\s*\"([^\"]+)\"");
            if (!match.Success || match.Groups[1].Value != ExporterInfo.Version)
            {
                Console.WriteLine($"FAIL ExporterInfo.Version is {ExporterInfo.Version}, package.json says {match.Groups[1].Value}.");
                _failures++;
            }
        }

        /// <summary>
        /// Unity's modules are structs that write through to their system; the stubs make them
        /// classes. What a class allows and Unity rejects fails here: a field set on the property
        /// itself (<c>ps.main.loop = …</c>, CS1612 in Unity) and a module compared with null.
        /// </summary>
        private static void CheckModuleUse(string root)
        {
            const string modules = "main|emission|shape|colorOverLifetime|sizeOverLifetime|rotationOverLifetime|velocityOverLifetime|limitVelocityOverLifetime|inheritVelocity|forceOverLifetime|colorBySpeed|sizeBySpeed|rotationBySpeed|noise|collision|subEmitters|textureSheetAnimation|trails";
            var setThrough = new Regex($@"\.({modules})\.\w+\s*=(?!=)");
            var nullCheck = new Regex($@"\.({modules})\s*[!=]=\s*null");
            foreach (string file in Directory.GetFiles(Path.Combine(root, "..", "Editor"), "*.cs"))
            {
                string[] lines = File.ReadAllLines(file);
                for (int i = 0; i < lines.Length; i++)
                {
                    if (setThrough.IsMatch(lines[i]) || nullCheck.IsMatch(lines[i]))
                    {
                        Console.WriteLine($"FAIL {Path.GetFileName(file)}:{i + 1}: Unity's particle modules are structs; copy the module to a local first.");
                        _failures++;
                    }
                }
            }
        }

        private static void Compare(string golden, string name, string actual, bool update)
        {
            string path = Path.Combine(golden, name);
            if (update)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllText(path, actual);
                Console.WriteLine($"wrote {name}");
                return;
            }
            string expected = File.Exists(path) ? File.ReadAllText(path).Replace("\r\n", "\n") : null;
            if (expected == actual)
            {
                Console.WriteLine($"ok   {name}");
                return;
            }
            _failures++;
            if (expected == null)
            {
                Console.WriteLine($"FAIL {name}: no golden file (run with --update to write it)");
                return;
            }
            string[] a = expected.Split('\n'), b = actual.Split('\n');
            int line = 0;
            while (line < a.Length && line < b.Length && a[line] == b[line]) line++;
            Console.WriteLine($"FAIL {name}, line {line + 1}:");
            Console.WriteLine($"  golden:   {(line < a.Length ? a[line] : "<end>")}");
            Console.WriteLine($"  exported: {(line < b.Length ? b[line] : "<end>")}");
        }

        private static string FindProjectDir()
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            {
                if (File.Exists(Path.Combine(dir.FullName, "UnityExporterTests.csproj"))) return dir.FullName;
            }
            throw new InvalidOperationException("UnityExporterTests.csproj not found above " + AppContext.BaseDirectory);
        }
    }
}
