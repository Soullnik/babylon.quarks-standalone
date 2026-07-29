using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Minimal, dependency-free JSON writer. Preserves insertion order (the Quarks envelope is
    /// order-insensitive but stable output makes diffs readable) and emits numbers with invariant
    /// culture so decimals never localise to commas.
    /// </summary>
    public abstract class JToken
    {
        internal abstract void Write(StringBuilder sb, int indent);

        public override string ToString()
        {
            var sb = new StringBuilder();
            Write(sb, 0);
            return sb.ToString();
        }

        public static implicit operator JToken(double v) => new JNumber(v);
        public static implicit operator JToken(float v) => new JNumber(v);
        public static implicit operator JToken(int v) => new JNumber(v);
        public static implicit operator JToken(bool v) => new JBool(v);
        public static implicit operator JToken(string v) => v == null ? (JToken)JNull.Instance : new JString(v);

        internal static void Newline(StringBuilder sb, int indent)
        {
            sb.Append('\n');
            sb.Append(' ', indent * 2);
        }
    }

    public sealed class JNull : JToken
    {
        public static readonly JNull Instance = new JNull();
        internal override void Write(StringBuilder sb, int indent) => sb.Append("null");
    }

    public sealed class JBool : JToken
    {
        private readonly bool _v;
        public JBool(bool v) { _v = v; }
        internal override void Write(StringBuilder sb, int indent) => sb.Append(_v ? "true" : "false");
    }

    public sealed class JNumber : JToken
    {
        private readonly double _v;
        public JNumber(double v) { _v = v; }
        public double Value => _v;

        internal override void Write(StringBuilder sb, int indent)
        {
            if (double.IsNaN(_v) || double.IsInfinity(_v))
            {
                sb.Append('0');
                return;
            }
            // Print whole numbers without a trailing ".0" for compact, readable output.
            if (_v == System.Math.Floor(_v) && System.Math.Abs(_v) < 1e15)
            {
                sb.Append(((long)_v).ToString(CultureInfo.InvariantCulture));
            }
            else
            {
                sb.Append(_v.ToString("R", CultureInfo.InvariantCulture));
            }
        }
    }

    public sealed class JString : JToken
    {
        private readonly string _v;
        public JString(string v) { _v = v; }
        public string Value => _v;

        internal override void Write(StringBuilder sb, int indent)
        {
            sb.Append('"');
            foreach (char c in _v)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20)
                        {
                            sb.Append("\\u");
                            sb.Append(((int)c).ToString("x4"));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }
    }

    public sealed class JArray : JToken
    {
        public readonly List<JToken> Items = new List<JToken>();

        public JArray Add(JToken t)
        {
            Items.Add(t ?? JNull.Instance);
            return this;
        }

        internal override void Write(StringBuilder sb, int indent)
        {
            if (Items.Count == 0)
            {
                sb.Append("[]");
                return;
            }
            sb.Append('[');
            for (int i = 0; i < Items.Count; i++)
            {
                Newline(sb, indent + 1);
                Items[i].Write(sb, indent + 1);
                if (i < Items.Count - 1) sb.Append(',');
            }
            Newline(sb, indent);
            sb.Append(']');
        }
    }

    public sealed class JObject : JToken
    {
        public readonly List<KeyValuePair<string, JToken>> Members = new List<KeyValuePair<string, JToken>>();

        /// <summary>Adds a member. A null value is written as JSON null.</summary>
        public JObject Set(string key, JToken value)
        {
            Members.Add(new KeyValuePair<string, JToken>(key, value ?? JNull.Instance));
            return this;
        }

        /// <summary>Returns the array at <paramref name="key"/>, creating and attaching one if absent.</summary>
        public JArray GetOrCreateArray(string key)
        {
            foreach (var kv in Members)
            {
                if (kv.Key == key && kv.Value is JArray existing) return existing;
            }
            var arr = new JArray();
            Set(key, arr);
            return arr;
        }

        internal override void Write(StringBuilder sb, int indent)
        {
            if (Members.Count == 0)
            {
                sb.Append("{}");
                return;
            }
            sb.Append('{');
            for (int i = 0; i < Members.Count; i++)
            {
                Newline(sb, indent + 1);
                new JString(Members[i].Key).Write(sb, indent + 1);
                sb.Append(": ");
                Members[i].Value.Write(sb, indent + 1);
                if (i < Members.Count - 1) sb.Append(',');
            }
            Newline(sb, indent);
            sb.Append('}');
        }
    }

    /// <summary>Read-only navigation helpers for audit / analyzer code.</summary>
    public static class JObjectNav
    {
        public static JToken Get(this JObject o, string key)
        {
            if (o == null) return null;
            foreach (var kv in o.Members)
            {
                if (kv.Key == key) return kv.Value;
            }
            return null;
        }

        public static JObject GetObject(this JObject o, string key)
        {
            JToken t = o.Get(key);
            return t as JObject;
        }

        public static JArray GetArray(this JObject o, string key)
        {
            JToken t = o.Get(key);
            return t as JArray;
        }
    }
}
