// A stand-in for the parts of UnityEngine the exporter uses, so its sources compile and run under
// plain .NET in CI. Signatures follow Unity's own API (2020.3 to 6); the bodies implement only what
// an export reads. Maths that changes exported numbers (Euler angles, TRS, curve and gradient
// evaluation) follows Unity's documented behaviour.
using System;

namespace UnityEngine
{
    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new Vector2(0, 0);
        public static Vector2 one => new Vector2(1, 1);
        public static bool operator ==(Vector2 a, Vector2 b) => a.x == b.x && a.y == b.y;
        public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);
        public override bool Equals(object o) => o is Vector2 v && v == this;
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static Vector3 one => new Vector3(1, 1, 1);
        public static bool operator ==(Vector3 a, Vector3 b) => a.x == b.x && a.y == b.y && a.z == b.z;
        public static bool operator !=(Vector3 a, Vector3 b) => !(a == b);
        public static Vector3 operator *(Vector3 a, float s) => new Vector3(a.x * s, a.y * s, a.z * s);
        public override bool Equals(object o) => o is Vector3 v && v == this;
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2) ^ (z.GetHashCode() >> 2);
    }

    public struct Vector4
    {
        public float x, y, z, w;
        public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
    }

    public struct Quaternion
    {
        public float x, y, z, w;
        public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public static Quaternion identity => new Quaternion(0, 0, 0, 1);

        public static Quaternion operator *(Quaternion a, Quaternion b) => new Quaternion(
            a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y + a.y * b.w + a.z * b.x - a.x * b.z,
            a.w * b.z + a.z * b.w + a.x * b.y - a.y * b.x,
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);

        private static Quaternion Axis(float angleDeg, float ax, float ay, float az)
        {
            double half = angleDeg * Math.PI / 360.0;
            float s = (float)Math.Sin(half);
            return new Quaternion(ax * s, ay * s, az * s, (float)Math.Cos(half));
        }

        /// <summary>Unity's Euler: rotate about Z, then X, then Y (in degrees).</summary>
        public static Quaternion Euler(Vector3 euler) => Euler(euler.x, euler.y, euler.z);

        public static Quaternion Euler(float x, float y, float z) =>
            Axis(y, 0, 1, 0) * Axis(x, 1, 0, 0) * Axis(z, 0, 0, 1);
    }

    public struct Matrix4x4
    {
        private float[] _m; // row-major

        public float this[int row, int column]
        {
            get => (_m ?? Identity())[row * 4 + column];
            set { _m ??= Identity(); _m[row * 4 + column] = value; }
        }

        private static float[] Identity() => new float[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };

        public static Matrix4x4 TRS(Vector3 pos, Quaternion q, Vector3 s)
        {
            float x = q.x, y = q.y, z = q.z, w = q.w;
            var m = new Matrix4x4();
            m[0, 0] = (1 - 2 * (y * y + z * z)) * s.x;
            m[1, 0] = 2 * (x * y + w * z) * s.x;
            m[2, 0] = 2 * (x * z - w * y) * s.x;
            m[0, 1] = 2 * (x * y - w * z) * s.y;
            m[1, 1] = (1 - 2 * (x * x + z * z)) * s.y;
            m[2, 1] = 2 * (y * z + w * x) * s.y;
            m[0, 2] = 2 * (x * z + w * y) * s.z;
            m[1, 2] = 2 * (y * z - w * x) * s.z;
            m[2, 2] = (1 - 2 * (x * x + y * y)) * s.z;
            m[0, 3] = pos.x;
            m[1, 3] = pos.y;
            m[2, 3] = pos.z;
            m[3, 0] = 0; m[3, 1] = 0; m[3, 2] = 0; m[3, 3] = 1;
            return m;
        }
    }

    public struct Rect
    {
        public float x, y, width, height;
        public Rect(float x, float y, float width, float height) { this.x = x; this.y = y; this.width = width; this.height = height; }
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => new Color(1, 1, 1, 1);
        public static Color black => new Color(0, 0, 0, 1);
        public static Color clear => new Color(0, 0, 0, 0);
        public static Color operator *(Color a, Color b) => new Color(a.r * b.r, a.g * b.g, a.b * b.b, a.a * b.a);
        public static Color operator *(Color a, float s) => new Color(a.r * s, a.g * s, a.b * s, a.a * s);
        public static Color Lerp(Color a, Color b, float t)
        {
            t = Mathf.Clamp01(t);
            return new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
        }
    }

    public static class Mathf
    {
        public const float PI = (float)Math.PI;
        public const float Deg2Rad = PI / 180f;
        public const float Rad2Deg = 180f / PI;
        public static float Abs(float v) => Math.Abs(v);
        public static float Max(float a, float b) => Math.Max(a, b);
        public static int Max(int a, int b) => Math.Max(a, b);
        public static float Min(float a, float b) => Math.Min(a, b);
        public static int Min(int a, int b) => Math.Min(a, b);
        public static float Clamp(float v, float min, float max) => v < min ? min : v > max ? max : v;
        public static float Clamp01(float v) => Clamp(v, 0f, 1f);
        public static float Round(float v) => (float)Math.Round(v, MidpointRounding.ToEven);
        public static float Ceil(float v) => (float)Math.Ceiling(v);
        public static float Floor(float v) => (float)Math.Floor(v);
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static bool Approximately(float a, float b) =>
            Math.Abs(b - a) < Math.Max(1e-6f * Math.Max(Math.Abs(a), Math.Abs(b)), float.Epsilon * 8);
    }

    public struct Keyframe
    {
        public float time, value, inTangent, outTangent;
        public Keyframe(float time, float value) { this.time = time; this.value = value; inTangent = 0; outTangent = 0; }
        public Keyframe(float time, float value, float inTangent, float outTangent)
        {
            this.time = time; this.value = value; this.inTangent = inTangent; this.outTangent = outTangent;
        }
    }

    public class AnimationCurve
    {
        public Keyframe[] keys { get; set; }
        public AnimationCurve(params Keyframe[] keys) { this.keys = keys ?? new Keyframe[0]; }
        public int length => keys.Length;

        public static AnimationCurve Linear(float t0, float v0, float t1, float v1)
        {
            float slope = t1 == t0 ? 0 : (v1 - v0) / (t1 - t0);
            return new AnimationCurve(new Keyframe(t0, v0, 0, slope), new Keyframe(t1, v1, slope, 0));
        }

        public static AnimationCurve Constant(float t0, float t1, float value) =>
            new AnimationCurve(new Keyframe(t0, value), new Keyframe(t1, value));

        /// <summary>Unity's (non-weighted) Hermite evaluation, clamped outside the keys.</summary>
        public float Evaluate(float time)
        {
            if (keys.Length == 0) return 0;
            if (time <= keys[0].time) return keys[0].value;
            if (time >= keys[keys.Length - 1].time) return keys[keys.Length - 1].value;
            for (int i = 0; i < keys.Length - 1; i++)
            {
                Keyframe k0 = keys[i], k1 = keys[i + 1];
                if (time > k1.time) continue;
                float dt = k1.time - k0.time;
                if (dt <= 0) return k1.value;
                float t = (time - k0.time) / dt;
                float t2 = t * t, t3 = t2 * t;
                return (2 * t3 - 3 * t2 + 1) * k0.value + (t3 - 2 * t2 + t) * k0.outTangent * dt
                    + (-2 * t3 + 3 * t2) * k1.value + (t3 - t2) * k1.inTangent * dt;
            }
            return keys[keys.Length - 1].value;
        }
    }

    public struct GradientColorKey
    {
        public Color color;
        public float time;
        public GradientColorKey(Color color, float time) { this.color = color; this.time = time; }
    }

    public struct GradientAlphaKey
    {
        public float alpha;
        public float time;
        public GradientAlphaKey(float alpha, float time) { this.alpha = alpha; this.time = time; }
    }

    public enum GradientMode { Blend = 0, Fixed = 1 }

    public class Gradient
    {
        public GradientColorKey[] colorKeys { get; set; } = { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) };
        public GradientAlphaKey[] alphaKeys { get; set; } = { new GradientAlphaKey(1, 0), new GradientAlphaKey(1, 1) };
        public GradientMode mode { get; set; } = GradientMode.Blend;

        public void SetKeys(GradientColorKey[] colorKeys, GradientAlphaKey[] alphaKeys)
        {
            this.colorKeys = colorKeys;
            this.alphaKeys = alphaKeys;
        }

        public Color Evaluate(float time)
        {
            Color c = Sample(colorKeys.Length, i => colorKeys[i].time, i => colorKeys[i].color, time);
            float a = Sample(alphaKeys.Length, i => alphaKeys[i].time, i => new Color(alphaKeys[i].alpha, 0, 0), time).r;
            return new Color(c.r, c.g, c.b, a);
        }

        private Color Sample(int count, Func<int, float> timeOf, Func<int, Color> valueOf, float time)
        {
            if (count == 0) return Color.white;
            if (time <= timeOf(0)) return valueOf(0);
            for (int i = 0; i < count - 1; i++)
            {
                float t0 = timeOf(i), t1 = timeOf(i + 1);
                if (time > t1) continue;
                if (mode == GradientMode.Fixed) return valueOf(i + 1);
                return Color.Lerp(valueOf(i), valueOf(i + 1), t1 > t0 ? (time - t0) / (t1 - t0) : 1);
            }
            return valueOf(count - 1);
        }
    }
}
