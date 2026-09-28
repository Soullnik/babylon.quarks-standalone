using System;
using System.Reflection;
using UnityEngine;
using UnityEngine.Rendering;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Renders a camera into its target texture, checking once that it actually works.
    ///
    /// Camera.Render() is the classic path; newer scriptable pipelines prefer
    /// RenderPipeline.SubmitRenderRequest. Rather than guess which one this project's pipeline
    /// honours, the first render clears to a probe colour and reads it back: the path that puts
    /// that colour into the texture is the one used from then on.
    /// </summary>
    public static class OffscreenRender
    {
        private enum Path { Unknown, CameraRender, SubmitRenderRequest, None }

        private static Path _path = Path.Unknown;
        private static MethodInfo _submit;
        private static Type _requestType;

        /// <summary>The path in use, for logs: Unknown until the first render.</summary>
        public static string PathName => _path.ToString();

        /// <summary>Whether the last detection found a path that renders at all.</summary>
        public static bool Works => _path == Path.CameraRender || _path == Path.SubmitRenderRequest;

        /// <summary>Forgets the path, so the next render detects it again (a new kind of target).</summary>
        public static void Reset() => _path = Path.Unknown;

        public static void Render(Camera camera, RenderTexture target)
        {
            if (_path == Path.Unknown) Detect(camera, target);
            switch (_path)
            {
                case Path.SubmitRenderRequest:
                    Submit(camera, target);
                    break;
                case Path.None:
                    break;
                default:
                    camera.Render();
                    break;
            }
        }

        private static void Detect(Camera camera, RenderTexture target)
        {
            Color saved = camera.backgroundColor;
            CameraClearFlags savedFlags = camera.clearFlags;
            var probe = new Color(1f, 0f, 1f, 1f);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = probe;
            try
            {
                Clear(target);
                camera.Render();
                if (Near(Read(target), probe))
                {
                    _path = Path.CameraRender;
                }
                else if (PrepareSubmit())
                {
                    Clear(target);
                    Submit(camera, target);
                    _path = Near(Read(target), probe) ? Path.SubmitRenderRequest : Path.None;
                }
                else
                {
                    _path = Path.None;
                }
            }
            catch (Exception e)
            {
                Debug.Log("[Quarks] Render path detection threw: " + e.GetBaseException().Message);
                _path = Path.None;
            }
            finally
            {
                camera.backgroundColor = saved;
                camera.clearFlags = savedFlags;
            }
            if (_path == Path.None)
            {
                Debug.LogWarning("[Quarks] Neither Camera.Render nor SubmitRenderRequest rendered into a texture.");
            }
            else
            {
                Debug.Log("[Quarks] Camera render path: " + _path);
            }
        }

        private static bool PrepareSubmit()
        {
            if (_submit != null) return true;
            _requestType = typeof(RenderPipeline).GetNestedType("StandardRequest", BindingFlags.Public);
            MethodInfo generic = typeof(RenderPipeline).GetMethod("SubmitRenderRequest", BindingFlags.Public | BindingFlags.Static);
            if (_requestType == null || generic == null || !generic.IsGenericMethodDefinition) return false;
            _submit = generic.MakeGenericMethod(_requestType);
            return true;
        }

        private static void Submit(Camera camera, RenderTexture target)
        {
            object request = Activator.CreateInstance(_requestType);
            FieldInfo destination = _requestType.GetField("destination");
            destination?.SetValue(request, target);
            _submit.Invoke(null, new[] { (object)camera, request });
        }

        private static void Clear(RenderTexture target)
        {
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            GL.Clear(true, true, Color.black);
            RenderTexture.active = previous;
        }

        private static Color Read(RenderTexture target)
        {
            var tex = new Texture2D(1, 1, TextureFormat.RGBA32, false, true);
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            tex.ReadPixels(new Rect(target.width / 2, target.height / 2, 1, 1), 0, 0, false);
            tex.Apply(false);
            RenderTexture.active = previous;
            Color c = tex.GetPixel(0, 0);
            UnityEngine.Object.DestroyImmediate(tex);
            return c;
        }

        private static bool Near(Color c, Color probe) =>
            Math.Abs(c.r - probe.r) < 0.1f && Math.Abs(c.g - probe.g) < 0.1f && Math.Abs(c.b - probe.b) < 0.1f;
    }
}
