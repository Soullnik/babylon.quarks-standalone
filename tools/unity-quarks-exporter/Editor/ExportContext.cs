using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

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

        /// <summary>Blend mode of the most recently built material — read straight after AddMaterialForRenderer.</summary>
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
            LastBlendMode = DetectBlend(mat);

            string uuid = NewId("quarks_material");
            var m = new JObject()
                .Set("uuid", uuid)
                .Set("type", "QuarksMaterial")
                .Set("transparent", true)
                .Set("alphaMode", LastBlendMode)
                .Set("blending", LastBlendMode)
                .Set("depthTest", true)
                .Set("depthWrite", false)
                .Set("alphaTest", 0);
            if (textureUuid != null)
            {
                // Write both keys: `texture` for QuarksMaterial and `map` for three.js compatibility.
                m.Set("texture", textureUuid);
                m.Set("map", textureUuid);
            }
            Materials.Add(m);
            return uuid;
        }

        private string AddTexture(Texture tex)
        {
            string url = ResolveTextureUrl(tex);
            if (!_imageByUrl.TryGetValue(url, out var imageUuid))
            {
                imageUuid = NewId("quarks_image");
                _imageByUrl[url] = imageUuid;
                Images.Add(new JObject().Set("uuid", imageUuid).Set("url", url));
            }
            string texUuid = NewId("quarks_texture");
            Textures.Add(new JObject()
                .Set("uuid", texUuid)
                .Set("name", tex.name)
                .Set("image", imageUuid)
                .Set("wrap", new JArray().Add(1001).Add(1001)));
            return texUuid;
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

        private static int DetectBlend(Material mat)
        {
            // quarks/Babylon blend ints: 1 = additive, 2 = alpha blend, 3 = subtract, 4 = multiply.
            if (mat == null) return 2;
            string sn = mat.shader != null ? mat.shader.name.ToLowerInvariant() : "";
            if (sn.Contains("additive")) return 1;
            if (sn.Contains("multiply")) return 4;
            if (mat.HasProperty("_DstBlend") && (int)mat.GetFloat("_DstBlend") == 1)
            {
                return 1; // DstBlend == One → additive
            }
            return 2;
        }
    }
}
