using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>An insertion-ordered JSON object whose Set replaces an existing key.</summary>
    internal sealed class JMap : IEnumerable<KeyValuePair<string, object>>
    {
        private readonly List<KeyValuePair<string, object>> _members = new List<KeyValuePair<string, object>>();

        public JMap Set(string key, object value)
        {
            for (int i = 0; i < _members.Count; i++)
            {
                if (_members[i].Key == key)
                {
                    _members[i] = new KeyValuePair<string, object>(key, value);
                    return this;
                }
            }
            _members.Add(new KeyValuePair<string, object>(key, value));
            return this;
        }

        public JMap Map(string key)
        {
            foreach (var kv in _members)
            {
                if (kv.Key == key && kv.Value is JMap existing) return existing;
            }
            var map = new JMap();
            Set(key, map);
            return map;
        }

        public int Count => _members.Count;
        public IEnumerator<KeyValuePair<string, object>> GetEnumerator() => _members.GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    /// <summary>
    /// Compact, culture-invariant JSON writer: objects are indented for reading, numeric arrays
    /// stay on one line so frame and particle dumps do not balloon.
    /// </summary>
    internal static class PJson
    {
        public static void Write(string path, object value)
        {
            var sb = new StringBuilder();
            WriteValue(sb, value, 0);
            sb.Append('\n');
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        }

        public static string Serialize(object value)
        {
            var sb = new StringBuilder();
            WriteValue(sb, value, 0);
            return sb.ToString();
        }

        public static string Num(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return "null";
            if (v == Math.Floor(v) && Math.Abs(v) < 1e15) return ((long)v).ToString(CultureInfo.InvariantCulture);
            return v.ToString("R", CultureInfo.InvariantCulture);
        }

        /// <summary>A float in its own shortest round-trip form (0.1f → "0.1", not its double widening).</summary>
        public static string NumF(float v)
        {
            if (float.IsNaN(v) || float.IsInfinity(v)) return "null";
            if (v == Math.Floor(v) && Math.Abs(v) < 1e7f) return ((long)v).ToString(CultureInfo.InvariantCulture);
            return v.ToString("R", CultureInfo.InvariantCulture);
        }

        /// <summary>Rounds for storage; measured values do not need 17 significant digits.</summary>
        public static double Round(double v, int decimals = 5) =>
            double.IsNaN(v) || double.IsInfinity(v) ? v : Math.Round(v, decimals);

        private static void WriteValue(StringBuilder sb, object v, int indent)
        {
            switch (v)
            {
                case null: sb.Append("null"); return;
                case string s: WriteString(sb, s); return;
                case bool b: sb.Append(b ? "true" : "false"); return;
                case float f: sb.Append(NumF(f)); return;
                case double d: sb.Append(Num(d)); return;
                case int i: sb.Append(i.ToString(CultureInfo.InvariantCulture)); return;
                case long l: sb.Append(l.ToString(CultureInfo.InvariantCulture)); return;
                case uint u: sb.Append(u.ToString(CultureInfo.InvariantCulture)); return;
                case Enum e: WriteString(sb, e.ToString()); return;
                case Vector2 v2: WriteFloats(sb, v2.x, v2.y); return;
                case Vector3 v3: WriteFloats(sb, v3.x, v3.y, v3.z); return;
                case Vector4 v4: WriteFloats(sb, v4.x, v4.y, v4.z, v4.w); return;
                case Quaternion q: WriteFloats(sb, q.x, q.y, q.z, q.w); return;
                case Color c: WriteFloats(sb, c.r, c.g, c.b, c.a); return;
                case Color32 c32: WriteDoubleArray(sb, new double[] { c32.r, c32.g, c32.b, c32.a }); return;
                case Matrix4x4 m:
                    // Row-major: m[row, col].
                    WriteFloats(sb, m.m00, m.m01, m.m02, m.m03, m.m10, m.m11, m.m12, m.m13,
                        m.m20, m.m21, m.m22, m.m23, m.m30, m.m31, m.m32, m.m33);
                    return;
                case float[] fa: WriteFloats(sb, fa); return;
                case double[] da: WriteDoubleArray(sb, da); return;
                case int[] ia:
                    sb.Append('[');
                    for (int k = 0; k < ia.Length; k++)
                    {
                        if (k > 0) sb.Append(',');
                        sb.Append(ia[k].ToString(CultureInfo.InvariantCulture));
                    }
                    sb.Append(']');
                    return;
                case JMap map: WriteMap(sb, map, indent); return;
                case IDictionary<string, object> dict:
                    var asMap = new JMap();
                    foreach (var kv in dict) asMap.Set(kv.Key, kv.Value);
                    WriteMap(sb, asMap, indent);
                    return;
                case IEnumerable list: WriteList(sb, list, indent); return;
                default: WriteString(sb, v.ToString()); return;
            }
        }

        private static void WriteMap(StringBuilder sb, JMap map, int indent)
        {
            if (map.Count == 0)
            {
                sb.Append("{}");
                return;
            }
            sb.Append('{');
            bool first = true;
            foreach (var kv in map)
            {
                if (!first) sb.Append(',');
                first = false;
                NewLine(sb, indent + 1);
                WriteString(sb, kv.Key);
                sb.Append(": ");
                WriteValue(sb, kv.Value, indent + 1);
            }
            NewLine(sb, indent);
            sb.Append('}');
        }

        private static void WriteList(StringBuilder sb, IEnumerable list, int indent)
        {
            var items = new List<object>();
            foreach (object o in list) items.Add(o);
            if (items.Count == 0)
            {
                sb.Append("[]");
                return;
            }
            bool scalars = true;
            foreach (object o in items)
            {
                if (o is JMap || o is IDictionary<string, object> || (o is IEnumerable && !(o is string)))
                {
                    scalars = false;
                    break;
                }
            }
            sb.Append('[');
            for (int k = 0; k < items.Count; k++)
            {
                if (k > 0) sb.Append(scalars ? ", " : ",");
                if (!scalars) NewLine(sb, indent + 1);
                WriteValue(sb, items[k], indent + 1);
            }
            if (!scalars) NewLine(sb, indent);
            sb.Append(']');
        }

        private static void WriteFloats(StringBuilder sb, params float[] a)
        {
            sb.Append('[');
            for (int k = 0; k < a.Length; k++)
            {
                if (k > 0) sb.Append(',');
                sb.Append(NumF(a[k]));
            }
            sb.Append(']');
        }

        private static void WriteDoubleArray(StringBuilder sb, double[] a)
        {
            sb.Append('[');
            for (int k = 0; k < a.Length; k++)
            {
                if (k > 0) sb.Append(',');
                sb.Append(Num(a[k]));
            }
            sb.Append(']');
        }

        private static void NewLine(StringBuilder sb, int indent)
        {
            sb.Append('\n');
            sb.Append(' ', indent * 2);
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }
}
