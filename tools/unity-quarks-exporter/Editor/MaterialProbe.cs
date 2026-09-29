using System;
using System.Collections.Generic;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Measures what a material does to a particle's colour by rendering it: a quad with the
    /// material, a plain white texture in its main slot and white vertex colour, over black and
    /// over white, into a float target, in a preview scene of its own. Whatever the shader is —
    /// Shader Graph, hand-written, built-in — the blend writes out = src + k·dst, and those two
    /// renders give src and k directly. Doing it at two texture alphas shows how both follow alpha.
    ///
    /// From that: the linear-space gain the material puts on the colour (an HDR colour, an
    /// intensity slider — whatever the shader calls it), and which blend it performs.
    /// </summary>
    internal sealed class MaterialProbe : IDisposable
    {
        public struct Result
        {
            /// <summary>False when the material could not be measured; nothing below applies.</summary>
            public bool Measured;
            /// <summary>Linear gain on RGB, and the multiplier on alpha — all ones for none.</summary>
            public Vector4 Tint;
            /// <summary>The Babylon alpha mode the measurement shows, or -1 when it does not settle one.</summary>
            public int BlendMode;
            /// <summary>
            /// How the particle (vertex) alpha enters the alpha that covers what is behind: 1 as is,
            /// 2 squared — a shader multiplying its whole output, alpha included, by it once more.
            /// </summary>
            public int VertexAlphaPower;
            /// <summary>What was seen, for the log.</summary>
            public string Summary;
        }

        private const int Size = 16;
        private const float QuadSize = 1.25f;

        private Scene _scene;
        private GameObject _cameraGo;
        private GameObject _quadGo;
        private Camera _camera;
        private MeshRenderer _renderer;
        private Mesh _mesh;
        private RenderTexture _target;
        private Texture2D _readback;
        private Texture2D _opaqueWhite;
        private Texture2D _halfWhite;
        private readonly Dictionary<Material, Result> _cache = new Dictionary<Material, Result>();
        private Vector4 _background0;
        private Vector4 _background1;
        private bool _ready;
        private bool _failed;

        public Result Measure(Material material)
        {
            if (material == null) return default(Result);
            if (_cache.TryGetValue(material, out Result cached)) return cached;
            Result result = default(Result);
            try
            {
                if (EnsureRig()) result = MeasureOnRig(material);
            }
            catch (Exception e)
            {
                result = new Result { Summary = "probe failed: " + e.GetBaseException().Message };
            }
            _cache[material] = result;
            return result;
        }

        private bool EnsureRig()
        {
            if (_ready) return true;
            if (_failed) return false;
            _failed = true;

            _scene = EditorSceneManager.NewPreviewScene();
            _target = new RenderTexture(Size, Size, 24, RenderTextureFormat.ARGBHalf, RenderTextureReadWrite.Linear)
            {
                antiAliasing = 1,
                filterMode = FilterMode.Point,
                hideFlags = HideFlags.HideAndDontSave,
            };
            _target.Create();
            _readback = new Texture2D(Size, Size, TextureFormat.RGBAHalf, false, true) { hideFlags = HideFlags.HideAndDontSave };
            _opaqueWhite = Solid(1f);
            _halfWhite = Solid(0.5f);

            // The quad the capture tool measured blends with, as authored there.
            _mesh = new Mesh { name = "QuarksMaterialProbeQuad", hideFlags = HideFlags.HideAndDontSave };
            float h = QuadSize * 0.5f;
            _mesh.vertices = new[] { new Vector3(-h, -h, 0f), new Vector3(h, -h, 0f), new Vector3(-h, h, 0f), new Vector3(h, h, 0f) };
            _mesh.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0f, 1f), new Vector2(1f, 1f) };
            _mesh.colors = new[] { Color.white, Color.white, Color.white, Color.white };
            var normal = new Vector3(0f, 0f, -1f);
            _mesh.normals = new[] { normal, normal, normal, normal };
            var tangent = new Vector4(1f, 0f, 0f, -1f);
            _mesh.tangents = new[] { tangent, tangent, tangent, tangent };
            _mesh.triangles = new[] { 0, 2, 1, 2, 3, 1 };
            _mesh.RecalculateBounds();

            _quadGo = new GameObject("QuarksMaterialProbeQuad") { hideFlags = HideFlags.HideAndDontSave };
            SceneManager.MoveGameObjectToScene(_quadGo, _scene);
            _quadGo.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = _quadGo.AddComponent<MeshRenderer>();
            _renderer.shadowCastingMode = ShadowCastingMode.Off;
            _renderer.receiveShadows = false;

            _cameraGo = new GameObject("QuarksMaterialProbeCamera") { hideFlags = HideFlags.HideAndDontSave };
            SceneManager.MoveGameObjectToScene(_cameraGo, _scene);
            _cameraGo.transform.position = new Vector3(0f, 0f, -1f);
            _camera = _cameraGo.AddComponent<Camera>();
            // A preview camera renders only its own scene, and pipelines leave post-processing
            // and scene volumes off for it — the measurement sees the material and nothing else.
            _camera.cameraType = CameraType.Preview;
            _camera.scene = _scene;
            _camera.orthographic = true;
            _camera.orthographicSize = 0.5f;
            _camera.nearClipPlane = 0.1f;
            _camera.farClipPlane = 10f;
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.allowHDR = true;
            _camera.allowMSAA = false;
            _camera.targetTexture = _target;

            OffscreenRender.Reset();
            _renderer.enabled = false;
            _background0 = RenderOver(0f);
            if (!OffscreenRender.Works) return false;
            _background1 = RenderOver(1f);
            _renderer.enabled = true;
            if (_background1.x - _background0.x < 0.5f) return false;

            _failed = false;
            _ready = true;
            return true;
        }

        private Result MeasureOnRig(Material material)
        {
            if (material.shader == null || !HasMainTexture(material.shader))
            {
                return new Result { Summary = "shader has no main texture to replace" };
            }
            var copy = new Material(material) { hideFlags = HideFlags.HideAndDontSave };
            try
            {
                copy.mainTexture = _opaqueWhite;
                _renderer.sharedMaterial = copy;
                Vector4 src1 = RenderOver(0f) - _background0;
                Vector4 k1 = Factor(RenderOver(1f), src1);
                copy.mainTexture = _halfWhite;
                Vector4 srcHalf = RenderOver(0f) - _background0;
                Vector4 kHalf = Factor(RenderOver(1f), srcHalf);
                // Once more with the particle at half alpha, to see how that alpha covers.
                copy.mainTexture = _opaqueWhite;
                SetVertexAlpha(0.5f);
                Vector4 srcFaded = RenderOver(0f) - _background0;
                Vector4 kFaded = Factor(RenderOver(1f), srcFaded);
                SetVertexAlpha(1f);
                return Interpret(src1, k1, srcHalf, kHalf, kFaded);
            }
            finally
            {
                _renderer.sharedMaterial = null;
                UnityEngine.Object.DestroyImmediate(copy);
            }
        }

        private void SetVertexAlpha(float alpha)
        {
            var c = new Color(1f, 1f, 1f, alpha);
            _mesh.colors = new[] { c, c, c, c };
        }

        /// <summary>k per channel: how much of the destination survives, from the render over white.</summary>
        private Vector4 Factor(Vector4 overWhite, Vector4 src)
        {
            float span = _background1.x - _background0.x;
            return new Vector4(
                (overWhite.x - _background0.x - src.x) / span,
                (overWhite.y - _background0.y - src.y) / span,
                (overWhite.z - _background0.z - src.z) / span,
                0f);
        }

        private static Result Interpret(Vector4 src1, Vector4 k1, Vector4 srcHalf, Vector4 kHalf, Vector4 kFaded)
        {
            float kFull = (k1.x + k1.y + k1.z) / 3f;
            float kHalfMean = (kHalf.x + kHalf.y + kHalf.z) / 3f;
            float lumFull = Luminance(src1);
            float lumHalf = Luminance(srcHalf);
            string seen = string.Format(System.Globalization.CultureInfo.InvariantCulture,
                "src {0:0.###},{1:0.###},{2:0.###} k {3:0.###} at texture alpha 1; src {4:0.###} k {5:0.###} at 0.5",
                src1.x, src1.y, src1.z, kFull, lumHalf, kHalfMean);
            var result = new Result { Measured = true, BlendMode = -1, Tint = Vector4.one, VertexAlphaPower = 1, Summary = seen };

            if (kFull > 0.9f && kHalfMean > 0.9f)
            {
                // The destination always survives whole: additive, and alpha shows only in src.
                result.BlendMode = ExportContext.AlphaAdd;
                result.Tint = new Vector4(src1.x, src1.y, src1.z, 1f);
                return result;
            }

            float alphaFull = 1f - kFull;
            if (alphaFull < 0.05f || lumFull <= 1e-4f)
            {
                result.Measured = false;
                result.Summary = seen + " — neither additive nor covering; left as authored";
                return result;
            }

            // Colour that halves with the texture's alpha is straight alpha blending; colour
            // that ignores it means the texture is taken as premultiplied.
            float colourRatio = lumHalf / lumFull;
            bool premultiplied = colourRatio >= 0.8f;
            result.Tint = premultiplied
                ? new Vector4(src1.x, src1.y, src1.z, alphaFull)
                : new Vector4(src1.x / alphaFull, src1.y / alphaFull, src1.z / alphaFull, alphaFull);

            // At particle alpha 0.5 the covering alpha is half the full one when the shader takes
            // the particle alpha once, a quarter when it multiplies it in twice.
            float alphaFaded = 1f - (kFaded.x + kFaded.y + kFaded.z) / 3f;
            float fadedRatio = alphaFaded / alphaFull;
            if (fadedRatio > 0.15f && fadedRatio < 0.375f) result.VertexAlphaPower = 2;
            result.Summary += string.Format(System.Globalization.CultureInfo.InvariantCulture, "; covering alpha {0:0.###} at particle alpha 0.5", alphaFaded);

            // Only call the blend when alpha itself follows the texture the plain way; shaders that
            // reshape alpha (dissolves, masks, opacity boosts) still give a gain, not a verdict.
            float alphaHalf = 1f - kHalfMean;
            float alphaRatio = alphaHalf / alphaFull;
            if (alphaRatio > 0.3f && alphaRatio < 0.7f)
            {
                if (premultiplied) result.BlendMode = ExportContext.AlphaPremultiplied;
                else if (colourRatio > 0.3f && colourRatio < 0.7f) result.BlendMode = ExportContext.AlphaCombine;
            }
            return result;
        }

        /// <summary>
        /// Whether the shader has the texture <see cref="Material.mainTexture"/> addresses — one
        /// flagged [MainTexture], or Unity's conventional _MainTex — so setting it cannot fail.
        /// </summary>
        private static bool HasMainTexture(Shader shader)
        {
            int count = shader.GetPropertyCount();
            for (int i = 0; i < count; i++)
            {
                if (shader.GetPropertyType(i) != ShaderPropertyType.Texture) continue;
                if ((shader.GetPropertyFlags(i) & ShaderPropertyFlags.MainTexture) != 0) return true;
                if (shader.GetPropertyName(i) == "_MainTex") return true;
            }
            return false;
        }

        private static float Luminance(Vector4 c) => 0.2126f * c.x + 0.7152f * c.y + 0.0722f * c.z;

        /// <summary>Renders once over a grey level and returns the mean of the middle of the target.</summary>
        private Vector4 RenderOver(float background)
        {
            _camera.backgroundColor = new Color(background, background, background, 0f);
            OffscreenRender.Render(_camera, _target);
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = _target;
            _readback.ReadPixels(new Rect(0, 0, Size, Size), 0, 0, false);
            _readback.Apply(false);
            RenderTexture.active = previous;
            var sum = Vector4.zero;
            int count = 0;
            for (int y = Size / 4; y < Size * 3 / 4; y++)
            {
                for (int x = Size / 4; x < Size * 3 / 4; x++)
                {
                    Color c = _readback.GetPixel(x, y);
                    sum += new Vector4(c.r, c.g, c.b, c.a);
                    count++;
                }
            }
            return sum / count;
        }

        private static Texture2D Solid(float alpha)
        {
            var tex = new Texture2D(4, 4, TextureFormat.RGBA32, false, false)
            {
                hideFlags = HideFlags.HideAndDontSave,
                wrapMode = TextureWrapMode.Clamp,
            };
            var pixels = new Color[16];
            for (int i = 0; i < pixels.Length; i++) pixels[i] = new Color(1f, 1f, 1f, alpha);
            tex.SetPixels(pixels);
            tex.Apply(false);
            return tex;
        }

        public void Dispose()
        {
            if (_camera != null) _camera.targetTexture = null;
            if (_cameraGo != null) UnityEngine.Object.DestroyImmediate(_cameraGo);
            if (_quadGo != null) UnityEngine.Object.DestroyImmediate(_quadGo);
            if (_mesh != null) UnityEngine.Object.DestroyImmediate(_mesh);
            if (_readback != null) UnityEngine.Object.DestroyImmediate(_readback);
            if (_opaqueWhite != null) UnityEngine.Object.DestroyImmediate(_opaqueWhite);
            if (_halfWhite != null) UnityEngine.Object.DestroyImmediate(_halfWhite);
            if (_target != null)
            {
                _target.Release();
                UnityEngine.Object.DestroyImmediate(_target);
            }
            if (_scene.IsValid()) EditorSceneManager.ClosePreviewScene(_scene);
            _ready = false;
        }
    }
}
