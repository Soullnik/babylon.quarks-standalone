using System;
using System.Collections.Generic;
using System.Reflection;
using BabylonQuarks.UnityExporter;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>
    /// Everything about a particle material that decides how it looks: the shader's declared
    /// properties with this material's values, keywords, tags, passes, the compiled blend state
    /// if Unity exposes it, what the exporter concludes — and the blend Unity actually performs,
    /// measured by rendering the material over known backgrounds.
    /// </summary>
    internal static class ParityMaterials
    {
        public const int ProbeSize = 32;
        public const float ProbeQuadSize = 1.2f;   // overfills the 1×1 orthographic view
        public static readonly float[] ProbeBackgrounds = { 0f, 0.5f, 1f };

        public static string Id(Material m)
        {
            if (AssetDatabase.TryGetGUIDAndLocalFileIdentifier(m, out string guid, out long localId))
            {
                return guid + "_" + localId;
            }
            return "instance_" + m.GetInstanceID();
        }

        public static JMap Describe(Material mat, ParityLog log)
        {
            var map = new JMap()
                .Set("id", Id(mat))
                .Set("asset", SerializedDump.Reference(mat))
                .Set("renderQueue", mat.renderQueue)
                .Set("keywords", mat.shaderKeywords)
                .Set("globalIlluminationFlags", mat.globalIlluminationFlags.ToString())
                .Set("doubleSidedGI", mat.doubleSidedGI);

            Shader shader = mat.shader;
            if (shader != null)
            {
                map.Set("shader", new JMap()
                    .Set("asset", SerializedDump.Reference(shader))
                    .Set("isSupported", shader.isSupported)
                    .Set("renderQueue", shader.renderQueue)
                    .Set("passCount", shader.passCount));
                map.Set("properties", Properties(mat, shader));
            }

            // Unity-defined tag keys: the tag's key is what is being read.
            var tags = new JMap();
            foreach (string tag in new[] { "RenderType", "Queue", "IgnoreProjector", "PreviewType", "RenderPipeline" })
            {
                tags.Set(tag, mat.GetTag(tag, true, ""));
            }
            map.Set("tags", tags);

            var passes = new List<object>();
            for (int i = 0; i < mat.passCount; i++)
            {
                string passName = mat.GetPassName(i);
                passes.Add(new JMap().Set("index", i).Set("name", passName)
                    .Set("enabled", mat.GetShaderPassEnabled(passName)));
            }
            map.Set("passes", passes);

            log.Step("compiledState", map, () => map.Set("compiledState", CompiledState(shader)));
            log.Step("exporterVerdict", map, () => map.Set("exporterVerdict", ExporterVerdict(mat)));
            return map;
        }

        private static List<object> Properties(Material mat, Shader shader)
        {
            var list = new List<object>();
            for (int i = 0; i < shader.GetPropertyCount(); i++)
            {
                string name = shader.GetPropertyName(i);
                ShaderPropertyType type = shader.GetPropertyType(i);
                var p = new JMap()
                    .Set("name", name)
                    .Set("type", type.ToString())
                    .Set("description", shader.GetPropertyDescription(i))
                    .Set("flags", shader.GetPropertyFlags(i).ToString())
                    .Set("attributes", shader.GetPropertyAttributes(i));
                switch (type)
                {
                    case ShaderPropertyType.Color:
                        p.Set("value", mat.GetColor(name)).Set("default", shader.GetPropertyDefaultVectorValue(i));
                        break;
                    case ShaderPropertyType.Vector:
                        p.Set("value", mat.GetVector(name)).Set("default", shader.GetPropertyDefaultVectorValue(i));
                        break;
                    case ShaderPropertyType.Range:
                        p.Set("value", mat.GetFloat(name)).Set("default", shader.GetPropertyDefaultFloatValue(i))
                            .Set("range", shader.GetPropertyRangeLimits(i));
                        break;
                    case ShaderPropertyType.Texture:
                        Texture tex = mat.GetTexture(name);
                        p.Set("dimension", shader.GetPropertyTextureDimension(i).ToString())
                            .Set("defaultTexture", shader.GetPropertyTextureDefaultName(i))
                            .Set("value", TextureInfo(tex))
                            .Set("scale", mat.GetTextureScale(name))
                            .Set("offset", mat.GetTextureOffset(name));
                        break;
                    default:
                        // Float, and Int on Unity versions that have it.
                        p.Set("value", mat.GetFloat(name)).Set("default", shader.GetPropertyDefaultFloatValue(i));
                        break;
                }
                list.Add(p);
            }
            return list;
        }

        public static object TextureInfo(Texture tex)
        {
            if (tex == null) return null;
            var map = new JMap()
                .Set("asset", SerializedDump.Reference(tex))
                .Set("width", tex.width).Set("height", tex.height)
                .Set("dimension", tex.dimension.ToString())
                .Set("filterMode", tex.filterMode.ToString())
                .Set("wrapModeU", tex.wrapModeU.ToString()).Set("wrapModeV", tex.wrapModeV.ToString())
                .Set("anisoLevel", tex.anisoLevel)
                .Set("mipmapCount", tex.mipmapCount)
                .Set("graphicsFormat", tex.graphicsFormat.ToString());
            string path = AssetDatabase.GetAssetPath(tex);
            if (AssetImporter.GetAtPath(path) is TextureImporter importer)
            {
                map.Set("importer", SerializedDump.Dump(importer, descend: p => !p.StartsWith("m_PlatformSettings")));
            }
            return map;
        }

        /// <summary>
        /// The shader's parsed per-pass render state (blend factors, blend op, zwrite, cull…) as
        /// Unity serializes it — for built-in shaders this is the only place their hard-coded blend
        /// is readable. Unity does not document this layout; if it is not exposed, the top-level
        /// field list is recorded instead so the gap is visible.
        /// </summary>
        private static JMap CompiledState(Shader shader)
        {
            var result = new JMap();
            if (shader == null) return result;
            JMap state = SerializedDump.Dump(shader,
                keep: path => path.StartsWith("m_ParsedForm.m_SubShaders") && path.Contains(".m_State."),
                descend: path => path == "m_ParsedForm" || path.StartsWith("m_ParsedForm.m_SubShaders"),
                maxLeaves: 20000, maxArray: 64);
            result.Set("passState", state);
            if (state.Count == 0) result.Set("topLevelFields", SerializedDump.TopLevel(shader));
            return result;
        }

        /// <summary>What the exporter's DetectBlend decides for this material, and from which source.</summary>
        private static JMap ExporterVerdict(Material mat)
        {
            MethodInfo detect = typeof(ExportContext).GetMethod("DetectBlend", BindingFlags.NonPublic | BindingFlags.Static);
            if (detect == null) return new JMap().Set("error", "ExportContext.DetectBlend not found — exporter out of date?");
            object[] args = { mat, null };
            int mode = (int)detect.Invoke(null, args);
            return new JMap().Set("babylonAlphaMode", mode).Set("source", args[1]);
        }

        // ---- measured blend ------------------------------------------------------------------

        /// <summary>
        /// Renders the material on a quad over black, mid-grey and white into a float target and
        /// reads the result back. Whatever the shader does, out = src + k·dst per pixel, so the
        /// three backgrounds give the destination factor and the source term directly — the blend
        /// Unity really performs, including premultiplication done inside the shader.
        ///
        /// Two runs: the material as authored, and a copy whose main texture is an alpha ramp
        /// (white, alpha 0→1 along U) so the factors can be fitted against a known alpha.
        /// </summary>
        public static JMap Probe(Material mat, ParityProbeRig rig, ParityLog log)
        {
            var result = new JMap()
                .Set("size", ProbeSize)
                .Set("quadSize", ProbeQuadSize)
                .Set("uvOfPixel", "u = 0.5 + ((x + 0.5) / size - 0.5) / quadSize, same for v with y (y = 0 is the bottom row)")
                .Set("layout", "rows bottom-to-top, pixels left-to-right, RGBA floats, linear");

            result.Set("backgroundsMeasured", rig.MeasureBackgrounds());

            log.Step("asAuthored", result, () => result.Set("asAuthored", rig.Render(mat)));

            Material ramped = null;
            try
            {
                ramped = new Material(mat);
                ramped.mainTexture = rig.Ramp;
                if (ramped.mainTexture == rig.Ramp)
                {
                    log.Step("alphaRamp", result, () => result.Set("alphaRamp", rig.Render(ramped)));
                }
                else
                {
                    result.Set("alphaRamp", "shader has no main texture property to replace");
                }
            }
            finally
            {
                if (ramped != null) UnityEngine.Object.DestroyImmediate(ramped);
            }
            return result;
        }
    }

    /// <summary>Camera, quad and float render target for the blend probe.</summary>
    internal sealed class ParityProbeRig : IDisposable
    {
        private readonly GameObject _cameraGo;
        private readonly GameObject _quadGo;
        private readonly Camera _camera;
        private readonly MeshRenderer _renderer;
        private readonly Mesh _mesh;
        private readonly RenderTexture _rt;
        private readonly Texture2D _readback;
        public readonly Texture2D Ramp;

        private readonly ParityLog _log;

        public ParityProbeRig(ParityLog log)
        {
            _log = log;
            int size = ParityMaterials.ProbeSize;
            _rt = new RenderTexture(size, size, 24, RenderTextureFormat.ARGBHalf, RenderTextureReadWrite.Linear)
            {
                antiAliasing = 1,
                filterMode = FilterMode.Point,
            };
            _rt.Create();
            _readback = new Texture2D(size, size, TextureFormat.RGBAHalf, false, true);

            Ramp = new Texture2D(size, 4, TextureFormat.RGBA32, false, true)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                name = "ParityAlphaRamp",
            };
            var ramp = new Color[size * 4];
            for (int y = 0; y < 4; y++)
            {
                for (int x = 0; x < size; x++) ramp[y * size + x] = new Color(1f, 1f, 1f, (x + 0.5f) / size);
            }
            Ramp.SetPixels(ramp);
            Ramp.Apply(false);

            _mesh = ParityRender.Quad(ParityMaterials.ProbeQuadSize);
            _quadGo = new GameObject("ParityProbeQuad");
            _quadGo.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = _quadGo.AddComponent<MeshRenderer>();
            _renderer.shadowCastingMode = ShadowCastingMode.Off;
            _renderer.receiveShadows = false;

            _cameraGo = new GameObject("ParityProbeCamera");
            _cameraGo.transform.position = new Vector3(0f, 0f, -1f);
            _camera = _cameraGo.AddComponent<Camera>();
            _camera.orthographic = true;
            _camera.orthographicSize = 0.5f;
            _camera.nearClipPlane = 0.1f;
            _camera.farClipPlane = 10f;
            _camera.clearFlags = CameraClearFlags.SolidColor;
            _camera.allowHDR = true;
            _camera.allowMSAA = false;
            _camera.targetTexture = _rt;
            ParityRender.ConfigurePipelineCamera(_camera, postProcessing: false);
            // The float target may take a different render path than the 8-bit frames.
            ParityCameraRender.Reset();
        }

        public List<object> MeasureBackgrounds()
        {
            _renderer.enabled = false;
            var list = new List<object>();
            foreach (float bg in ParityMaterials.ProbeBackgrounds)
            {
                Color[] px = RenderAt(bg);
                list.Add(new JMap().Set("set", bg).Set("measuredCenter", px[px.Length / 2 + ParityMaterials.ProbeSize / 2]));
            }
            _renderer.enabled = true;
            return list;
        }

        public List<object> Render(Material mat)
        {
            _renderer.sharedMaterial = mat;
            var perBackground = new List<object>();
            foreach (float bg in ParityMaterials.ProbeBackgrounds)
            {
                Color[] px = RenderAt(bg);
                var flat = new float[px.Length * 4];
                for (int i = 0; i < px.Length; i++)
                {
                    flat[i * 4] = (float)PJson.Round(px[i].r, 4);
                    flat[i * 4 + 1] = (float)PJson.Round(px[i].g, 4);
                    flat[i * 4 + 2] = (float)PJson.Round(px[i].b, 4);
                    flat[i * 4 + 3] = (float)PJson.Round(px[i].a, 4);
                }
                perBackground.Add(new JMap().Set("background", bg).Set("rgba", flat));
            }
            return perBackground;
        }

        private Color[] RenderAt(float background)
        {
            _camera.backgroundColor = new Color(background, background, background, 0f);
            ParityCameraRender.Render(_camera, _rt, _log);
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = _rt;
            _readback.ReadPixels(new Rect(0, 0, _rt.width, _rt.height), 0, 0, false);
            _readback.Apply(false);
            RenderTexture.active = previous;
            return _readback.GetPixels();
        }

        public void Dispose()
        {
            _camera.targetTexture = null;
            UnityEngine.Object.DestroyImmediate(_cameraGo);
            UnityEngine.Object.DestroyImmediate(_quadGo);
            UnityEngine.Object.DestroyImmediate(_mesh);
            UnityEngine.Object.DestroyImmediate(_readback);
            UnityEngine.Object.DestroyImmediate(Ramp);
            _rt.Release();
            UnityEngine.Object.DestroyImmediate(_rt);
        }
    }
}
