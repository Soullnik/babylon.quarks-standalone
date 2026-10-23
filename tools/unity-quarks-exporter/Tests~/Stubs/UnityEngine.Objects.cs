// Scene objects, assets and the few engine services the exporter touches. See UnityEngine.Math.cs.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

namespace UnityEngine
{
    public class Object
    {
        public string name { get; set; } = "";
        public static void DestroyImmediate(Object obj) { }
        public static implicit operator bool(Object obj) => !(obj is null);
    }

    public class Component : Object
    {
        public GameObject gameObject { get; internal set; }
        public Transform transform => gameObject.transform;
        public T GetComponent<T>() where T : Component => gameObject.GetComponent<T>();
        public T[] GetComponentsInChildren<T>(bool includeInactive) where T : Component =>
            gameObject.GetComponentsInChildren<T>(includeInactive);
    }

    public class Transform : Component, IEnumerable
    {
        private readonly List<Transform> _children = new List<Transform>();
        public Vector3 localPosition { get; set; } = Vector3.zero;
        public Quaternion localRotation { get; set; } = Quaternion.identity;
        public Vector3 localScale { get; set; } = Vector3.one;
        public Transform parent { get; private set; }
        public int childCount => _children.Count;
        public Transform GetChild(int index) => _children[index];

        public void SetParent(Transform newParent)
        {
            parent?._children.Remove(this);
            parent = newParent;
            newParent?._children.Add(this);
        }

        public IEnumerator GetEnumerator() => _children.ToList().GetEnumerator();
    }

    public sealed class GameObject : Object
    {
        private readonly List<Component> _components = new List<Component>();
        public Transform transform { get; }

        public GameObject(string name)
        {
            this.name = name;
            transform = AddComponent<Transform>();
        }

        public T AddComponent<T>() where T : Component, new()
        {
            var component = new T { gameObject = this };
            component.name = name;
            _components.Add(component);
            return component;
        }

        public T GetComponent<T>() where T : Component => _components.OfType<T>().FirstOrDefault();

        public T[] GetComponentsInChildren<T>(bool includeInactive) where T : Component
        {
            var found = new List<T>();
            Collect(transform, found);
            return found.ToArray();
        }

        private static void Collect<T>(Transform t, List<T> found) where T : Component
        {
            found.AddRange(t.gameObject._components.OfType<T>());
            foreach (Transform child in t) Collect(child, found);
        }
    }

    public class Shader : Object
    {
        public static Shader Find(string name) => new Shader { name = name };
    }

    public enum TextureWrapMode { Repeat = 0, Clamp = 1, Mirror = 2, MirrorOnce = 3 }

    public class Texture : Object
    {
        public virtual int width { get; set; }
        public virtual int height { get; set; }
        public TextureWrapMode wrapMode { get => wrapModeU; set { wrapModeU = value; wrapModeV = value; } }
        public TextureWrapMode wrapModeU { get; set; }
        public TextureWrapMode wrapModeV { get; set; }

        /// <summary>Test hook: the file AssetDatabase.GetAssetPath reports for this texture.</summary>
        public string assetPath { get; set; }
    }

    public enum TextureFormat { RGBA32 = 4 }
    public enum CubemapFace { PositiveX = 0, NegativeX = 1, PositiveY = 2, NegativeY = 3, PositiveZ = 4, NegativeZ = 5 }

    public class Texture2D : Texture
    {
        private Color[] _pixels;

        public Texture2D(int width, int height) : this(width, height, TextureFormat.RGBA32, false) { }
        public Texture2D(int width, int height, TextureFormat format, bool mipChain) : this(width, height, format, mipChain, false) { }

        public Texture2D(int width, int height, TextureFormat format, bool mipChain, bool linear)
        {
            this.width = width;
            this.height = height;
            _pixels = new Color[width * height];
        }

        public Color[] GetPixels() => _pixels;
        public void SetPixels(Color[] colors) { _pixels = colors; }
        public void SetPixels(int x, int y, int blockWidth, int blockHeight, Color[] colors) { }
        public void ReadPixels(Rect source, int destX, int destY) { }
        public void Apply() { }
        public void Apply(bool updateMipmaps, bool makeNoLongerReadable) { }

        /// <summary>A fixed 1×1 PNG: the tests check where an image goes, not its pixels.</summary>
        public byte[] EncodeToPNG() => Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==");
    }

    public class Cubemap : Texture
    {
        public Color[] GetPixels(CubemapFace face) => new Color[width * width];
    }

    public enum RenderTextureFormat { ARGB32 = 0 }
    public enum RenderTextureReadWrite { Default = 0, Linear = 1, sRGB = 2 }

    public class RenderTexture : Texture
    {
        public static RenderTexture active { get; set; }

        public static RenderTexture GetTemporary(int width, int height, int depthBuffer, RenderTextureFormat format, RenderTextureReadWrite readWrite) =>
            new RenderTexture { width = width, height = height };

        public static void ReleaseTemporary(RenderTexture temp) { }
    }

    public static class Graphics
    {
        public static void Blit(Texture source, RenderTexture dest) { }
        public static void CopyTexture(Texture src, int srcElement, int srcMip, Texture dst, int dstElement, int dstMip) { }
    }

    public static class SystemInfo
    {
        public static Rendering.CopyTextureSupport copyTextureSupport => Rendering.CopyTextureSupport.Basic;
    }

    public class Material : Object
    {
        private readonly Dictionary<string, float> _floats = new Dictionary<string, float>();
        private readonly Dictionary<string, Color> _colors = new Dictionary<string, Color>();
        private readonly Dictionary<string, Texture> _textures = new Dictionary<string, Texture>();
        private readonly Dictionary<string, Vector2> _scales = new Dictionary<string, Vector2>();
        private readonly Dictionary<string, Vector2> _offsets = new Dictionary<string, Vector2>();
        private readonly HashSet<string> _keywords = new HashSet<string>();

        public Material(Shader shader) { this.shader = shader; }

        public Shader shader { get; set; }

        public Texture mainTexture
        {
            get => GetTexture(MainTextureProperty);
            set => SetTexture(MainTextureProperty, value);
        }

        public Vector2 mainTextureScale
        {
            get => GetTextureScale(MainTextureProperty);
            set => SetTextureScale(MainTextureProperty, value);
        }

        public Vector2 mainTextureOffset
        {
            get => GetTextureOffset(MainTextureProperty);
            set => SetTextureOffset(MainTextureProperty, value);
        }

        private string MainTextureProperty => HasProperty("_BaseMap") ? "_BaseMap" : "_MainTex";

        public bool HasProperty(string name) =>
            _floats.ContainsKey(name) || _colors.ContainsKey(name) || _textures.ContainsKey(name);

        public float GetFloat(string name) => _floats.TryGetValue(name, out var v) ? v : 0f;
        public void SetFloat(string name, float value) => _floats[name] = value;
        public Color GetColor(string name) => _colors.TryGetValue(name, out var v) ? v : Color.clear;
        public void SetColor(string name, Color value) => _colors[name] = value;
        public Texture GetTexture(string name) => _textures.TryGetValue(name, out var v) ? v : null;
        public void SetTexture(string name, Texture value) => _textures[name] = value;
        public Vector2 GetTextureScale(string name) => _scales.TryGetValue(name, out var v) ? v : Vector2.one;
        public void SetTextureScale(string name, Vector2 value) => _scales[name] = value;
        public Vector2 GetTextureOffset(string name) => _offsets.TryGetValue(name, out var v) ? v : Vector2.zero;
        public void SetTextureOffset(string name, Vector2 value) => _offsets[name] = value;
        public string[] GetTexturePropertyNames() => _textures.Keys.ToArray();
        public bool IsKeywordEnabled(string keyword) => _keywords.Contains(keyword);
        public void EnableKeyword(string keyword) => _keywords.Add(keyword);
    }

    public class Mesh : Object
    {
        public Vector3[] vertices { get; set; } = new Vector3[0];
        public int[] triangles { get; set; } = new int[0];
        public Vector2[] uv { get; set; } = new Vector2[0];
        public Vector2[] uv2 { get; set; } = new Vector2[0];
        public Vector3[] normals { get; set; } = new Vector3[0];

        public void RecalculateNormals()
        {
            var result = new Vector3[vertices.Length];
            for (int i = 0; i < result.Length; i++) result[i] = new Vector3(0, 0, 1);
            normals = result;
        }
    }

    public static class Debug
    {
        /// <summary>Test hook: every warning logged, in order.</summary>
        public static readonly List<string> Warnings = new List<string>();

        public static void Log(object message) { }
        public static void LogWarning(object message) => Warnings.Add(message?.ToString());
        public static void LogError(object message) => Warnings.Add("error: " + message);
    }

    public class GUIContent
    {
        public GUIContent(string text) { }
        public GUIContent(string text, string tooltip) { }
    }

    public class GUIStyle { }

    public static class GUILayout
    {
        public static bool Button(string text, params GUILayoutOption[] options) => false;
    }

    public sealed class GUILayoutOption { }

    public static class GUIUtility
    {
        public static void ExitGUI() { }
    }

    public class ScriptableObject : Object { }
}

namespace UnityEngine.Rendering
{
    public enum CopyTextureSupport { None = 0, Basic = 1 }
    public enum BlendMode { Zero = 0, One = 1, DstColor = 2, SrcColor = 3, OneMinusDstColor = 4, SrcAlpha = 5, OneMinusSrcColor = 6, DstAlpha = 7, OneMinusDstAlpha = 8, SrcAlphaSaturate = 9, OneMinusSrcAlpha = 10 }
    public enum BlendOp { Add = 0, Subtract = 1, ReverseSubtract = 2, Min = 3, Max = 4 }
    public enum CullMode { Off = 0, Front = 1, Back = 2 }
}
