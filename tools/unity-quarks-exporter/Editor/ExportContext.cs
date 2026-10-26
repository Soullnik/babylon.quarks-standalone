using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Accumulates the shared meta arrays (geometries / materials / textures / images) of the
    /// Quarks envelope while the hierarchy is serialized, and holds the node-uuid maps used to
    /// wire sub-emitters. Textures are embedded as data URIs so the exported JSON is self-contained,
    /// unless <see cref="Store"/> is set: then textures and/or geometries (per <see cref="Options"/>)
    /// are written as files and referenced by a url relative to <see cref="EffectDir"/>.
    /// </summary>
    public class ExportContext
    {
        public readonly JArray Geometries = new JArray();
        public readonly JArray Materials = new JArray();
        public readonly JArray Textures = new JArray();
        public readonly JArray Images = new JArray();

        public bool EmbedTextures = true;

        /// <summary>Which assets go to separate files. Ignored while <see cref="Store"/> is null.</summary>
        public readonly ExportOptions Options;

        /// <summary>Shared asset folder for this export; null keeps everything inline.</summary>
        public readonly AssetFileStore Store;

        /// <summary>Folder the effect JSON is written to — asset urls are relative to it.</summary>
        public readonly string EffectDir;

        public ExportContext() : this(null, null, null) { }

        public ExportContext(ExportOptions options, AssetFileStore store, string effectDir)
        {
            Options = options ?? new ExportOptions();
            Store = store;
            EffectDir = effectDir;
        }

        private bool TexturesToFiles => Store != null && EffectDir != null && Options.TexturesAsFiles;
        private bool GeometriesToFiles => Store != null && EffectDir != null && Options.GeometriesAsFiles;

        /// <summary>Mesh nodes emitted for mesh-shape emitters; appended to the root object's children.</summary>
        public readonly System.Collections.Generic.List<JObject> MeshSourceNodes = new System.Collections.Generic.List<JObject>();

        private int _idCounter;
        private readonly Dictionary<string, string> _imageByUrl = new Dictionary<string, string>();
        private readonly Dictionary<Transform, string> _transformUuid = new Dictionary<Transform, string>();
        private readonly Dictionary<ParticleSystem, string> _systemUuid = new Dictionary<ParticleSystem, string>();
        private readonly HashSet<ParticleSystem> _subTargets = new HashSet<ParticleSystem>();

        public string NewId(string prefix) => prefix + "-" + (_idCounter++);

        // ---- node uuid registry (assigned in pass 1) -----------------------------------

        public string AssignNodeUuid(Transform t)
        {
            string uuid = NewId("node");
            _transformUuid[t] = uuid;
            var ps = t.GetComponent<ParticleSystem>();
            if (ps != null) _systemUuid[ps] = uuid;
            return uuid;
        }

        public string GetTransformUuid(Transform t) =>
            _transformUuid.TryGetValue(t, out var u) ? u : NewId("node");

        public string GetNodeUuid(ParticleSystem ps) =>
            ps != null && _systemUuid.TryGetValue(ps, out var u) ? u : null;

        public void MarkSubTarget(ParticleSystem ps) { if (ps != null) _subTargets.Add(ps); }
        public bool IsSubTarget(ParticleSystem ps) => ps != null && _subTargets.Contains(ps);

        // ---- material / texture --------------------------------------------------------

        /// <summary>
        /// Writes the renderer's material into the envelope's materials and returns what the
        /// system's own settings take from it.
        /// </summary>
        /// <param name="trail">Use the renderer's trail material rather than its particle material.</param>
        public ParticleMaterial AddMaterialForRenderer(ParticleSystemRenderer renderer, bool trail = false)
        {
            Material mat = renderer == null ? null : trail ? renderer.trailMaterial : renderer.sharedMaterial;
            ParticleMaterial info = MaterialReader.Read(mat);
            Texture tex = mat != null ? mat.mainTexture : null;
            string textureUuid = tex != null ? AddTexture(tex) : null;

            string reflectionAtlasUuid = null;
            float reflectionLevel = 1f;
            Cubemap cube = FindReflectionCubemap(mat);
            if (cube != null)
            {
                reflectionAtlasUuid = AddCubemapAtlas(cube);
                reflectionLevel = ReadReflectionLevel(mat);
            }

            info.Uuid = NewId("quarks_material");
            var m = new JObject()
                .Set("uuid", info.Uuid)
                .Set("type", "QuarksMaterial")
                .Set("transparent", info.Transparent)
                .Set("alphaMode", info.Blending)
                .Set("depthTest", true)
                .Set("depthWrite", info.DepthWrite)
                .Set("alphaTest", info.AlphaTest);
            if (textureUuid != null)
            {
                m.Set("texture", textureUuid);
                // The map's Tiling / Offset; Unity applies them to the flipbook cell's UV, as
                // babylon.quarks does on UV channel 0.
                Vector2 tiling = mat.mainTextureScale, offset = mat.mainTextureOffset;
                if (tiling != Vector2.one || offset != Vector2.zero)
                {
                    m.Set("mapUV", new JObject()
                        .Set("tiling", new JArray().Add(tiling.x).Add(tiling.y))
                        .Set("offset", new JArray().Add(offset.x).Add(offset.y)));
                }
            }
            if (reflectionAtlasUuid != null)
            {
                m.Set("reflectionAtlas", reflectionAtlasUuid);
                m.Set("reflectionLevel", reflectionLevel);
            }
            Materials.Add(m);
            return info;
        }

        /// <summary>Unity's wrap mode as the three.js constant the loader reads.</summary>
        private static int WrapOf(TextureWrapMode mode)
        {
            switch (mode)
            {
                case TextureWrapMode.Repeat: return 1000;
                case TextureWrapMode.Mirror:
                case TextureWrapMode.MirrorOnce: return 1002;
                default: return 1001;
            }
        }

        private string AddTexture(Texture tex, bool envAtlas = false, string url = null)
        {
            url = url ?? ResolveTextureUrl(tex);
            if (!_imageByUrl.TryGetValue(url, out var imageUuid))
            {
                imageUuid = NewId("quarks_image");
                _imageByUrl[url] = imageUuid;
                Images.Add(new JObject().Set("uuid", imageUuid).Set("url", url));
            }
            string texUuid = NewId("quarks_texture");
            var t = new JObject()
                .Set("uuid", texUuid)
                .Set("image", imageUuid)
                .Set("wrap", envAtlas
                    // The six faces sit side by side; repeating would bleed one face into another.
                    ? new JArray().Add(1001).Add(1001)
                    : new JArray().Add(WrapOf(tex.wrapModeU)).Add(WrapOf(tex.wrapModeV)));
            if (!envAtlas && (tex.wrapModeU == TextureWrapMode.MirrorOnce || tex.wrapModeV == TextureWrapMode.MirrorOnce))
            {
                Debug.LogWarning($"[Quarks Exporter] Texture '{tex.name}': Mirror Once has no babylon.quarks counterpart and is exported as Mirror.");
            }
            if (envAtlas)
            {
                // Match babylon.quarks env-atlas sampling (invertY:false, no mips).
                t.Set("invertY", false);
                t.Set("noMipmap", true);
            }
            Textures.Add(t);
            return texUuid;
        }

        /// <summary>
        /// Finds a cubemap on the particle material (common shader property names).
        /// </summary>
        private static Cubemap FindReflectionCubemap(Material mat)
        {
            if (mat == null) return null;
            string[] names = {
                "_Cube", "_Cubemap", "_ReflectionCubemap", "_EnvMap",
                "_EnvironmentMap", "_SpecCube0", "_ReflectionTex"
            };
            foreach (string name in names)
            {
                if (!mat.HasProperty(name)) continue;
                Texture t = mat.GetTexture(name);
                if (t is Cubemap cube) return cube;
            }
            // Any cubemap-typed texture property (custom shaders).
            foreach (string name in mat.GetTexturePropertyNames())
            {
                Texture t = mat.GetTexture(name);
                if (t is Cubemap cube) return cube;
            }
            return null;
        }

        private static float ReadReflectionLevel(Material mat)
        {
            if (mat == null) return 1f;
            string[] names = { "_ReflectionIntensity", "_ReflectionStrength", "_EnvIntensity" };
            foreach (string name in names)
            {
                if (!mat.HasProperty(name)) continue;
                return mat.GetFloat(name);
            }
            return 1f;
        }

        /// <summary>
        /// Bakes a Cubemap into a 3×2 atlas (px py pz / nx ny nz) and embeds it.
        /// </summary>
        private string AddCubemapAtlas(Cubemap cube)
        {
            Texture2D atlas = BakeCubemapToAtlas(cube);
            if (atlas == null) return null;
            try
            {
                atlas.name = cube.name + "_envAtlas";
                string url = null;
                if (TexturesToFiles)
                {
                    string file = Store.WriteEnvAtlas(cube, atlas);
                    if (file != null) url = AssetFileStore.RelativeUrl(EffectDir, file);
                }
                return AddTexture(atlas, envAtlas: true, url: url);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(atlas);
            }
        }

        /// <summary>
        /// Packs cubemap faces into one Texture2D matching babylon.quarks USE_ENVMAP_ATLAS layout.
        /// </summary>
        private static Texture2D BakeCubemapToAtlas(Cubemap cube)
        {
            if (cube == null || cube.width <= 0) return null;

            // Cap face size so embedded JSON stays reasonable.
            int srcSize = cube.width;
            int size = Math.Min(srcSize, 256);
            var atlas = new Texture2D(size * 3, size * 2, TextureFormat.RGBA32, false, false);
            CubemapFace[] faces = {
                CubemapFace.PositiveX, CubemapFace.PositiveY, CubemapFace.PositiveZ,
                CubemapFace.NegativeX, CubemapFace.NegativeY, CubemapFace.NegativeZ
            };

            for (int i = 0; i < 6; i++)
            {
                Texture2D faceTex = ReadCubemapFace(cube, faces[i], size);
                if (faceTex == null)
                {
                    Debug.LogWarning($"[Quarks Exporter] Could not read cubemap face {faces[i]} from '{cube.name}'");
                    UnityEngine.Object.DestroyImmediate(atlas);
                    return null;
                }
                try
                {
                    // Texture2D y=0 is bottom; canvas-style atlas has +faces on the top row.
                    // Place +faces (i=0..2) at top → high y, -faces at bottom → y=0.
                    int x = (i % 3) * size;
                    int y = (i < 3) ? size : 0;
                    atlas.SetPixels(x, y, size, size, faceTex.GetPixels());
                }
                finally
                {
                    UnityEngine.Object.DestroyImmediate(faceTex);
                }
            }
            atlas.Apply(false, false);
            return atlas;
        }

        /// <summary>
        /// Reads one cubemap face into a readable Texture2D, via GetPixels or GPU blit.
        /// </summary>
        private static Texture2D ReadCubemapFace(Cubemap cube, CubemapFace face, int size)
        {
            int faceSize = cube.width;

            // Prefer CPU read when the cubemap is readable.
            try
            {
                Color[] pixels = cube.GetPixels(face);
                if (pixels != null && pixels.Length > 0)
                {
                    var full = new Texture2D(faceSize, faceSize, TextureFormat.RGBA32, false, false);
                    full.SetPixels(pixels);
                    full.Apply(false, false);
                    if (faceSize == size) return full;
                    Texture2D scaled = ScaleTexture(full, size);
                    UnityEngine.Object.DestroyImmediate(full);
                    return scaled;
                }
            }
            catch
            {
                // Non-readable cubemap — fall through to GPU blit.
            }

            RenderTexture previous = RenderTexture.active;
            RenderTexture rt = RenderTexture.GetTemporary(
                faceSize, faceSize, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            Texture2D readable = null;
            try
            {
                int faceIndex = (int)face;
                if (SystemInfo.copyTextureSupport == CopyTextureSupport.None)
                {
                    Debug.LogWarning($"[Quarks Exporter] CopyTexture unsupported; cannot bake cubemap '{cube.name}'");
                    return null;
                }
                var faceTex = new Texture2D(faceSize, faceSize, TextureFormat.RGBA32, false, false);
                try
                {
                    Graphics.CopyTexture(cube, faceIndex, 0, faceTex, 0, 0);
                }
                catch (Exception e)
                {
                    UnityEngine.Object.DestroyImmediate(faceTex);
                    Debug.LogWarning($"[Quarks Exporter] Could not CopyTexture cubemap face {face}: {e.Message}");
                    return null;
                }
                if (faceSize == size)
                {
                    return faceTex;
                }
                Texture2D scaled = ScaleTexture(faceTex, size);
                UnityEngine.Object.DestroyImmediate(faceTex);
                return scaled;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Quarks Exporter] Could not blit cubemap face {face}: {e.Message}");
                if (readable != null) UnityEngine.Object.DestroyImmediate(readable);
                return null;
            }
            finally
            {
                RenderTexture.active = previous;
                RenderTexture.ReleaseTemporary(rt);
            }
        }

        private static Texture2D ScaleTexture(Texture2D source, int size)
        {
            RenderTexture previous = RenderTexture.active;
            RenderTexture rt = RenderTexture.GetTemporary(size, size, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            try
            {
                Graphics.Blit(source, rt);
                RenderTexture.active = rt;
                var scaled = new Texture2D(size, size, TextureFormat.RGBA32, false, false);
                scaled.ReadPixels(new Rect(0, 0, size, size), 0, 0);
                scaled.Apply(false, false);
                return scaled;
            }
            finally
            {
                RenderTexture.active = previous;
                RenderTexture.ReleaseTemporary(rt);
            }
        }

        private string ResolveTextureUrl(Texture tex)
        {
            string path = AssetDatabase.GetAssetPath(tex);
            if (TexturesToFiles)
            {
                string file = Store.WriteTexture(tex);
                if (file != null)
                {
                    return AssetFileStore.RelativeUrl(EffectDir, file);
                }
                // Could not write the file — fall through and embed it instead.
            }
            if (EmbedTextures)
            {
                // Only the source file of a format a browser can decode is worth
                // embedding as-is.
                if (!string.IsNullOrEmpty(path) && File.Exists(path) && TextureEncoding.IsWebImageFile(path))
                {
                    try
                    {
                        byte[] bytes = File.ReadAllBytes(path);
                        return "data:" + TextureEncoding.MimeTypeOf(path) + ";base64," + Convert.ToBase64String(bytes);
                    }
                    catch (Exception e)
                    {
                        Debug.LogWarning($"[Quarks Exporter] Could not embed texture '{tex.name}': {e.Message}");
                    }
                }

                // Everything else goes through the GPU copy: textures Unity keeps
                // in its built-in bundle (Default-Particle and friends) report a
                // virtual path with no file behind it, and authoring formats like
                // .tga or .psd are not something a browser can decode. Both used to
                // fall through to the branch below and export the asset path as if
                // it were an image url.
                byte[] png = TextureEncoding.EncodeToPng(tex);
                if (png != null)
                {
                    return "data:image/png;base64," + Convert.ToBase64String(png);
                }
                Debug.LogWarning(
                    $"[Quarks Exporter] Texture '{tex.name}' could not be embedded; the effect will reference '{path}' and will not load outside Unity.");
            }
            return !string.IsNullOrEmpty(path) ? path : tex.name;
        }

        // ---- mesh geometry (Mesh render mode) ------------------------------------------

        public string AddGeometryForMesh(Mesh mesh)
        {
            string uuid = NewId("quarks_geometry");
            var entry = new JObject().Set("uuid", uuid).Set("type", "QuarksGeometry");
            if (GeometriesToFiles)
            {
                // QuarksLoader.load() fetches `url` and reads the same fields an inline entry has.
                string file = Store.TryGetGeometry(mesh, out var written)
                    ? written
                    : Store.WriteGeometry(mesh, BuildGeometryData(mesh));
                entry.Set("url", AssetFileStore.RelativeUrl(EffectDir, file));
            }
            else
            {
                entry.Members.AddRange(BuildGeometryData(mesh).Members);
            }
            Geometries.Add(entry);
            return uuid;
        }

        /// <summary>positions / indices / uvs / normals of a mesh, in QuarksGeometry layout.</summary>
        private static JObject BuildGeometryData(Mesh mesh)
        {
            var positions = new JArray();
            foreach (var v in mesh.vertices) { positions.Add(v.x); positions.Add(v.y); positions.Add(v.z); }
            var indices = new JArray();
            foreach (var idx in mesh.triangles) { indices.Add(idx); }
            var g = new JObject().Set("positions", positions).Set("indices", indices);

            AddUVs(g, "uvs", mesh.uv);
            // The second UV set, read by textures on UV channel 1 (a mask or lightmap-style layout).
            AddUVs(g, "uvs2", mesh.uv2);

            // A mesh without normals is left so: the runtime gives it its own, and the export
            // never changes the mesh asset it reads.
            Vector3[] normals = mesh.normals;
            if (normals != null && normals.Length > 0)
            {
                var n = new JArray();
                foreach (var v in normals) { n.Add(v.x); n.Add(v.y); n.Add(v.z); }
                g.Set("normals", n);
            }
            return g;
        }

        private static void AddUVs(JObject geometry, string key, Vector2[] uv)
        {
            if (uv == null || uv.Length == 0) return;
            var uvs = new JArray();
            foreach (var t in uv) { uvs.Add(t.x); uvs.Add(t.y); }
            geometry.Set(key, uvs);
        }

        /// <summary>
        /// Emits a hidden Mesh node (+ its geometry) so a mesh-shape emitter can reference it by
        /// uuid: QuarksLoader resolves the emitter's `mesh_surface.mesh` to this node. Unity's Mesh
        /// shape only emits from the mesh, so the node is not drawn.
        /// </summary>
        public string AddMeshSourceNode(Mesh mesh)
        {
            string geometryUuid = AddGeometryForMesh(mesh);
            string nodeUuid = NewId("node");
            MeshSourceNodes.Add(new JObject()
                .Set("uuid", nodeUuid)
                .Set("name", mesh.name + " (emitter source)")
                .Set("matrix", new JArray().Add(1).Add(0).Add(0).Add(0).Add(0).Add(1).Add(0).Add(0).Add(0).Add(0).Add(1).Add(0).Add(0).Add(0).Add(0).Add(1))
                .Set("type", "Mesh")
                .Set("isVisible", false)
                .Set("geometry", geometryUuid));
            return nodeUuid;
        }

    }

    /// <summary>Texture helpers shared by inline embedding and the file asset store.</summary>
    internal static class TextureEncoding
    {
        public static bool IsWebImageFile(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp";
        }

        public static string MimeTypeOf(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext == ".jpg" || ext == ".jpeg" ? "image/jpeg"
                : ext == ".webp" ? "image/webp"
                : "image/png";
        }

        /// <summary>
        /// Re-encodes any texture to PNG bytes by way of a render texture.
        /// Works for built-in, compressed and non-readable textures, none of which
        /// can be read from disk or through <c>EncodeToPNG</c> directly.
        /// </summary>
        public static byte[] EncodeToPng(Texture tex)
        {
            if (tex == null || tex.width <= 0 || tex.height <= 0)
            {
                return null;
            }

            RenderTexture previous = RenderTexture.active;
            RenderTexture rt = RenderTexture.GetTemporary(
                tex.width, tex.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            Texture2D readable = null;
            try
            {
                Graphics.Blit(tex, rt);
                RenderTexture.active = rt;
                readable = new Texture2D(tex.width, tex.height, TextureFormat.RGBA32, false);
                readable.ReadPixels(new Rect(0, 0, tex.width, tex.height), 0, 0);
                readable.Apply();
                return readable.EncodeToPNG();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Quarks Exporter] Could not re-encode texture '{tex.name}': {e.Message}");
                return null;
            }
            finally
            {
                RenderTexture.active = previous;
                RenderTexture.ReleaseTemporary(rt);
                if (readable != null)
                {
                    UnityEngine.Object.DestroyImmediate(readable);
                }
            }
        }
    }
}
