using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>What a Shader Graph reads from the material it renders: the Unity side of the compiler.</summary>
    internal interface IGraphMaterial
    {
        /// <summary>A Vector1 / 2 / 3 / 4, Boolean or Color property's value as the shader receives it.</summary>
        float[] Value(string reference, GraphPropertyKind kind);

        /// <summary>
        /// The texture bound to a Texture2D property (null for an unconnected texture input), added
        /// to the export: <c>{"texture": uuid, "srgb": bool}</c>, or <c>{"color": [r, g, b, a]}</c> for
        /// an empty slot, which samples as <paramref name="fallback"/>. Asked only for textures the
        /// compiled graph samples.
        /// </summary>
        JToken Texture(string reference, float[] fallback);

        /// <summary>The property's tiling (x, y) and offset (z, w).</summary>
        float[] TextureTransform(string reference);

        /// <summary>Whether a texture is bound to the property; an empty slot samples as a constant.</summary>
        bool HasTexture(string reference);
    }

    internal enum GraphPropertyKind { Float, Vector, Color, HdrColor, Boolean }

    /// <summary>
    /// Compiles a Shader Graph into the small node list babylon.quarks turns into a fragment shader:
    /// what the graph computes for the particle's colour and alpha, with the material's values
    /// folded in. Reads the .shadergraph file itself — the graph is data, and nothing about it is
    /// inferred from what its properties or the shader are called.
    ///
    /// Every value carries its vector width, resolved as Shader Graph resolves it: a dynamic input
    /// takes the narrowest width connected to it, a scalar is broadcast, a wider value truncated and
    /// a narrower one padded with zeros. A graph that uses a node this does not know does not
    /// compile — <see cref="Error"/> says which — and the material exports as texture × colour.
    /// </summary>
    internal sealed class ShaderGraphCompiler
    {
        private const string Sg = "UnityEditor.ShaderGraph.";

        public string Error { get; private set; }

        private Dictionary<string, Dictionary<string, object>> _objects;
        private Dictionary<string, KeyValuePair<string, int>> _edges;
        private IGraphMaterial _material;
        private readonly JArray _nodes = new JArray();
        private readonly Dictionary<string, Val> _memo = new Dictionary<string, Val>();
        private readonly Dictionary<string, int> _constNodes = new Dictionary<string, int>();
        private readonly List<KeyValuePair<string, float[]>> _textures = new List<KeyValuePair<string, float[]>>();
        private readonly Dictionary<string, int> _emitted = new Dictionary<string, int>();

        private sealed class Val
        {
            public int Dim;
            public int Node = -1;
            public float[] Const;
            public int Texture = -1;
            public string TextureReference;
            public bool IsTexture => Texture >= 0;
            public bool IsConst => Const != null;
        }

        private sealed class CompileError : Exception
        {
            public CompileError(string message) : base(message) { }
        }

        /// <summary>The compiled graph as JSON, or null when it cannot be (see <see cref="Error"/>).</summary>
        public JObject Compile(string graphText, IGraphMaterial material)
        {
            _material = material;
            try
            {
                List<object> documents = MiniJson.ParseAll(graphText);
                _objects = new Dictionary<string, Dictionary<string, object>>();
                Dictionary<string, object> graph = null;
                foreach (object d in documents)
                {
                    var o = d as Dictionary<string, object>;
                    if (o == null || !(o.TryGetValue("m_ObjectId", out object id) && id is string)) continue;
                    _objects[(string)id] = o;
                    if (Str(o, "m_Type") == Sg + "GraphData") graph = o;
                }
                if (graph == null) throw new CompileError("not a Shader Graph in the multi-document format (Unity 2020.2+)");

                _edges = new Dictionary<string, KeyValuePair<string, int>>();
                foreach (object e in List(graph, "m_Edges"))
                {
                    var edge = (Dictionary<string, object>)e;
                    var output = (Dictionary<string, object>)edge["m_OutputSlot"];
                    var input = (Dictionary<string, object>)edge["m_InputSlot"];
                    _edges[Ref(input, "m_Node") + ":" + Int(input, "m_SlotId")] =
                        new KeyValuePair<string, int>(Ref(output, "m_Node"), Int(output, "m_SlotId"));
                }

                Val color = Block(graph, "SurfaceDescription.BaseColor", 3, new[] { 0.5f, 0.5f, 0.5f, 0f });
                if (LitTarget())
                {
                    Val emission = Block(graph, "SurfaceDescription.Emission", 3, new[] { 0f, 0f, 0f, 0f });
                    color = Op("add", 3, color, emission);
                }
                Val alpha = Block(graph, "SurfaceDescription.Alpha", 1, new[] { 1f, 0f, 0f, 0f });
                Val clip = AlphaClip() ? Block(graph, "SurfaceDescription.AlphaClipThreshold", 1, new[] { 0.5f, 0f, 0f, 0f }) : null;

                var outputs = new List<int> { Materialise(color), Materialise(alpha) };
                if (clip != null) outputs.Add(Materialise(clip));
                return Prune(outputs);
            }
            catch (CompileError e)
            {
                Error = e.Message;
                return null;
            }
            catch (Exception e) when (e is InvalidCastException || e is KeyNotFoundException || e is FormatException)
            {
                Error = "unexpected graph layout (" + e.Message + ")";
                return null;
            }
        }

        // ---- blocks and targets --------------------------------------------------------------

        private Val Block(Dictionary<string, object> graph, string descriptor, int dim, float[] fallback)
        {
            var fragment = (Dictionary<string, object>)graph["m_FragmentContext"];
            foreach (object b in List(fragment, "m_Blocks"))
            {
                Dictionary<string, object> block = Obj(Ref((Dictionary<string, object>)b, null));
                if (Str(block, "m_SerializedDescriptor") != descriptor) continue;
                Dictionary<string, object> slot = Slots(block)[0];
                return Cast(Input(block, slot), dim);
            }
            return Const(dim, fallback);
        }

        /// <summary>A lit Universal target adds Emission to the colour; unlit ones ignore it.</summary>
        private bool LitTarget()
        {
            foreach (var o in _objects.Values)
            {
                if (Str(o, "m_Type") == "UnityEditor.Rendering.Universal.ShaderGraph.UniversalLitSubTarget") return true;
            }
            return false;
        }

        private bool AlphaClip()
        {
            foreach (var o in _objects.Values)
            {
                if (o.TryGetValue("m_AlphaClip", out object clip) && clip is bool on && on) return true;
            }
            return false;
        }

        // ---- slots and edges -----------------------------------------------------------------

        private List<Dictionary<string, object>> Slots(Dictionary<string, object> node)
        {
            var slots = new List<Dictionary<string, object>>();
            foreach (object s in List(node, "m_Slots")) slots.Add(Obj(Ref((Dictionary<string, object>)s, null)));
            return slots;
        }

        private Dictionary<string, object> Slot(Dictionary<string, object> node, int id)
        {
            foreach (var s in Slots(node))
            {
                if (Int(s, "m_Id") == id) return s;
            }
            throw new CompileError($"{ShortType(node)} has no slot {id}");
        }

        private Dictionary<string, object> SlotNamed(Dictionary<string, object> node, string displayName)
        {
            foreach (var s in Slots(node))
            {
                if (Str(s, "m_DisplayName") == displayName && Int(s, "m_SlotType") == 0) return s;
            }
            throw new CompileError($"{ShortType(node)} has no input '{displayName}'");
        }

        private bool Connected(Dictionary<string, object> node, Dictionary<string, object> slot) =>
            _edges.ContainsKey(Str(node, "m_ObjectId") + ":" + Int(slot, "m_Id"));

        /// <summary>The value an input slot receives: its connection, or its own default.</summary>
        private Val Input(Dictionary<string, object> node, Dictionary<string, object> slot)
        {
            if (_edges.TryGetValue(Str(node, "m_ObjectId") + ":" + Int(slot, "m_Id"), out var source))
            {
                return Output(Obj(source.Key), source.Value);
            }
            return SlotDefault(slot);
        }

        private Val In(Dictionary<string, object> node, string displayName) => Input(node, SlotNamed(node, displayName));

        private Val SlotDefault(Dictionary<string, object> slot)
        {
            string type = ShortTypeName(Str(slot, "m_Type"));
            switch (type)
            {
                case "UVMaterialSlot":
                    return Uv(slot.TryGetValue("m_Channel", out object channel) ? Convert.ToInt32(channel) : 0, 2);
                case "Texture2DInputMaterialSlot":
                    return TextureValue(null, new[] { 1f, 1f, 1f, 1f });
                case "BooleanMaterialSlot":
                    return Const(1, new[] { Bool(slot, "m_Value") ? 1f : 0f, 0f, 0f, 0f });
                case "ScreenPositionMaterialSlot":
                    return ScreenPosition(slot.TryGetValue("m_ScreenSpaceType", out object mode) ? Convert.ToInt32(mode) : 0);
                case "VertexColorMaterialSlot":
                    return Leaf("vertexColor", 4);
            }
            object value = slot.TryGetValue("m_Value", out object v) ? v : null;
            if (value is double d) return Const(1, new[] { (float)d, 0f, 0f, 0f });
            if (value is Dictionary<string, object> vec)
            {
                if (vec.ContainsKey("e00"))
                {
                    // A dynamic value slot keeps a matrix; as a vector it is the first row.
                    return Const(4, new[] { F(vec, "e00"), F(vec, "e01"), F(vec, "e02"), F(vec, "e03") });
                }
                if (vec.ContainsKey("r")) return Const(4, new[] { F(vec, "r"), F(vec, "g"), F(vec, "b"), F(vec, "a") });
                int dim = vec.ContainsKey("w") ? 4 : vec.ContainsKey("z") ? 3 : 2;
                return Const(dim, new[] { F(vec, "x"), F(vec, "y"), vec.ContainsKey("z") ? F(vec, "z") : 0f, vec.ContainsKey("w") ? F(vec, "w") : 0f });
            }
            throw new CompileError($"unconnected input of type {type} has no value");
        }

        // ---- nodes ---------------------------------------------------------------------------

        private Val Output(Dictionary<string, object> node, int slotId)
        {
            string key = Str(node, "m_ObjectId") + ":" + slotId;
            if (_memo.TryGetValue(key, out Val cached)) return cached;
            Val value = Evaluate(node, slotId);
            _memo[key] = value;
            return value;
        }

        private Val Evaluate(Dictionary<string, object> node, int slotId)
        {
            string type = ShortType(node);
            string output = Str(Slot(node, slotId), "m_DisplayName");
            switch (type)
            {
                case "PropertyNode": return Property(Obj(Ref((Dictionary<string, object>)node["m_Property"], null)));
                case "Vector1Node": return Cast(In(node, "X"), 1);
                case "Vector2Node": return Combine(2, In(node, "X"), In(node, "Y"));
                case "Vector3Node": return Combine(3, In(node, "X"), In(node, "Y"), In(node, "Z"));
                case "Vector4Node": return Combine(4, In(node, "X"), In(node, "Y"), In(node, "Z"), In(node, "W"));
                case "ColorNode":
                {
                    var c = (Dictionary<string, object>)((Dictionary<string, object>)node["m_Color"])["color"];
                    return Const(4, new[] { F(c, "r"), F(c, "g"), F(c, "b"), F(c, "a") });
                }
                case "SplitNode":
                {
                    Val v = Cast(In(node, "In"), 4);
                    return Component(v, "RGBA".IndexOf(output[0]));
                }
                case "CombineNode":
                {
                    Val r = In(node, "R"), g = In(node, "G"), b = In(node, "B"), a = In(node, "A");
                    if (output == "RGBA") return Combine(4, r, g, b, a);
                    if (output == "RGB") return Combine(3, r, g, b);
                    return Combine(2, r, g);
                }
                case "AddNode": return Dynamic(node, "add", "A", "B");
                case "SubtractNode": return Dynamic(node, "sub", "A", "B");
                case "MultiplyNode": return Dynamic(node, "mul", "A", "B");
                case "DivideNode": return Dynamic(node, "div", "A", "B");
                case "PowerNode": return Dynamic(node, "pow", "A", "B");
                case "MinimumNode": return Dynamic(node, "min", "A", "B");
                case "MaximumNode": return Dynamic(node, "max", "A", "B");
                case "ModuloNode": return Dynamic(node, "mod", "A", "B");
                case "StepNode": return Dynamic(node, "step", "Edge", "In");
                case "LerpNode": return Dynamic(node, "lerp", "A", "B", "T");
                case "SmoothstepNode": return Dynamic(node, "smoothstep", "Edge1", "Edge2", "In");
                case "ClampNode": return Dynamic(node, "clamp", "In", "Min", "Max");
                case "SaturateNode": return Dynamic(node, "saturate", "In");
                case "OneMinusNode": return Dynamic(node, "oneMinus", "In");
                case "NegateNode": return Dynamic(node, "negate", "In");
                case "AbsoluteNode": return Dynamic(node, "abs", "In");
                case "FractionNode": return Dynamic(node, "fract", "In");
                case "FloorNode": return Dynamic(node, "floor", "In");
                case "CeilingNode": return Dynamic(node, "ceil", "In");
                case "RoundNode": return Dynamic(node, "round", "In");
                case "SineNode": return Dynamic(node, "sin", "In");
                case "CosineNode": return Dynamic(node, "cos", "In");
                case "SquareRootNode": return Dynamic(node, "sqrt", "In");
                case "ReciprocalNode": return Dynamic(node, "reciprocal", "In");
                case "NormalizeNode": return Dynamic(node, "normalize", "In");
                case "LengthNode": return Op("length", 1, In(node, "In"));
                case "DotProductNode":
                {
                    Val a = In(node, "A"), b = In(node, "B");
                    int dim = Math.Min(a.Dim, b.Dim);
                    return Op("dot", 1, Cast(a, dim), Cast(b, dim));
                }
                case "DistanceNode":
                {
                    Val a = In(node, "A"), b = In(node, "B");
                    int dim = Math.Min(a.Dim, b.Dim);
                    return Op("length", 1, Op("sub", dim, Cast(a, dim), Cast(b, dim)));
                }
                case "RemapNode":
                {
                    Val x = In(node, "In");
                    Val from = Cast(In(node, "In Min Max"), 2), to = Cast(In(node, "Out Min Max"), 2);
                    int dim = x.Dim;
                    // to.x + (x - from.x) * (to.y - to.x) / (from.y - from.x)
                    Val scale = Op("div", 1, Op("sub", 1, Component(to, 1), Component(to, 0)), Op("sub", 1, Component(from, 1), Component(from, 0)));
                    Val t = Op("sub", dim, x, Cast(Component(from, 0), dim));
                    return Op("add", dim, Op("mul", dim, t, Cast(scale, dim)), Cast(Component(to, 0), dim));
                }
                case "BranchNode":
                {
                    Val predicate = Cast(In(node, "Predicate"), 1);
                    // A material's switch is a constant: only the branch taken is compiled.
                    if (predicate.IsConst) return In(node, predicate.Const[0] > 0.5f ? "True" : "False");
                    int dim = DynamicDim(node, new[] { "True", "False" });
                    return Op("select", dim, predicate, Cast(In(node, "True"), dim), Cast(In(node, "False"), dim));
                }
                case "ComparisonNode":
                {
                    int comparison = node.TryGetValue("m_ComparisonType", out object c) ? Convert.ToInt32(c) : 0;
                    string[] ops = { "eq", "ne", "lt", "le", "gt", "ge" };
                    if (comparison < 0 || comparison >= ops.Length) throw new CompileError("unknown comparison " + comparison);
                    return Op(ops[comparison], 1, Cast(In(node, "A"), 1), Cast(In(node, "B"), 1));
                }
                case "TilingAndOffsetNode":
                {
                    Val uv = Cast(In(node, "UV"), 2);
                    return Op("add", 2, Op("mul", 2, uv, Cast(In(node, "Tiling"), 2)), Cast(In(node, "Offset"), 2));
                }
                case "UVNode":
                    return Uv(node.TryGetValue("m_OutputChannel", out object ch) ? Convert.ToInt32(ch) : 0, 4);
                case "VertexColorNode": return Leaf("vertexColor", 4);
                case "TimeNode":
                {
                    string[] outputs = { "Time", "Sine Time", "Cosine Time", "Delta Time", "Smooth Delta" };
                    int index = Array.IndexOf(outputs, output);
                    if (index < 0) throw new CompileError("Time output " + output);
                    return Component(Leaf("time", 4), Math.Min(index, 3));
                }
                case "SampleTexture2DNode":
                {
                    if (node.TryGetValue("m_TextureType", out object tt) && Convert.ToInt32(tt) != 0)
                    {
                        throw new CompileError("Sample Texture 2D of type Normal");
                    }
                    Val texture = In(node, "Texture");
                    if (!texture.IsTexture) throw new CompileError("Sample Texture 2D without a texture");
                    Val sample = Sample(texture, Cast(In(node, "UV"), 2));
                    int channel = "RGBA".IndexOf(output.Length == 1 ? output[0] : '-');
                    return channel >= 0 ? Component(sample, channel) : sample;
                }
                case "SplitTextureTransformNode":
                {
                    Val texture = In(node, "In");
                    if (!texture.IsTexture) throw new CompileError("Split Texture Transform without a texture");
                    if (output == "Texture Only") return texture;
                    float[] st = _material.TextureTransform(texture.TextureReference);
                    return output == "Tiling" ? Const(2, new[] { st[0], st[1], 0f, 0f }) : Const(2, new[] { st[2], st[3], 0f, 0f });
                }
                case "ScreenPositionNode":
                    return ScreenPosition(node.TryGetValue("m_ScreenSpaceType", out object mode) ? Convert.ToInt32(mode) : 0);
                case "SceneDepthNode":
                {
                    int sampling = node.TryGetValue("m_DepthSamplingMode", out object m) ? Convert.ToInt32(m) : 0;
                    string[] modes = { "linear01", "raw", "eye" };
                    if (sampling < 0 || sampling >= modes.Length) throw new CompileError("Scene Depth mode " + sampling);
                    var op = new JObject().Set("op", "sceneDepth").Set("type", 1).Set("mode", modes[sampling]);
                    return Emit(op, 1);
                }
                case "CameraNode":
                {
                    switch (output)
                    {
                        case "Near Plane": return Component(Leaf("cameraPlanes", 4), 0);
                        case "Far Plane": return Component(Leaf("cameraPlanes", 4), 1);
                        case "Orthographic": return Component(Leaf("cameraPlanes", 4), 2);
                        case "Z Buffer Sign": return Const(1, new[] { 1f, 0f, 0f, 0f });
                        case "Position": return Leaf("cameraPosition", 3);
                        case "Direction": return Leaf("cameraDirection", 3);
                    }
                    throw new CompileError("Camera output " + output);
                }
            }
            throw new CompileError("unsupported node " + type);
        }

        private Val Property(Dictionary<string, object> property)
        {
            string type = ShortType(property);
            string reference = Str(property, "m_OverrideReferenceName");
            if (string.IsNullOrEmpty(reference)) reference = Str(property, "m_DefaultReferenceName");
            switch (type)
            {
                case "Vector1ShaderProperty": return Const(1, _material.Value(reference, GraphPropertyKind.Float));
                case "Vector2ShaderProperty": return Const(2, _material.Value(reference, GraphPropertyKind.Vector));
                case "Vector3ShaderProperty": return Const(3, _material.Value(reference, GraphPropertyKind.Vector));
                case "Vector4ShaderProperty": return Const(4, _material.Value(reference, GraphPropertyKind.Vector));
                case "BooleanShaderProperty": return Const(1, _material.Value(reference, GraphPropertyKind.Boolean));
                case "ColorShaderProperty":
                {
                    bool hdr = property.TryGetValue("m_ColorMode", out object mode) && Convert.ToInt32(mode) == 1;
                    return Const(4, _material.Value(reference, hdr ? GraphPropertyKind.HdrColor : GraphPropertyKind.Color));
                }
                case "Texture2DShaderProperty":
                {
                    int defaultType = property.TryGetValue("m_DefaultType", out object d) ? Convert.ToInt32(d) : 0;
                    return TextureValue(reference, DefaultTexture(defaultType));
                }
            }
            throw new CompileError("unsupported property type " + type);
        }

        /// <summary>What an empty texture slot samples as, by the property's default: white, black, grey, bump.</summary>
        private static float[] DefaultTexture(int defaultType)
        {
            switch (defaultType)
            {
                case 1: return new[] { 0f, 0f, 0f, 0f };
                case 2: return new[] { 0.5f, 0.5f, 0.5f, 0.5f };
                case 3: return new[] { 0.5f, 0.5f, 1f, 0.5f };
                default: return new[] { 1f, 1f, 1f, 1f };
            }
        }

        // ---- values --------------------------------------------------------------------------

        private Val Dynamic(Dictionary<string, object> node, string op, params string[] inputs)
        {
            int dim = DynamicDim(node, inputs);
            var args = new Val[inputs.Length];
            for (int i = 0; i < inputs.Length; i++) args[i] = Cast(In(node, inputs[i]), dim);
            return Op(op, dim, args);
        }

        /// <summary>
        /// The width a node's dynamic inputs resolve to: the narrowest vector connected to them, a
        /// scalar only when nothing wider is, and a full vector when nothing is connected.
        /// </summary>
        private int DynamicDim(Dictionary<string, object> node, string[] inputs)
        {
            int narrowest = int.MaxValue;
            bool any = false;
            foreach (string name in inputs)
            {
                Dictionary<string, object> slot = SlotNamed(node, name);
                if (!Connected(node, slot)) continue;
                any = true;
                int dim = Input(node, slot).Dim;
                if (dim > 1) narrowest = Math.Min(narrowest, dim);
            }
            if (!any) return 4;
            return narrowest == int.MaxValue ? 1 : narrowest;
        }

        private Val TextureValue(string reference, float[] fallback)
        {
            _textures.Add(new KeyValuePair<string, float[]>(reference, fallback));
            return new Val { Dim = 4, Texture = _textures.Count - 1, TextureReference = reference };
        }

        /// <summary>
        /// The nodes the outputs depend on, renumbered, and the textures those sample — so a
        /// branch or input the graph computes but never uses costs nothing and embeds nothing.
        /// </summary>
        private JObject Prune(List<int> outputs)
        {
            var keep = new SortedSet<int>();
            var stack = new Stack<int>(outputs);
            while (stack.Count > 0)
            {
                int n = stack.Pop();
                if (!keep.Add(n)) continue;
                foreach (int dep in Dependencies((JObject)_nodes.Items[n])) stack.Push(dep);
            }
            var index = new Dictionary<int, int>();
            var textureIndex = new Dictionary<int, int>();
            var nodes = new JArray();
            var textures = new JArray();
            foreach (int n in keep)
            {
                var node = (JObject)_nodes.Items[n];
                var copy = new JObject();
                foreach (var member in node.Members)
                {
                    JToken value = member.Value;
                    if (member.Key == "arg" || member.Key == "uv") value = index[(int)((JNumber)value).Value];
                    else if (member.Key == "args")
                    {
                        var args = new JArray();
                        foreach (JToken a in ((JArray)value).Items) args.Add(index[(int)((JNumber)a).Value]);
                        value = args;
                    }
                    else if (member.Key == "texture")
                    {
                        int t = (int)((JNumber)value).Value;
                        if (!textureIndex.TryGetValue(t, out int slot))
                        {
                            slot = textures.Items.Count;
                            textureIndex[t] = slot;
                            textures.Add(_material.Texture(_textures[t].Key, _textures[t].Value));
                        }
                        value = slot;
                    }
                    copy.Set(member.Key, value);
                }
                index[n] = nodes.Items.Count;
                nodes.Add(copy);
            }
            var result = new JObject()
                .Set("textures", textures)
                .Set("nodes", nodes)
                .Set("color", index[outputs[0]])
                .Set("alpha", index[outputs[1]]);
            if (outputs.Count > 2) result.Set("alphaClip", index[outputs[2]]);
            return result;
        }

        private static IEnumerable<int> Dependencies(JObject node)
        {
            foreach (var member in node.Members)
            {
                if (member.Key == "arg" || member.Key == "uv") yield return (int)((JNumber)member.Value).Value;
                else if (member.Key == "args")
                {
                    foreach (JToken a in ((JArray)member.Value).Items) yield return (int)((JNumber)a).Value;
                }
            }
        }

        private Val Uv(int channel, int dim)
        {
            var op = new JObject().Set("op", "uv").Set("type", 4).Set("channel", channel);
            return Cast(Emit(op, 4), dim);
        }

        private Val ScreenPosition(int mode)
        {
            string[] modes = { "default", "raw", "center", "tiled", "pixel" };
            if (mode < 0 || mode >= modes.Length) throw new CompileError("Screen Position mode " + mode);
            return Emit(new JObject().Set("op", "screenPosition").Set("type", 4).Set("mode", modes[mode]), 4);
        }

        private Val Leaf(string op, int dim)
        {
            string key = "leaf:" + op;
            if (_memo.TryGetValue(key, out Val cached)) return cached;
            Val v = Emit(new JObject().Set("op", op).Set("type", dim), dim);
            _memo[key] = v;
            return v;
        }

        private Val Sample(Val texture, Val uv)
        {
            // An empty slot is one colour wherever it is sampled.
            KeyValuePair<string, float[]> request = _textures[texture.Texture];
            if (request.Key == null || !_material.HasTexture(request.Key)) return Const(4, request.Value);

            string key = "sample:" + texture.Texture + ":" + Key(uv);
            if (_memo.TryGetValue(key, out Val cached)) return cached;
            var op = new JObject().Set("op", "sample").Set("type", 4).Set("texture", texture.Texture).Set("uv", Materialise(uv));
            Val v = Emit(op, 4);
            _memo[key] = v;
            return v;
        }

        private Val Component(Val v, int index)
        {
            if (index < 0 || index > 3) throw new CompileError("component " + index);
            if (v.IsConst) return Const(1, new[] { index < v.Dim || v.Dim == 1 ? v.Const[v.Dim == 1 ? 0 : index] : 0f, 0f, 0f, 0f });
            if (v.Dim == 1) return v;
            if (index >= v.Dim) return Const(1, new[] { 0f, 0f, 0f, 0f });
            return Emit(new JObject().Set("op", "component").Set("type", 1).Set("arg", v.Node).Set("index", index), 1);
        }

        private Val Combine(int dim, params Val[] parts)
        {
            var scalars = new Val[dim];
            for (int i = 0; i < dim; i++) scalars[i] = Cast(parts[i], 1);
            return Op("combine", dim, scalars);
        }

        /// <summary>Converts to a width the way Shader Graph does: broadcast a scalar, truncate, or pad with zeros.</summary>
        private Val Cast(Val v, int dim)
        {
            if (v.IsTexture) throw new CompileError("a texture used as a value");
            if (v.Dim == dim) return v;
            if (v.IsConst)
            {
                var c = new float[4];
                for (int i = 0; i < dim; i++) c[i] = v.Dim == 1 ? v.Const[0] : i < v.Dim ? v.Const[i] : 0f;
                return Const(dim, c);
            }
            return Emit(new JObject().Set("op", "cast").Set("type", dim).Set("arg", v.Node), dim);
        }

        private Val Op(string op, int dim, params Val[] args)
        {
            // x·1, x/1, x+0, x−0 are x; x·0 is 0 — a material's defaults are full of them.
            if (args.Length == 2)
            {
                if ((op == "mul" || op == "div") && Uniform(args[1], 1f)) return args[0];
                if (op == "mul" && Uniform(args[0], 1f)) return args[1];
                if ((op == "add" || op == "sub") && Uniform(args[1], 0f)) return args[0];
                if (op == "add" && Uniform(args[0], 0f)) return args[1];
                if (op == "mul" && (Uniform(args[0], 0f) || Uniform(args[1], 0f))) return Const(dim, new float[4]);
            }
            bool allConst = true;
            foreach (Val a in args) allConst &= a.IsConst;
            if (allConst)
            {
                float[] folded = Fold(op, dim, args);
                if (folded != null) return Const(dim, folded);
            }
            var list = new JArray();
            foreach (Val a in args) list.Add(Materialise(a));
            return Emit(new JObject().Set("op", op).Set("type", dim).Set("args", list), dim);
        }

        private static float[] Fold(string op, int dim, Val[] args)
        {
            var r = new float[4];
            if (op == "dot" || op == "length")
            {
                float sum = 0f;
                int n = args[0].Dim;
                for (int i = 0; i < n; i++) sum += args[0].Const[i] * (op == "dot" ? args[1].Const[i] : args[0].Const[i]);
                r[0] = op == "dot" ? sum : (float)Math.Sqrt(sum);
                return r;
            }
            if (op == "combine")
            {
                for (int i = 0; i < dim; i++) r[i] = args[i].Const[0];
                return r;
            }
            if (op == "normalize")
            {
                float len = 0f;
                for (int i = 0; i < dim; i++) len += args[0].Const[i] * args[0].Const[i];
                len = (float)Math.Sqrt(len);
                for (int i = 0; i < dim; i++) r[i] = len > 0 ? args[0].Const[i] / len : 0f;
                return r;
            }
            for (int i = 0; i < dim; i++)
            {
                float a = args[0].Const[i];
                float b = args.Length > 1 ? args[1].Const[i] : 0f;
                float c = args.Length > 2 ? args[2].Const[i] : 0f;
                switch (op)
                {
                    case "add": r[i] = a + b; break;
                    case "sub": r[i] = a - b; break;
                    case "mul": r[i] = a * b; break;
                    case "div": r[i] = a / b; break;
                    case "pow": r[i] = (float)Math.Pow(a, b); break;
                    case "min": r[i] = Math.Min(a, b); break;
                    case "max": r[i] = Math.Max(a, b); break;
                    case "mod": r[i] = b == 0f ? 0f : a - b * (float)Math.Truncate(a / b); break;
                    case "step": r[i] = b >= a ? 1f : 0f; break;
                    case "lerp": r[i] = a + (b - a) * c; break;
                    case "smoothstep":
                    {
                        float t = Math.Max(0f, Math.Min(1f, (c - a) / (b - a)));
                        r[i] = t * t * (3f - 2f * t);
                        break;
                    }
                    case "clamp": r[i] = Math.Max(b, Math.Min(c, a)); break;
                    case "saturate": r[i] = Math.Max(0f, Math.Min(1f, a)); break;
                    case "oneMinus": r[i] = 1f - a; break;
                    case "negate": r[i] = -a; break;
                    case "abs": r[i] = Math.Abs(a); break;
                    case "fract": r[i] = a - (float)Math.Floor(a); break;
                    case "floor": r[i] = (float)Math.Floor(a); break;
                    case "ceil": r[i] = (float)Math.Ceiling(a); break;
                    case "round": r[i] = (float)Math.Round(a); break;
                    case "sin": r[i] = (float)Math.Sin(a); break;
                    case "cos": r[i] = (float)Math.Cos(a); break;
                    case "sqrt": r[i] = (float)Math.Sqrt(a); break;
                    case "reciprocal": r[i] = 1f / a; break;
                    case "eq": r[i] = a == b ? 1f : 0f; break;
                    case "ne": r[i] = a != b ? 1f : 0f; break;
                    case "lt": r[i] = a < b ? 1f : 0f; break;
                    case "le": r[i] = a <= b ? 1f : 0f; break;
                    case "gt": r[i] = a > b ? 1f : 0f; break;
                    case "ge": r[i] = a >= b ? 1f : 0f; break;
                    default: return null;
                }
            }
            return r;
        }

        private static bool Uniform(Val v, float value)
        {
            if (!v.IsConst) return false;
            for (int i = 0; i < v.Dim; i++)
            {
                if (v.Const[i] != value) return false;
            }
            return true;
        }

        private static Val Const(int dim, float[] value)
        {
            var c = new float[4];
            for (int i = 0; i < 4 && i < value.Length; i++) c[i] = value[i];
            return new Val { Dim = dim, Const = c };
        }

        /// <summary>Adds a node, or finds the identical one already added.</summary>
        private Val Emit(JObject op, int dim)
        {
            string key = op.ToString();
            if (!_emitted.TryGetValue(key, out int index))
            {
                _nodes.Add(op);
                index = _nodes.Items.Count - 1;
                _emitted[key] = index;
            }
            return new Val { Dim = dim, Node = index };
        }

        /// <summary>The node index of a value, emitting a constant node for a folded one.</summary>
        private int Materialise(Val v)
        {
            if (!v.IsConst) return v.Node;
            string key = Key(v);
            if (_constNodes.TryGetValue(key, out int index)) return index;
            var value = new JArray();
            for (int i = 0; i < v.Dim; i++) value.Add(v.Const[i]);
            index = Emit(new JObject().Set("op", "const").Set("type", v.Dim).Set("value", value), v.Dim).Node;
            _constNodes[key] = index;
            return index;
        }

        private static string Key(Val v)
        {
            if (!v.IsConst) return "n" + v.Node;
            var sb = new StringBuilder("c").Append(v.Dim);
            for (int i = 0; i < v.Dim; i++) sb.Append(',').Append(v.Const[i].ToString("R", CultureInfo.InvariantCulture));
            return sb.ToString();
        }

        // ---- JSON access -----------------------------------------------------------------------

        private Dictionary<string, object> Obj(string id)
        {
            if (id != null && _objects.TryGetValue(id, out var o)) return o;
            throw new CompileError("missing object " + id);
        }

        private static string Ref(Dictionary<string, object> holder, string key)
        {
            var r = key == null ? holder : (Dictionary<string, object>)holder[key];
            return (string)r["m_Id"];
        }

        private static List<object> List(Dictionary<string, object> o, string key) =>
            o.TryGetValue(key, out object v) && v is List<object> list ? list : new List<object>();

        private static string Str(Dictionary<string, object> o, string key) =>
            o.TryGetValue(key, out object v) ? v as string : null;

        private static int Int(Dictionary<string, object> o, string key) => Convert.ToInt32(o[key], CultureInfo.InvariantCulture);

        private static bool Bool(Dictionary<string, object> o, string key) => o.TryGetValue(key, out object v) && v is bool b && b;

        private static float F(Dictionary<string, object> o, string key) =>
            o.TryGetValue(key, out object v) ? (float)Convert.ToDouble(v, CultureInfo.InvariantCulture) : 0f;

        private static string ShortType(Dictionary<string, object> o) => ShortTypeName(Str(o, "m_Type"));

        private static string ShortTypeName(string type)
        {
            if (type == null) return "?";
            int dot = type.LastIndexOf('.');
            return dot >= 0 ? type.Substring(dot + 1) : type;
        }
    }

    /// <summary>
    /// A small JSON reader: objects as dictionaries, arrays as lists, numbers as doubles. Reads a
    /// file of several top-level values one after another, as Shader Graph writes its files.
    /// </summary>
    internal static class MiniJson
    {
        public static List<object> ParseAll(string text)
        {
            var values = new List<object>();
            int i = 0;
            while (true)
            {
                SkipSpace(text, ref i);
                if (i >= text.Length) return values;
                values.Add(ParseValue(text, ref i));
            }
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipSpace(s, ref i);
            if (i >= s.Length) throw new FormatException("unexpected end of JSON");
            char c = s[i];
            if (c == '{')
            {
                var o = new Dictionary<string, object>();
                i++;
                SkipSpace(s, ref i);
                if (s[i] == '}') { i++; return o; }
                while (true)
                {
                    SkipSpace(s, ref i);
                    string key = ParseString(s, ref i);
                    SkipSpace(s, ref i);
                    Expect(s, ref i, ':');
                    o[key] = ParseValue(s, ref i);
                    SkipSpace(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    Expect(s, ref i, '}');
                    return o;
                }
            }
            if (c == '[')
            {
                var list = new List<object>();
                i++;
                SkipSpace(s, ref i);
                if (s[i] == ']') { i++; return list; }
                while (true)
                {
                    list.Add(ParseValue(s, ref i));
                    SkipSpace(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    Expect(s, ref i, ']');
                    return list;
                }
            }
            if (c == '"') return ParseString(s, ref i);
            if (Match(s, ref i, "true")) return true;
            if (Match(s, ref i, "false")) return false;
            if (Match(s, ref i, "null")) return null;
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (start == i) throw new FormatException("unexpected '" + c + "' in JSON");
            return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        private static string ParseString(string s, ref int i)
        {
            Expect(s, ref i, '"');
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\')
                {
                    sb.Append(c);
                    continue;
                }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u':
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            }
            i++;
            return sb.ToString();
        }

        private static bool Match(string s, ref int i, string word)
        {
            if (string.CompareOrdinal(s, i, word, 0, word.Length) != 0) return false;
            i += word.Length;
            return true;
        }

        private static void Expect(string s, ref int i, char c)
        {
            if (i >= s.Length || s[i] != c) throw new FormatException("expected '" + c + "' in JSON");
            i++;
        }

        private static void SkipSpace(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }
    }
}
