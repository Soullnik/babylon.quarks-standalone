using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
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
