using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>One way of rendering the frames: background, HDR, and which post-processing profile.</summary>
    internal sealed class RenderVariant
    {
        public string Id;
        public Color Background;
        public bool PostProcessing;
        public UnityEngine.Object VolumeProfile;
        public bool KeyframesOnly;
    }

    /// <summary>Capture camera, light and post-processing volume, plus frame and contact-sheet output.</summary>
    internal sealed class ParityRender : IDisposable
    {
        public readonly Camera Camera;
        public readonly Light Light;
        private readonly GameObject _cameraGo;
        private readonly GameObject _lightGo;
        private readonly GameObject _volumeGo;
        private readonly Component _volume;
        private readonly RenderTexture _rt;
        private readonly Texture2D _readback;
        public readonly int Resolution;

        private readonly ParityLog _log;

        public ParityRender(int resolution, ParityLog log)
        {
            _log = log;
            Resolution = resolution;
            _rt = new RenderTexture(resolution, resolution, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
            {
                antiAliasing = 1,
            };
            _rt.Create();
            _readback = new Texture2D(resolution, resolution, TextureFormat.RGBA32, false, false);

            _cameraGo = new GameObject("ParityCaptureCamera");
            Camera = _cameraGo.AddComponent<Camera>();
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.fieldOfView = 40f;
            Camera.allowMSAA = false;
            Camera.targetTexture = _rt;

            // Matches the light and ambient babylon.quarks hard-codes for mesh particles
            // (SpriteBatch: light direction (0.4, -1, 0.6), white, ambient 0.35), so lit
            // mesh particles are compared under the same lighting.
            _lightGo = new GameObject("ParityCaptureLight");
            Light = _lightGo.AddComponent<Light>();
            Light.type = LightType.Directional;
            Light.color = Color.white;
            Light.intensity = 1f;
            Light.shadows = LightShadows.None;
            _lightGo.transform.rotation = Quaternion.LookRotation(new Vector3(0.4f, -1f, 0.6f).normalized);
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.35f, 0.35f, 0.35f, 1f);
            RenderSettings.skybox = null;
            RenderSettings.fog = false;

            // A global Volume, used only by the post-processed variants. Created through
            // reflection so the tool compiles in projects without the SRP core package.
            Type volumeType = ParityEnvironment.FindType("UnityEngine.Rendering.Volume");
            if (volumeType != null)
            {
                _volumeGo = new GameObject("ParityCaptureVolume");
                _volume = _volumeGo.AddComponent(volumeType);
                ParityEnvironment.SetMember(_volume, "isGlobal", true);
                ParityEnvironment.SetMember(_volume, "priority", 1000f);
                ParityEnvironment.SetMember(_volume, "weight", 1f);
                _volumeGo.SetActive(false);
            }
        }

        public bool SupportsVolumes => _volume != null;

        /// <summary>
        /// Scriptable-pipeline camera switches (URP): post-processing on or off, and a depth texture
        /// so soft-particle shaders see "nothing behind" rather than an unbound texture.
        /// </summary>
        public static JMap ConfigurePipelineCamera(Camera cam, bool postProcessing)
        {
            var applied = new JMap();
            Type urpData = ParityEnvironment.FindType("UnityEngine.Rendering.Universal.UniversalAdditionalCameraData");
            if (urpData == null)
            {
                applied.Set("pipelineCameraData", "none (not URP)");
                return applied;
            }
            Component data = cam.GetComponent(urpData);
            if (data == null) data = cam.gameObject.AddComponent(urpData);
            applied.Set("renderPostProcessing", ParityEnvironment.SetMember(data, "renderPostProcessing", postProcessing));
            applied.Set("requiresDepthTexture", ParityEnvironment.SetMember(data, "requiresDepthTexture", true));
            return applied;
        }

        public JMap Apply(RenderVariant variant)
        {
            Camera.backgroundColor = variant.Background;
            Camera.allowHDR = variant.PostProcessing;
            JMap applied = ConfigurePipelineCamera(Camera, variant.PostProcessing);
            if (_volumeGo != null)
            {
                bool useVolume = variant.PostProcessing && variant.VolumeProfile != null;
                if (useVolume) ParityEnvironment.SetMember(_volume, "sharedProfile", variant.VolumeProfile);
                _volumeGo.SetActive(useVolume);
                applied.Set("volumeActive", useVolume);
            }
            applied.Set("allowHDR", Camera.allowHDR).Set("background", variant.Background);
            return applied;
        }

        /// <summary>
        /// Frames the given world bounds from the front, slightly above, and returns everything a
        /// second renderer needs to reproduce the view exactly.
        /// </summary>
        public JMap Frame(Bounds bounds)
        {
            float radius = Mathf.Max(0.05f, bounds.extents.magnitude);
            Quaternion rotation = Quaternion.Euler(15f, 0f, 0f);
            Vector3 forward = rotation * Vector3.forward;
            float distance = radius / Mathf.Sin(Camera.fieldOfView * 0.5f * Mathf.Deg2Rad) * 1.05f;
            _cameraGo.transform.SetPositionAndRotation(bounds.center - forward * distance, rotation);
            Camera.nearClipPlane = Mathf.Max(0.01f, distance - radius * 1.5f);
            Camera.farClipPlane = distance + radius * 1.5f + 1f;
            Camera.aspect = 1f;

            return new JMap()
                .Set("note", "Unity is left-handed, +Y up; the camera looks along its +Z (forward). " +
                             "Matrices are row-major m[row,col]; worldToCamera follows OpenGL (view looks down -Z).")
                .Set("position", Camera.transform.position)
                .Set("rotation", Camera.transform.rotation)
                .Set("eulerAngles", Camera.transform.eulerAngles)
                .Set("forward", Camera.transform.forward)
                .Set("up", Camera.transform.up)
                .Set("verticalFieldOfView", Camera.fieldOfView)
                .Set("aspect", Camera.aspect)
                .Set("near", Camera.nearClipPlane)
                .Set("far", Camera.farClipPlane)
                .Set("resolution", Resolution)
                .Set("projectionMatrix", Camera.projectionMatrix)
                .Set("worldToCameraMatrix", Camera.worldToCameraMatrix)
                .Set("framedBounds", new JMap().Set("center", bounds.center).Set("size", bounds.size))
                .Set("light", new JMap()
                    .Set("type", Light.type.ToString())
                    .Set("direction", _lightGo.transform.forward)
                    .Set("color", Light.color)
                    .Set("intensity", Light.intensity))
                .Set("ambient", new JMap()
                    .Set("mode", RenderSettings.ambientMode.ToString())
                    .Set("color", RenderSettings.ambientLight));
        }

        /// <summary>Renders the current view and returns its pixels.</summary>
        public Color32[] Render()
        {
            ParityCameraRender.Render(Camera, _rt, _log);
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = _rt;
            _readback.ReadPixels(new Rect(0, 0, Resolution, Resolution), 0, 0, false);
            _readback.Apply(false);
            RenderTexture.active = previous;
            return _readback.GetPixels32();
        }

        /// <summary>
        /// Renders one frame to PNG. Coverage is the share of pixels that differ from
        /// <paramref name="empty"/> — the same view rendered without the effect, so background,
        /// grading and vignette cancel out.
        /// </summary>
        public Color32[] Capture(string pngPath, Color32[] empty, out double coverage)
        {
            Color32[] pixels = Render();
            File.WriteAllBytes(pngPath, _readback.EncodeToPNG());
            int differing = 0;
            for (int i = 0; i < pixels.Length; i++)
            {
                Color32 p = pixels[i], e = empty[i];
                if (Math.Abs(p.r - e.r) > 2 || Math.Abs(p.g - e.g) > 2 || Math.Abs(p.b - e.b) > 2) differing++;
            }
            coverage = (double)differing / pixels.Length;
            return pixels;
        }

        /// <summary>A grid of downscaled frames — one image to look at instead of dozens.</summary>
        public static void ContactSheet(string pngPath, List<Color32[]> frames, int frameSize, int columns = 6, int thumb = 128)
        {
            if (frames.Count == 0) return;
            int rows = (frames.Count + columns - 1) / columns;
            var sheet = new Texture2D(columns * thumb, rows * thumb, TextureFormat.RGBA32, false, false);
            var fill = new Color32[sheet.width * sheet.height];
            for (int i = 0; i < fill.Length; i++) fill[i] = new Color32(24, 24, 24, 255);
            int step = Math.Max(1, frameSize / thumb);
            for (int f = 0; f < frames.Count; f++)
            {
                int col = f % columns;
                int row = rows - 1 - f / columns;   // first frame top-left
                Color32[] src = frames[f];
                for (int y = 0; y < thumb; y++)
                {
                    for (int x = 0; x < thumb; x++)
                    {
                        int r = 0, g = 0, b = 0, n = 0;
                        for (int dy = 0; dy < step; dy++)
                        {
                            int sy = y * step + dy;
                            if (sy >= frameSize) break;
                            for (int dx = 0; dx < step; dx++)
                            {
                                int sx = x * step + dx;
                                if (sx >= frameSize) break;
                                Color32 c = src[sy * frameSize + sx];
                                r += c.r; g += c.g; b += c.b; n++;
                            }
                        }
                        if (n == 0) continue;
                        fill[(row * thumb + y) * sheet.width + col * thumb + x] =
                            new Color32((byte)(r / n), (byte)(g / n), (byte)(b / n), 255);
                    }
                }
            }
            sheet.SetPixels32(fill);
            sheet.Apply(false);
            File.WriteAllBytes(pngPath, sheet.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(sheet);
        }

        /// <summary>A quad in the XY plane facing -Z, white vertex colours, UV 0..1.</summary>
        public static Mesh Quad(float size)
        {
            float h = size * 0.5f;
            var mesh = new Mesh { name = "ParityQuad" };
            mesh.vertices = new[] { new Vector3(-h, -h, 0f), new Vector3(h, -h, 0f), new Vector3(-h, h, 0f), new Vector3(h, h, 0f) };
            mesh.uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0f, 1f), new Vector2(1f, 1f) };
            mesh.colors = new[] { Color.white, Color.white, Color.white, Color.white };
            var n = new Vector3(0f, 0f, -1f);
            mesh.normals = new[] { n, n, n, n };
            var tangent = new Vector4(1f, 0f, 0f, -1f);
            mesh.tangents = new[] { tangent, tangent, tangent, tangent };
            mesh.triangles = new[] { 0, 2, 1, 2, 3, 1 };
            mesh.RecalculateBounds();
            return mesh;
        }

        public void Dispose()
        {
            Camera.targetTexture = null;
            UnityEngine.Object.DestroyImmediate(_cameraGo);
            UnityEngine.Object.DestroyImmediate(_lightGo);
            if (_volumeGo != null) UnityEngine.Object.DestroyImmediate(_volumeGo);
            UnityEngine.Object.DestroyImmediate(_readback);
            _rt.Release();
            UnityEngine.Object.DestroyImmediate(_rt);
        }
    }
}
