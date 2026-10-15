using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Writes textures and mesh geometries as standalone files under one shared assets folder, so
    /// effects exported together reference a single copy instead of each embedding its own. One
    /// store spans a whole folder export: the same Texture / Mesh is written once and every effect
    /// that uses it gets a relative url to that file.
    /// </summary>
    public class AssetFileStore
    {
        /// <summary>Absolute folder the files are written to (e.g. <c>{output}/assets</c>).</summary>
        public readonly string RootDir;

        private readonly Dictionary<int, string> _textureFiles = new Dictionary<int, string>();
        private readonly Dictionary<int, string> _envAtlasFiles = new Dictionary<int, string>();
        private readonly Dictionary<int, string> _geometryFiles = new Dictionary<int, string>();
        private readonly HashSet<string> _takenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        public int TexturesWritten { get; private set; }
        public int GeometriesWritten { get; private set; }

        public AssetFileStore(string rootDir)
        {
            RootDir = Path.GetFullPath(rootDir);
        }

        /// <summary>
        /// Writes <paramref name="tex"/> once and returns its absolute path, or null when it can't be
        /// written. Browser-decodable sources (png/jpg/webp) are copied as-is; everything else is
        /// re-encoded to PNG through the GPU.
        /// </summary>
        public string WriteTexture(Texture tex)
        {
            if (tex == null) return null;
            int id = tex.GetInstanceID();
            if (_textureFiles.TryGetValue(id, out var existing)) return existing;

            string sourcePath = AssetDatabase.GetAssetPath(tex);
            string written = null;
            try
            {
                if (!string.IsNullOrEmpty(sourcePath) && File.Exists(sourcePath) && TextureEncoding.IsWebImageFile(sourcePath))
                {
                    string target = ReservePath("textures", tex.name, Path.GetExtension(sourcePath).ToLowerInvariant());
                    File.Copy(sourcePath, target, true);
                    written = target;
                }
                else
                {
                    byte[] png = TextureEncoding.EncodeToPng(tex);
                    if (png != null)
                    {
                        string target = ReservePath("textures", tex.name, ".png");
                        File.WriteAllBytes(target, png);
                        written = target;
                    }
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Quarks Exporter] Could not write texture '{tex.name}': {e.Message}");
            }

            if (written != null)
            {
                _textureFiles[id] = written;
                TexturesWritten++;
            }
            return written;
        }

        /// <summary>Writes a baked reflection atlas (keyed by its source cubemap) as a PNG file.</summary>
        public string WriteEnvAtlas(Cubemap source, Texture2D atlas)
        {
            if (source == null || atlas == null) return null;
            int id = source.GetInstanceID();
            if (_envAtlasFiles.TryGetValue(id, out var existing)) return existing;
            try
            {
                byte[] png = atlas.EncodeToPNG();
                if (png == null) return null;
                string target = ReservePath("textures", atlas.name, ".png");
                File.WriteAllBytes(target, png);
                _envAtlasFiles[id] = target;
                TexturesWritten++;
                return target;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Quarks Exporter] Could not write env atlas '{atlas.name}': {e.Message}");
                return null;
            }
        }

        /// <summary>True when this mesh was already written by an earlier effect of the same export.</summary>
        public bool TryGetGeometry(Mesh mesh, out string path) =>
            _geometryFiles.TryGetValue(mesh.GetInstanceID(), out path);

        /// <summary>
        /// Writes a geometry file — the same <c>positions / indices / uvs / normals</c> fields an
        /// inline <c>QuarksGeometry</c> carries, under a <c>QuarksGeometry</c> metadata header.
        /// </summary>
        public string WriteGeometry(Mesh mesh, JObject geometryData)
        {
            if (TryGetGeometry(mesh, out var existing)) return existing;
            var file = new JObject().Set("metadata", new JObject()
                .Set("version", 1)
                .Set("type", "QuarksGeometry")
                .Set("generator", "unity-quark-exporter"));
            foreach (var member in geometryData.Members)
            {
                file.Members.Add(member);
            }
            string target = ReservePath("geometries", mesh.name, ".json");
            File.WriteAllText(target, file.ToString());
            _geometryFiles[mesh.GetInstanceID()] = target;
            GeometriesWritten++;
            return target;
        }

        /// <summary>Picks a free, url-safe file path under <c>RootDir/{kind}</c>.</summary>
        private string ReservePath(string kind, string name, string extension)
        {
            string dir = Path.Combine(RootDir, kind);
            Directory.CreateDirectory(dir);
            string stem = SafeFileName(name);
            string candidate = Path.Combine(dir, stem + extension);
            for (int n = 2; _takenPaths.Contains(candidate); n++)
            {
                candidate = Path.Combine(dir, $"{stem}_{n}{extension}");
            }
            _takenPaths.Add(candidate);
            return candidate;
        }

        /// <summary>
        /// Keeps names readable but url-safe, so the relative url written into the effect needs no
        /// escaping and matches the file name byte for byte.
        /// </summary>
        private static string SafeFileName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "asset";
            var sb = new StringBuilder(name.Length);
            foreach (char c in name)
            {
                sb.Append((char.IsLetterOrDigit(c) && c < 128) || c == '-' || c == '_' || c == '.' ? c : '_');
            }
            string result = sb.ToString().Trim('.');
            return result.Length == 0 ? "asset" : result;
        }

        /// <summary>Relative, forward-slash url from <paramref name="fromDir"/> to <paramref name="toFile"/>.</summary>
        public static string RelativeUrl(string fromDir, string toFile)
        {
            string from = Path.GetFullPath(fromDir).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                + Path.DirectorySeparatorChar;
            Uri relative = new Uri(from).MakeRelativeUri(new Uri(Path.GetFullPath(toFile)));
            return Uri.UnescapeDataString(relative.ToString()).Replace('\\', '/');
        }
    }
}
