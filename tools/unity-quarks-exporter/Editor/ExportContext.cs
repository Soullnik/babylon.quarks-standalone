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
    /// wire sub-emitters. Textures are embedded as data URIs so the exported JSON is self-contained.
    /// </summary>
    public class ExportContext
    {
        public readonly JArray Geometries = new JArray();
        public readonly JArray Materials = new JArray();
        public readonly JArray Textures = new JArray();
        public readonly JArray Images = new JArray();

        /// <summary>
        /// Babylon alpha mode of the most recently built material — read straight after
        /// AddMaterialForRenderer. Babylon's numbering, not three.js's.
        /// </summary>
        public int LastBlendMode = 2;

        public bool EmbedTextures = true;

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

        public string AddMaterialForRenderer(ParticleSystemRenderer renderer)
        {
            Material mat = renderer != null ? renderer.sharedMaterial : null;
            Texture tex = mat != null ? mat.mainTexture : null;
            string textureUuid = tex != null ? AddTexture(tex) : null;
            LastBlendMode = DetectBlend(mat, out string blendSource);

            string reflectionAtlasUuid = null;
            float reflectionLevel = 1f;
            Cubemap cube = FindReflectionCubemap(mat);
            if (cube != null)
            {
                reflectionAtlasUuid = AddCubemapAtlas(cube);
                reflectionLevel = ReadReflectionLevel(mat);
            }

            string uuid = NewId("quarks_material");
            var m = new JObject()
                .Set("uuid", uuid)
                .Set("type", "QuarksMaterial")
                .Set("transparent", true)
                // `alphaMode` is Babylon's numbering and is what QuarksLoader prefers; `blending`
                // is three.js's, for quarks.art / three.quarks reading the same file. They are
                // different numbers for the same mode — do not collapse them.
                .Set("alphaMode", LastBlendMode)
                .Set("blending", ToThreeBlending(LastBlendMode))
                .Set("blendModeSource", blendSource)
                .Set("depthTest", true)
                .Set("depthWrite", false)
                .Set("alphaTest", 0);
            if (textureUuid != null)
            {
                // Write both keys: `texture` for QuarksMaterial and `map` for three.js compatibility.
                m.Set("texture", textureUuid);
                m.Set("map", textureUuid);
            }
            if (reflectionAtlasUuid != null)
            {
                m.Set("reflectionAtlas", reflectionAtlasUuid);
                m.Set("reflectionLevel", reflectionLevel);
            }
            Materials.Add(m);
            return uuid;
        }

        private string AddTexture(Texture tex, bool envAtlas = false)
        {
            string url = ResolveTextureUrl(tex);
            if (!_imageByUrl.TryGetValue(url, out var imageUuid))
            {
                imageUuid = NewId("quarks_image");
                _imageByUrl[url] = imageUuid;
                Images.Add(new JObject().Set("uuid", imageUuid).Set("url", url));
            }
            string texUuid = NewId("quarks_texture");
            var t = new JObject()
                .Set("uuid", texUuid)
                .Set("name", tex.name)
                .Set("image", imageUuid)
                .Set("wrap", new JArray().Add(1001).Add(1001));
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
                return AddTexture(atlas, envAtlas: true);
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
            if (EmbedTextures)
            {
                // Only the source file of a format a browser can decode is worth
                // embedding as-is.
                if (!string.IsNullOrEmpty(path) && File.Exists(path) && IsWebImageFile(path))
                {
                    try
                    {
                        byte[] bytes = File.ReadAllBytes(path);
                        return "data:" + MimeTypeOf(path) + ";base64," + Convert.ToBase64String(bytes);
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
                string encoded = EncodeTextureToPngDataUrl(tex);
                if (!string.IsNullOrEmpty(encoded))
                {
                    return encoded;
                }
                Debug.LogWarning(
                    $"[Quarks Exporter] Texture '{tex.name}' could not be embedded; the effect will reference '{path}' and will not load outside Unity.");
            }
            return !string.IsNullOrEmpty(path) ? path : tex.name;
        }

        private static bool IsWebImageFile(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp";
        }

        private static string MimeTypeOf(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext == ".jpg" || ext == ".jpeg" ? "image/jpeg"
                : ext == ".webp" ? "image/webp"
                : "image/png";
        }

        /// <summary>
        /// Re-encodes any texture to a PNG data URI by way of a render texture.
        /// Works for built-in, compressed and non-readable textures, none of which
        /// can be read from disk or through <c>EncodeToPNG</c> directly.
        /// </summary>
        private static string EncodeTextureToPngDataUrl(Texture tex)
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
                byte[] png = readable.EncodeToPNG();
                return png == null ? null : "data:image/png;base64," + Convert.ToBase64String(png);
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

        // ---- mesh geometry (Mesh render mode) ------------------------------------------

        public string AddGeometryForMesh(Mesh mesh)
        {
            string uuid = NewId("quarks_geometry");
            var positions = new JArray();
            foreach (var v in mesh.vertices) { positions.Add(v.x); positions.Add(v.y); positions.Add(v.z); }
            var indices = new JArray();
            foreach (var idx in mesh.triangles) { indices.Add(idx); }
            var g = new JObject().Set("uuid", uuid).Set("type", "QuarksGeometry").Set("positions", positions).Set("indices", indices);

            Vector2[] uv = mesh.uv;
            if (uv.Length > 0)
            {
                var uvs = new JArray();
                foreach (var t in uv) { uvs.Add(t.x); uvs.Add(t.y); }
                g.Set("uvs", uvs);
            }

            Vector3[] normals = mesh.normals;
            if (normals == null || normals.Length == 0)
            {
                mesh.RecalculateNormals();
                normals = mesh.normals;
            }
            if (normals != null && normals.Length > 0)
            {
                var n = new JArray();
                foreach (var v in normals) { n.Add(v.x); n.Add(v.y); n.Add(v.z); }
                g.Set("normals", n);
            }
            Geometries.Add(g);
            return uuid;
        }

        /// <summary>
        /// Emits a Mesh node (+ its geometry) so a mesh-shape emitter can reference it by uuid.
        /// QuarksLoader.linkReferences resolves the emitter's `mesh_surface.mesh` to this node.
        /// The node is a real (visible) Mesh in the loaded scene — hide it if only used for emission.
        /// </summary>
        public string AddMeshSourceNode(Mesh mesh)
        {
            string geometryUuid = AddGeometryForMesh(mesh);
            string nodeUuid = NewId("node");
            MeshSourceNodes.Add(new JObject()
                .Set("uuid", nodeUuid)
                .Set("name", mesh.name + " (emitter source)")
                .Set("layers", 1)
                .Set("matrix", new JArray().Add(1).Add(0).Add(0).Add(0).Add(0).Add(1).Add(0).Add(0).Add(0).Add(0).Add(1).Add(0).Add(0).Add(0).Add(0).Add(1))
                .Set("type", "Mesh")
                .Set("geometry", geometryUuid));
            return nodeUuid;
        }

        /// <summary>
        /// Babylon alpha-mode constants (Constants.ALPHA_*), the numbering `alphaMode` carries.
        /// </summary>
        private const int AlphaAdd = 1;
        private const int AlphaCombine = 2;
        private const int AlphaSubtract = 3;
        private const int AlphaMultiply = 4;
        private const int AlphaPremultiplied = 7;
        private const int AlphaUnknown = -1;

        /// <summary>
        /// Resolve a material's blend mode, preferring what the GPU is actually told to do over
        /// what the shader happens to be called.
        ///
        /// The order matters. The blend factors are the ground truth: they are what Unity submits
        /// and they mean the same thing in every pipeline. The surface-option enum is the same
        /// state one level up. The shader's name is free text the author can change without
        /// touching the rendering at all — a "MyAdditiveGlow" that alpha-blends is perfectly legal
        /// — so it is consulted only when nothing real is readable, and it says so in the console.
        /// </summary>
        private static int DetectBlend(Material mat, out string source)
        {
            source = "default";
            if (mat == null) return AlphaCombine;

            // 1. The real blend state. Shader Graph's Built-In target prefixes the properties it
            //    generates, so accept either spelling.
            if (TryReadBlendState(mat, out int src, out int dst, out int op, out string via))
            {
                int fromState = ClassifyBlendFactors(src, dst, op);
                if (fromState != AlphaUnknown)
                {
                    source = via;
                    return fromState;
                }
            }

            // 2. The serialized surface option. URP and the Built-In Shader Graph target both use
            //    `Blend`: Alpha=0, Premultiply=1, Additive=2, Multiply=3. HDRP's `_BlendMode`
            //    numbers the same names differently, so it is deliberately not read here.
            if (TryReadFloat(mat, out float surface, "_Blend", "_BUILTIN_Blend"))
            {
                switch ((int)surface)
                {
                    case 0: source = "surface option"; return AlphaCombine;
                    case 1: source = "surface option"; return AlphaPremultiplied;
                    case 2: source = "surface option"; return AlphaAdd;
                    case 3: source = "surface option"; return AlphaMultiply;
                }
            }

            // 3. Last resort: the shader's name. Order matters here too — "Alpha Blended
            //    Premultiply" contains "multiply" as a substring and is not a multiply blend.
            string sn = mat.shader != null ? mat.shader.name.ToLowerInvariant() : "";
            int fromName = AlphaUnknown;
            if (sn.Contains("additive")) fromName = AlphaAdd;
            else if (sn.Contains("premultiply")) fromName = AlphaPremultiplied;
            else if (sn.Contains("alpha blend") || sn.Contains("alphablend")) fromName = AlphaCombine;
            else if (sn.Contains("multiply") || sn.Contains("modulate")) fromName = AlphaMultiply;

            if (fromName != AlphaUnknown)
            {
                source = "shader name";
                Debug.LogWarning(
                    $"[Quarks Exporter] Material '{mat.name}' exposes no blend state; its blend mode was " +
                    $"guessed from the shader name '{mat.shader?.name}'. Verify it in the exported effect.");
                return fromName;
            }

            Debug.LogWarning(
                $"[Quarks Exporter] Material '{mat.name}' (shader '{mat.shader?.name}') exposes no readable " +
                "blend state and its name says nothing; defaulting to alpha blend.");
            return AlphaCombine;
        }

        /// <summary>Reads src/dst factors and the blend op, under either property spelling.</summary>
        private static bool TryReadBlendState(Material mat, out int src, out int dst, out int op, out string via)
        {
            src = dst = 0;
            op = (int)BlendOp.Add;
            via = null;
            if (!TryReadFloat(mat, out float dstF, "_DstBlend", "_BUILTIN_DstBlend")) return false;
            if (!TryReadFloat(mat, out float srcF, "_SrcBlend", "_BUILTIN_SrcBlend")) return false;
            if (TryReadFloat(mat, out float opF, "_BlendOp", "_BUILTIN_BlendOp")) op = (int)opF;
            src = (int)srcF;
            dst = (int)dstF;
            via = "blend factors";
            return true;
        }

        private static bool TryReadFloat(Material mat, out float value, params string[] names)
        {
            foreach (string name in names)
            {
                if (mat.HasProperty(name))
                {
                    value = mat.GetFloat(name);
                    return true;
                }
            }
            value = 0f;
            return false;
        }

        /// <summary>
        /// Classify a src/dst/op triple, or AlphaUnknown when it is not one of the modes quarks
        /// can express — better to fall through to another signal than to guess wrong here.
        /// </summary>
        private static int ClassifyBlendFactors(int src, int dst, int op)
        {
            bool subtractive = op == (int)BlendOp.Subtract || op == (int)BlendOp.ReverseSubtract;
            if (subtractive && dst == (int)BlendMode.One) return AlphaSubtract;
            if (op != (int)BlendOp.Add) return AlphaUnknown;

            if (dst == (int)BlendMode.One)
            {
                // SrcAlpha/One and One/One are both additive; the alpha term differs but the
                // colour contribution quarks reproduces is the same.
                if (src == (int)BlendMode.One || src == (int)BlendMode.SrcAlpha ||
                    src == (int)BlendMode.SrcAlphaSaturate) return AlphaAdd;
                return AlphaUnknown;
            }

            if (dst == (int)BlendMode.OneMinusSrcAlpha)
            {
                if (src == (int)BlendMode.One) return AlphaPremultiplied;
                if (src == (int)BlendMode.SrcAlpha) return AlphaCombine;
                return AlphaUnknown;
            }

            // Particles/Multiply is DstColor/Zero; the "double" variant is DstColor/SrcColor.
            if (src == (int)BlendMode.DstColor &&
                (dst == (int)BlendMode.Zero || dst == (int)BlendMode.SrcColor)) return AlphaMultiply;
            if (src == (int)BlendMode.Zero && dst == (int)BlendMode.SrcColor) return AlphaMultiply;

            return AlphaUnknown;
        }

        /// <summary>
        /// Babylon alpha mode → three.js `blending`, which numbers the same modes differently
        /// (three: Normal=1, Additive=2, Subtractive=3, Multiply=4). three.js has no premultiplied
        /// blending constant — it is normal blending plus a material flag — so it maps to Normal.
        /// </summary>
        private static int ToThreeBlending(int alphaMode)
        {
            switch (alphaMode)
            {
                case AlphaAdd: return 2;
                case AlphaSubtract: return 3;
                case AlphaMultiply: return 4;
                default: return 1;
            }
        }
    }
}
