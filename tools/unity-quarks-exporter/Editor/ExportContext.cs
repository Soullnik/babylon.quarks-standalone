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
    public class ExportContext : IDisposable
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

        /// <summary>
        /// Render each material once to measure its colour gain and, when its blend cannot be
        /// read, its blend (see <see cref="MaterialProbe"/>). Off, materials export untinted.
        /// </summary>
        public bool MeasureMaterials = true;

        private MaterialProbe _probe;

        public void Dispose()
        {
            _probe?.Dispose();
            _probe = null;
        }

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

        public string AddMaterialForRenderer(ParticleSystemRenderer renderer) =>
            AddMaterial(renderer != null ? renderer.sharedMaterial : null);

        public string AddMaterial(Material mat)
        {
            Texture tex = mat != null ? mat.mainTexture : null;
            string textureUuid = tex != null ? AddTexture(tex) : null;
            LastBlendMode = DetectBlend(mat, out string blendSource);
            MaterialProbe.Result measured = default(MaterialProbe.Result);
            if (mat != null && MeasureMaterials)
            {
                if (_probe == null) _probe = new MaterialProbe();
                measured = _probe.Measure(mat);
            }
            if (LastBlendMode == AlphaUnknown)
            {
                if (measured.Measured && measured.BlendMode != AlphaUnknown)
                {
                    LastBlendMode = measured.BlendMode;
                    blendSource = "measured";
                }
                else
                {
                    Debug.LogWarning(
                        $"[Quarks Exporter] Material '{mat.name}': blend mode not readable — {blendSource}, " +
                        $"and rendering it did not settle it either ({measured.Summary ?? "not measured"}). " +
                        "Exported as alpha blend; check it in the effect, or switch the material to a shader " +
                        "that exposes its blend (e.g. Particles/Standard Unlit, URP Particles/Unlit).");
                    LastBlendMode = AlphaCombine;
                    blendSource = "default";
                }
            }
            else if (measured.Measured && measured.BlendMode != AlphaUnknown && measured.BlendMode != LastBlendMode)
            {
                // What the material renders beats what its declarations say — a shader can do
                // its own premultiplying, say, which no Blend statement shows.
                Debug.LogWarning(
                    $"[Quarks Exporter] Material '{mat.name}': its {blendSource} read as alpha mode {LastBlendMode}, " +
                    $"but rendered it blends as {measured.BlendMode} ({measured.Summary}). Exporting what it renders.");
                LastBlendMode = measured.BlendMode;
                blendSource = "measured";
            }

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
            if (PlayerSettings.colorSpace == ColorSpace.Linear)
            {
                // A Linear project hands its particle shaders the particle colour as it is, as a
                // linear value; only textures are decoded. Tell the runtime to do the same.
                m.Set("vertexColorSpace", "linear");
            }
            JObject graph = mat != null ? CompileShaderGraph(mat) : null;
            if (graph != null)
            {
                // What the material's own shader computes; `texture` and `tint` stay as the
                // approximation for renderers and render modes that draw without it.
                m.Set("graph", graph);
            }
            if (measured.Measured && measured.VertexAlphaPower == 2)
            {
                // Its shader multiplies the whole colour, alpha included, by the particle alpha
                // once more (as measured): what covers the background takes it squared.
                m.Set("vertexAlphaPower", 2);
            }
            if (measured.Measured && !IsUntinted(measured.Tint))
            {
                // The linear-space gain the material puts on the particle colour — an HDR colour
                // or intensity, whatever its shader calls it — measured, not read off a property.
                Vector4 t = measured.Tint;
                m.Set("tint", new JArray().Add(Round4(t.x)).Add(Round4(t.y)).Add(Round4(t.z)).Add(Round4(t.w)));
            }
            Materials.Add(m);
            return uuid;
        }

        /// <summary>
        /// The material's Shader Graph, compiled with this material's values — or null when its
        /// shader is not a Shader Graph in the project, or uses something the compiler does not
        /// know (then the console says what, and the material draws as texture × colour).
        /// </summary>
        private JObject CompileShaderGraph(Material mat)
        {
            string path = mat.shader != null ? AssetDatabase.GetAssetPath(mat.shader) : null;
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
            string text;
            try
            {
                text = File.ReadAllText(path);
            }
            catch (IOException)
            {
                return null;
            }
            // A Shader Graph file is JSON; a ShaderLab file is not. Read by its content.
            string start = text.TrimStart();
            if (start.Length == 0 || start[0] != '{') return null;
            var compiler = new ShaderGraphCompiler();
            JObject graph = compiler.Compile(text, new GraphMaterialValues(this, mat));
            if (graph == null)
            {
                Debug.LogWarning($"[Quarks Exporter] Material '{mat.name}': its Shader Graph is not exported ({compiler.Error}); it draws as texture × colour.");
                return null;
            }
            if (PlayerSettings.colorSpace != ColorSpace.Linear) graph.Set("space", "gamma");
            return graph;
        }

        /// <summary>A material's values as its Shader Graph reads them.</summary>
        private sealed class GraphMaterialValues : IGraphMaterial
        {
            private readonly ExportContext _ctx;
            private readonly Material _mat;

            public GraphMaterialValues(ExportContext ctx, Material mat)
            {
                _ctx = ctx;
                _mat = mat;
            }

            public float[] Value(string reference, GraphPropertyKind kind)
            {
                if (!_mat.HasProperty(reference)) return new float[4];
                switch (kind)
                {
                    case GraphPropertyKind.Float:
                    case GraphPropertyKind.Boolean:
                        return new[] { _mat.GetFloat(reference), 0f, 0f, 0f };
                    case GraphPropertyKind.Vector:
                    {
                        Vector4 v = _mat.GetVector(reference);
                        return new[] { v.x, v.y, v.z, v.w };
                    }
                    default:
                    {
                        // In a Linear project a colour reaches the shader converted to linear —
                        // an HDR one is used as it is.
                        Color c = _mat.GetColor(reference);
                        if (kind == GraphPropertyKind.Color && PlayerSettings.colorSpace == ColorSpace.Linear) c = new Color(c.linear.r, c.linear.g, c.linear.b, c.a);
                        return new[] { c.r, c.g, c.b, c.a };
                    }
                }
            }

            public bool HasTexture(string reference) =>
                reference != null && _mat.HasProperty(reference) && _mat.GetTexture(reference) != null;

            public JToken Texture(string reference, float[] fallback)
            {
                Texture tex = HasTexture(reference) ? _mat.GetTexture(reference) : null;
                if (tex == null)
                {
                    var color = new JArray();
                    foreach (float f in fallback) color.Add(f);
                    return new JObject().Set("color", color);
                }
                // Colour textures are decoded to linear when sampled; data textures are not.
                bool srgb = !(AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(tex)) is TextureImporter importer) || importer.sRGBTexture;
                return new JObject().Set("texture", _ctx.AddTexture(tex)).Set("srgb", srgb && PlayerSettings.colorSpace == ColorSpace.Linear);
            }

            public float[] TextureTransform(string reference)
            {
                if (!_mat.HasProperty(reference)) return new[] { 1f, 1f, 0f, 0f };
                Vector2 scale = _mat.GetTextureScale(reference);
                Vector2 offset = _mat.GetTextureOffset(reference);
                return new[] { scale.x, scale.y, offset.x, offset.y };
            }
        }

        private static bool IsUntinted(Vector4 t) =>
            Mathf.Abs(t.x - 1f) < 0.01f && Mathf.Abs(t.y - 1f) < 0.01f && Mathf.Abs(t.z - 1f) < 0.01f && Mathf.Abs(t.w - 1f) < 0.01f;

        private static double Round4(float v) => Math.Round(v, 4);

        /// <summary>A Unity wrap mode as the three.js constant the loader reads.</summary>
        private static int WrapMode(TextureWrapMode mode)
        {
            switch (mode)
            {
                case TextureWrapMode.Repeat:
                    return 1000; // RepeatWrapping
                case TextureWrapMode.Mirror:
                case TextureWrapMode.MirrorOnce: // nearest there is: mirrored once, then clamped
                    return 1002; // MirroredRepeatWrapping
                default:
                    return 1001; // ClampToEdgeWrapping
            }
        }

        internal string AddTexture(Texture tex, bool envAtlas = false)
        {
            string url = ResolveTextureUrl(tex);
            if (!_imageByUrl.TryGetValue(url, out var imageUuid))
            {
                imageUuid = NewId("quarks_image");
                _imageByUrl[url] = imageUuid;
                Images.Add(new JObject().Set("uuid", imageUuid).Set("url", url));
            }
            string texUuid = NewId("quarks_texture");
            // The texture's own wrap modes: a Shader Graph scrolling a noise or mask across the
            // particle reads past 0–1 and needs Repeat where the texture has it. The env atlas is
            // a baked 3×2 sheet and always clamps.
            var t = new JObject()
                .Set("uuid", texUuid)
                .Set("name", tex.name)
                .Set("image", imageUuid)
                .Set("wrap", envAtlas
                    ? new JArray().Add(1001).Add(1001)
                    : new JArray().Add(WrapMode(tex.wrapModeU)).Add(WrapMode(tex.wrapModeV)));
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
        /// Finds the cubemap the material's shader samples, by what its texture properties *are*:
        /// the shader's own declared properties whose texture dimension is Cube. Neither the
        /// property's name nor the material's saved-property list is consulted — the latter keeps
        /// textures from shaders the material used before, which the current shader never reads.
        /// </summary>
        private static Cubemap FindReflectionCubemap(Material mat)
        {
            if (mat == null || mat.shader == null) return null;
            Shader shader = mat.shader;
            Cubemap found = null;
            var bound = new List<string>();
            for (int i = 0; i < shader.GetPropertyCount(); i++)
            {
                if (shader.GetPropertyType(i) != ShaderPropertyType.Texture) continue;
                if (shader.GetPropertyTextureDimension(i) != TextureDimension.Cube) continue;
                string property = shader.GetPropertyName(i);
                if (mat.GetTexture(property) is Cubemap cube)
                {
                    bound.Add(property);
                    if (found == null) found = cube;
                }
            }
            if (bound.Count > 1)
            {
                Debug.LogWarning(
                    $"[Quarks Exporter] Material '{mat.name}' binds {bound.Count} cubemaps " +
                    $"({string.Join(", ", bound)}); quarks samples one reflection map, so the first " +
                    $"declared ({bound[0]}) is exported.");
            }
            return found;
        }

        /// <summary>
        /// Reflection strength. There is no Unity-defined property for it and the value's meaning
        /// is not recoverable from data, so this is the one place the exporter reads properties by
        /// a list of names: each name states what the property holds, which is the only evidence
        /// there is. Only properties the current shader declares as numbers are read.
        /// </summary>
        private static float ReadReflectionLevel(Material mat)
        {
            if (mat == null || mat.shader == null) return 1f;
            string[] names = { "_ReflectionIntensity", "_ReflectionStrength", "_EnvIntensity" };
            foreach (string name in names)
            {
                int index = mat.shader.FindPropertyIndex(name);
                if (index < 0) continue;
                ShaderPropertyType type = mat.shader.GetPropertyType(index);
                if (type != ShaderPropertyType.Float && type != ShaderPropertyType.Range) continue;
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
                // Only the source file of a format a browser can decode is worth embedding
                // as-is. The format is read from the file's own header, not its extension.
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    try
                    {
                        byte[] bytes = File.ReadAllBytes(path);
                        string mime = WebImageMimeType(bytes);
                        if (mime != null)
                        {
                            byte[] imported = WithImportedAlpha(path, bytes);
                            return imported != null
                                ? "data:image/png;base64," + Convert.ToBase64String(imported)
                                : "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
                        }
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

        /// <summary>
        /// The file's pixels with the alpha Unity's importer gives them, as a PNG — or null when
        /// that is the file's own alpha and the file can go out unchanged. The importer's Alpha
        /// Source can take alpha from the colour's grayscale or drop it, and particle textures are
        /// very often imported that way from files with no alpha of their own: embedded as they
        /// are, those draw as opaque squares.
        /// </summary>
        private static byte[] WithImportedAlpha(string path, byte[] fileBytes)
        {
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null || importer.alphaSource == TextureImporterAlphaSource.FromInput) return null;
            bool fromGray = importer.alphaSource == TextureImporterAlphaSource.FromGrayScale;
            var decoded = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            Texture2D output = null;
            try
            {
                if (!decoded.LoadImage(fileBytes)) return null;
                Color32[] pixels = decoded.GetPixels32();
                for (int i = 0; i < pixels.Length; i++)
                {
                    Color32 c = pixels[i];
                    // Color.grayscale's weights, on the stored (gamma) values, as the importer does.
                    pixels[i].a = fromGray ? (byte)Mathf.RoundToInt(0.299f * c.r + 0.587f * c.g + 0.114f * c.b) : (byte)255;
                }
                // A file without alpha decodes to a format without it; write into one that has it.
                output = new Texture2D(decoded.width, decoded.height, TextureFormat.RGBA32, false);
                output.SetPixels32(pixels);
                output.Apply(false);
                return output.EncodeToPNG();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Quarks Exporter] Could not apply the imported alpha of '{path}', embedding the file as it is: {e.Message}");
                return null;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(decoded);
                if (output != null) UnityEngine.Object.DestroyImmediate(output);
            }
        }

        /// <summary>
        /// The MIME type of a browser-decodable image, identified by its signature bytes, or null
        /// for anything else (TGA, PSD, EXR…), which then goes through the GPU re-encode.
        /// </summary>
        private static string WebImageMimeType(byte[] b)
        {
            if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 &&
                b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A)
                return "image/png";
            if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF)
                return "image/jpeg";
            if (b.Length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 &&
                b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50)
                return "image/webp"; // "RIFF" .... "WEBP"
            return null;
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
        internal const int AlphaAdd = 1;
        internal const int AlphaCombine = 2;
        internal const int AlphaSubtract = 3;
        internal const int AlphaMultiply = 4;
        internal const int AlphaPremultiplied = 7;
        internal const int AlphaUnknown = -1;

        /// <summary>
        /// Resolve a material's blend mode from data only — never from the name of the shader,
        /// the material or anything else an author can rename without changing what renders.
        ///
        /// 1. The shader's ShaderLab source, when it is a file in the project: the Blend and
        ///    BlendOp statements it actually renders with, with any [_Property] references read
        ///    through the material. This is the most direct source there is, and it also covers
        ///    shaders that hard-code their blend or route it through properties with their own names.
        /// 2. The blend-factor properties Unity's own shaders and Shader Graph expose.
        /// 3. The `Blend` surface option those shaders serialize one level up.
        ///
        /// When none of that is readable — a Unity built-in shader with a hard-coded blend has no
        /// source on disk and no properties — this returns AlphaUnknown with the reason in
        /// <paramref name="source"/>, and the caller measures the material by rendering it
        /// (<see cref="MaterialProbe"/>). It does not guess.
        /// </summary>
        private static int DetectBlend(Material mat, out string source)
        {
            source = "default";
            if (mat == null) return AlphaCombine;

            ShaderSourceBlend fromSource = TryReadShaderSourceBlend(mat, out int src, out int dst, out int op);
            int sourceSrc = src, sourceDst = dst, sourceOp = op;
            if (fromSource == ShaderSourceBlend.Factors)
            {
                int mode = ClassifyBlendFactors(src, dst, op);
                if (mode != AlphaUnknown)
                {
                    source = "shader source";
                    return RefinePremultiplied(mat, mode);
                }
            }

            if (TryReadBlendState(mat, out src, out dst, out op, out string via))
            {
                int mode = ClassifyBlendFactors(src, dst, op);
                if (mode != AlphaUnknown)
                {
                    source = via;
                    return RefinePremultiplied(mat, mode);
                }
            }

            // URP and the Built-In Shader Graph target both serialize `Blend` as Alpha=0,
            // Premultiply=1, Additive=2, Multiply=3. HDRP's `_BlendMode` numbers the same names
            // differently, so it is deliberately not read. Their Premultiply mode multiplies
            // colour by alpha inside the shader, so what reaches the blender is straight alpha.
            if (TryReadFloat(mat, out float surface, "_Blend", "_BUILTIN_Blend"))
            {
                switch ((int)surface)
                {
                    case 0: source = "surface option"; return AlphaCombine;
                    case 1: source = "surface option"; return AlphaCombine;
                    case 2: source = "surface option"; return AlphaAdd;
                    case 3: source = "surface option"; return AlphaMultiply;
                }
            }

            source = fromSource == ShaderSourceBlend.Opaque
                ? "its shader source declares no blending (opaque), which quarks particles cannot express"
                : fromSource == ShaderSourceBlend.Factors
                    ? $"its shader's blend (src {(BlendMode)sourceSrc}, dst {(BlendMode)sourceDst}, op {sourceOp}) has no quarks equivalent"
                    : "its shader exposes no blend properties and has no ShaderLab source in the project";
            return AlphaUnknown;
        }

        /// <summary>
        /// One/OneMinusSrcAlpha means two different things. Unity's modern particle shaders
        /// (Built-in Standard Particles, URP, Shader Graph) switch on _ALPHAPREMULTIPLY_ON and
        /// multiply colour by alpha *in the shader*, so the texture is straight alpha and quarks —
        /// whose shader outputs straight colour — must alpha-blend it. Without that keyword the
        /// premultiplication is baked into the texture itself, and quarks must blend premultiplied.
        /// </summary>
        private static int RefinePremultiplied(Material mat, int mode)
        {
            if (mode != AlphaPremultiplied) return mode;
            bool premultipliesInShader =
                mat.IsKeywordEnabled("_ALPHAPREMULTIPLY_ON") || mat.IsKeywordEnabled("_BUILTIN_ALPHAPREMULTIPLY_ON");
            return premultipliesInShader ? AlphaCombine : AlphaPremultiplied;
        }

        private enum ShaderSourceBlend { Unreadable, Opaque, Factors }

        /// <summary>
        /// Reads the blend state out of the shader's ShaderLab source. A parser for the language,
        /// not a keyword search: Blend / BlendOp are read as statements from the first SubShader,
        /// inheriting Category and SubShader state, from the first pass that blends (so a leading
        /// depth-only pass is not mistaken for the colour pass). Program blocks, comments and
        /// strings are skipped, so shader code that mentions the word never matches.
        ///
        /// Mirrored by tools/unity-effect-audit/shaderlab.py, where the cases it handles are
        /// tested — keep the two in step.
        /// </summary>
        private static ShaderSourceBlend TryReadShaderSourceBlend(Material mat, out int src, out int dst, out int op)
        {
            src = dst = 0;
            op = (int)BlendOp.Add;
            if (mat.shader == null) return ShaderSourceBlend.Unreadable;
            string path = AssetDatabase.GetAssetPath(mat.shader);
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return ShaderSourceBlend.Unreadable;

            string text;
            try
            {
                text = File.ReadAllText(path);
            }
            catch (Exception)
            {
                return ShaderSourceBlend.Unreadable;
            }

            // Content, not the file extension, decides whether this is ShaderLab: a Shader Graph
            // asset is JSON and starts with `{`.
            List<ShaderLabToken> tokens = ShaderLabLex(text);
            if (tokens.Count == 0 || !tokens[0].IsWord("Shader")) return ShaderSourceBlend.Unreadable;

            int pos = 0;
            ShaderLabBlock root = ShaderLabParseBlock(tokens, ref pos, "");
            if (!ShaderLabFirstSubShader(root, null, null, out ShaderLabBlock sub,
                    out ShaderLabBlend inheritedBlend, out ShaderLabFactor inheritedOp))
            {
                return ShaderSourceBlend.Unreadable;
            }

            ShaderLabBlend blend = sub.Blend ?? inheritedBlend;
            ShaderLabFactor blendOp = sub.Op ?? inheritedOp;
            var candidates = new List<KeyValuePair<ShaderLabBlend, ShaderLabFactor>>();
            foreach (ShaderLabBlock child in sub.Children)
            {
                if (child.Kind == "pass")
                {
                    candidates.Add(new KeyValuePair<ShaderLabBlend, ShaderLabFactor>(
                        child.Blend ?? blend, child.Op ?? blendOp));
                }
            }
            if (candidates.Count == 0)
            {
                candidates.Add(new KeyValuePair<ShaderLabBlend, ShaderLabFactor>(blend, blendOp));
            }

            foreach (var candidate in candidates)
            {
                ShaderLabBlend b = candidate.Key;
                if (b == null || b.Off) continue;
                if (!ShaderLabResolveFactor(mat, b.Src, out src) || !ShaderLabResolveFactor(mat, b.Dst, out dst))
                {
                    return ShaderSourceBlend.Unreadable;
                }
                if (!ShaderLabResolveOp(mat, candidate.Value, out op)) return ShaderSourceBlend.Unreadable;
                return ShaderSourceBlend.Factors;
            }
            return ShaderSourceBlend.Opaque;
        }

        private struct ShaderLabToken
        {
            public char Kind; // 'w' word, 's' string, 'p' punctuation
            public string Value;

            public bool IsWord(string word) =>
                Kind == 'w' && string.Equals(Value, word, StringComparison.OrdinalIgnoreCase);

            public bool IsPunct(char c) => Kind == 'p' && Value.Length == 1 && Value[0] == c;
        }

        private sealed class ShaderLabFactor
        {
            public bool IsProperty; // [_Name] reference rather than a literal keyword
            public string Value;
        }

        private sealed class ShaderLabBlend
        {
            public bool Off;
            public ShaderLabFactor Src, Dst;
        }

        private sealed class ShaderLabBlock
        {
            public string Kind;
            public ShaderLabBlend Blend;
            public ShaderLabFactor Op;
            public readonly List<ShaderLabBlock> Children = new List<ShaderLabBlock>();
        }

        private static readonly Dictionary<string, string> ShaderLabProgramBlocks =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "CGPROGRAM", "ENDCG" }, { "CGINCLUDE", "ENDCG" },
                { "HLSLPROGRAM", "ENDHLSL" }, { "HLSLINCLUDE", "ENDHLSL" },
                { "GLSLPROGRAM", "ENDGLSL" }, { "GLSLINCLUDE", "ENDGLSL" },
            };

        private static bool ShaderLabWordChar(char c) =>
            char.IsLetterOrDigit(c) || c == '_' || c == '.' || c == '-' || c == '+';

        private static List<ShaderLabToken> ShaderLabLex(string text)
        {
            var tokens = new List<ShaderLabToken>();
            int i = 0, n = text.Length;
            while (i < n)
            {
                char c = text[i];
                if (char.IsWhiteSpace(c))
                {
                    i++;
                }
                else if (c == '/' && i + 1 < n && text[i + 1] == '/')
                {
                    int j = text.IndexOf('\n', i);
                    i = j < 0 ? n : j;
                }
                else if (c == '/' && i + 1 < n && text[i + 1] == '*')
                {
                    int j = text.IndexOf("*/", i + 2, StringComparison.Ordinal);
                    i = j < 0 ? n : j + 2;
                }
                else if (c == '"')
                {
                    int j = text.IndexOf('"', i + 1);
                    if (j < 0) j = n;
                    tokens.Add(new ShaderLabToken { Kind = 's', Value = text.Substring(i + 1, j - i - 1) });
                    i = j + 1;
                }
                else if ("{}[](),=".IndexOf(c) >= 0)
                {
                    tokens.Add(new ShaderLabToken { Kind = 'p', Value = c.ToString() });
                    i++;
                }
                else
                {
                    int j = i;
                    while (j < n && ShaderLabWordChar(text[j])) j++;
                    if (j == i)
                    {
                        i++;
                        continue;
                    }
                    string word = text.Substring(i, j - i);
                    i = j;
                    if (ShaderLabProgramBlocks.TryGetValue(word, out string end))
                    {
                        i = ShaderLabFindWord(text, end, i);
                        continue;
                    }
                    tokens.Add(new ShaderLabToken { Kind = 'w', Value = word });
                }
            }
            return tokens;
        }

        /// <summary>Index just past the next whole-word occurrence of `word`, or the end.</summary>
        private static int ShaderLabFindWord(string text, string word, int from)
        {
            int i = from;
            while (true)
            {
                int j = text.IndexOf(word, i, StringComparison.Ordinal);
                if (j < 0) return text.Length;
                bool startOk = j == 0 || !ShaderLabWordChar(text[j - 1]);
                int after = j + word.Length;
                bool endOk = after >= text.Length || !ShaderLabWordChar(text[after]);
                if (startOk && endOk) return after;
                i = j + 1;
            }
        }

        private static ShaderLabFactor ShaderLabParseFactor(List<ShaderLabToken> t, ref int pos)
        {
            if (pos < t.Count && t[pos].IsPunct('['))
            {
                if (pos + 2 < t.Count && t[pos + 1].Kind == 'w' && t[pos + 2].IsPunct(']'))
                {
                    var f = new ShaderLabFactor { IsProperty = true, Value = t[pos + 1].Value };
                    pos += 3;
                    return f;
                }
                pos++;
                return null;
            }
            if (pos < t.Count && t[pos].Kind == 'w')
            {
                return new ShaderLabFactor { IsProperty = false, Value = t[pos++].Value };
            }
            return null;
        }

        /// <summary>Optional render-target index (`Blend 1 One One`); only target 0 counts.</summary>
        private static int ShaderLabRenderTarget(List<ShaderLabToken> t, ref int pos)
        {
            if (pos < t.Count && t[pos].Kind == 'w' && int.TryParse(t[pos].Value, out int rt))
            {
                pos++;
                return rt;
            }
            return 0;
        }

        /// <summary>Blend Off | Blend [rt] src dst [, srcA dstA].</summary>
        private static ShaderLabBlend ShaderLabParseBlend(List<ShaderLabToken> t, ref int pos)
        {
            int rt = ShaderLabRenderTarget(t, ref pos);
            if (pos < t.Count && t[pos].IsWord("Off"))
            {
                pos++;
                return rt == 0 ? new ShaderLabBlend { Off = true } : null;
            }
            ShaderLabFactor src = ShaderLabParseFactor(t, ref pos);
            ShaderLabFactor dst = ShaderLabParseFactor(t, ref pos);
            if (pos < t.Count && t[pos].IsPunct(','))
            {
                pos++;
                ShaderLabParseFactor(t, ref pos);
                ShaderLabParseFactor(t, ref pos);
            }
            if (src == null || dst == null || rt != 0) return null;
            return new ShaderLabBlend { Src = src, Dst = dst };
        }

        /// <summary>BlendOp [rt] op [, opA].</summary>
        private static ShaderLabFactor ShaderLabParseBlendOp(List<ShaderLabToken> t, ref int pos)
        {
            int rt = ShaderLabRenderTarget(t, ref pos);
            ShaderLabFactor op = ShaderLabParseFactor(t, ref pos);
            if (pos < t.Count && t[pos].IsPunct(','))
            {
                pos++;
                ShaderLabParseFactor(t, ref pos);
            }
            return rt == 0 ? op : null;
        }

        private static ShaderLabBlock ShaderLabParseBlock(List<ShaderLabToken> t, ref int pos, string kind)
        {
            var block = new ShaderLabBlock { Kind = kind };
            string lastWord = null;
            while (pos < t.Count)
            {
                ShaderLabToken token = t[pos];
                if (token.IsPunct('}'))
                {
                    pos++;
                    return block;
                }
                if (token.IsPunct('{'))
                {
                    pos++;
                    block.Children.Add(ShaderLabParseBlock(t, ref pos, (lastWord ?? "").ToLowerInvariant()));
                    lastWord = null;
                    continue;
                }
                if (token.IsWord("Blend"))
                {
                    pos++;
                    ShaderLabBlend blend = ShaderLabParseBlend(t, ref pos);
                    if (blend != null && block.Blend == null) block.Blend = blend;
                    lastWord = null;
                    continue;
                }
                if (token.IsWord("BlendOp"))
                {
                    pos++;
                    ShaderLabFactor op = ShaderLabParseBlendOp(t, ref pos);
                    if (op != null && block.Op == null) block.Op = op;
                    lastWord = null;
                    continue;
                }
                if (token.Kind == 'w') lastWord = token.Value;
                pos++;
            }
            return block;
        }

        private static bool ShaderLabFirstSubShader(ShaderLabBlock node, ShaderLabBlend blend, ShaderLabFactor op,
            out ShaderLabBlock sub, out ShaderLabBlend inheritedBlend, out ShaderLabFactor inheritedOp)
        {
            foreach (ShaderLabBlock child in node.Children)
            {
                if (child.Kind == "subshader")
                {
                    sub = child;
                    inheritedBlend = blend;
                    inheritedOp = op;
                    return true;
                }
                if (child.Kind == "shader" || child.Kind == "category")
                {
                    if (ShaderLabFirstSubShader(child, child.Blend ?? blend, child.Op ?? op,
                            out sub, out inheritedBlend, out inheritedOp))
                    {
                        return true;
                    }
                }
            }
            sub = null;
            inheritedBlend = null;
            inheritedOp = null;
            return false;
        }

        /// <summary>
        /// A ShaderLab factor keyword or [_Property] → UnityEngine.Rendering.BlendMode. The
        /// keywords are the enum's own member names, so this parses the language rather than
        /// matching anything.
        /// </summary>
        private static bool ShaderLabResolveFactor(Material mat, ShaderLabFactor factor, out int value)
        {
            value = 0;
            if (factor.IsProperty)
            {
                if (!TryReadFloat(mat, out float v, factor.Value)) return false;
                value = (int)v;
                return true;
            }
            if (int.TryParse(factor.Value, out _)) return false;
            if (!Enum.TryParse(factor.Value, true, out BlendMode mode)) return false;
            value = (int)mode;
            return true;
        }

        /// <summary>
        /// A ShaderLab BlendOp keyword or [_Property] → UnityEngine.Rendering.BlendOp. ShaderLab
        /// spells subtract "Sub" / "RevSub" where the enum says Subtract / ReverseSubtract; any op
        /// quarks cannot express comes back as an unsupported value rather than as Add.
        /// </summary>
        private static bool ShaderLabResolveOp(Material mat, ShaderLabFactor factor, out int value)
        {
            value = (int)BlendOp.Add;
            if (factor == null) return true;
            if (factor.IsProperty)
            {
                if (!TryReadFloat(mat, out float v, factor.Value)) return false;
                value = (int)v;
                return true;
            }
            switch (factor.Value.ToLowerInvariant())
            {
                case "add": value = (int)BlendOp.Add; return true;
                case "sub": value = (int)BlendOp.Subtract; return true;
                case "revsub": value = (int)BlendOp.ReverseSubtract; return true;
                case "min": value = (int)BlendOp.Min; return true;
                case "max": value = (int)BlendOp.Max; return true;
                default: value = -2; return true;
            }
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
