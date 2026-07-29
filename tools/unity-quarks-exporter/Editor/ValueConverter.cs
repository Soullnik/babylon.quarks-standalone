using System.Collections.Generic;
using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Converts Unity's value/curve/gradient types into the quarks.core function JSON shapes
    /// (ConstantValue / IntervalValue / PiecewiseBezier / ConstantColor / RandomColor / Gradient …)
    /// that QuarksLoader deserializes via GeneratorFromJSON / ColorGeneratorFromJSON.
    /// </summary>
    public static class ValueConverter
    {
        // ---- scalar value generators -------------------------------------------------------

        public static JToken Constant(float v) => new JObject().Set("type", "ConstantValue").Set("value", v);

        public static JToken Interval(float a, float b) =>
            new JObject().Set("type", "IntervalValue").Set("a", a).Set("b", b);

        /// <summary>Unity MinMaxCurve → a quarks value generator (radians/units unchanged).</summary>
        public static JToken Curve(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant:
                    return Constant(c.constant);
                case ParticleSystemCurveMode.TwoConstants:
                    return Interval(c.constantMin, c.constantMax);
                case ParticleSystemCurveMode.Curve:
                    return Bezier(c.curve, c.curveMultiplier);
                case ParticleSystemCurveMode.TwoCurves:
                    return RandomBetweenCurves(
                        Bezier(c.curveMin, c.curveMultiplier),
                        Bezier(c.curveMax, c.curveMultiplier));
                default:
                    return Constant(c.constant);
            }
        }

        /// <summary>Unity TwoCurves → quarks RandomBetweenCurves (stable per-particle lerp).</summary>
        public static JToken RandomBetweenCurves(JToken a, JToken b) =>
            new JObject().Set("type", "RandomBetweenCurves").Set("a", a).Set("b", b);

        /// <summary>AnimationCurve (0..1 time domain) → PiecewiseBezier via Hermite→Bézier per segment.</summary>
        public static JToken Bezier(AnimationCurve curve, float multiplier)
        {
            var functions = new JArray();
            Keyframe[] keys = curve != null ? curve.keys : null;

            if (keys == null || keys.Length == 0)
            {
                functions.Add(BezierPiece(0, 0, 0, 0, 0));
            }
            else if (keys.Length == 1)
            {
                float v = keys[0].value * multiplier;
                functions.Add(BezierPiece(v, v, v, v, 0));
            }
            else
            {
                for (int i = 0; i < keys.Length - 1; i++)
                {
                    Keyframe k0 = keys[i];
                    Keyframe k1 = keys[i + 1];
                    float dt = k1.time - k0.time;
                    if (dt <= 0f) continue;

                    float p0 = k0.value * multiplier;
                    float p3 = k1.value * multiplier;
                    float outT = Finite(k0.outTangent);
                    float inT = Finite(k1.inTangent);
                    float p1 = (k0.value + outT * dt / 3f) * multiplier;
                    float p2 = (k1.value - inT * dt / 3f) * multiplier;
                    functions.Add(BezierPiece(p0, p1, p2, p3, k0.time));
                }
                if (functions.Items.Count == 0)
                {
                    float v = keys[0].value * multiplier;
                    functions.Add(BezierPiece(v, v, v, v, 0));
                }
            }

            return new JObject().Set("type", "PiecewiseBezier").Set("functions", functions);
        }

        private static JToken BezierPiece(float p0, float p1, float p2, float p3, float start)
        {
            var fn = new JObject().Set("p0", p0).Set("p1", p1).Set("p2", p2).Set("p3", p3);
            return new JObject().Set("function", fn).Set("start", start);
        }

        private static float Finite(float v) => (float.IsNaN(v) || float.IsInfinity(v)) ? 0f : v;

        // ---- colors ------------------------------------------------------------------------

        public static JToken Color(Color c) =>
            new JObject().Set("r", c.r).Set("g", c.g).Set("b", c.b).Set("a", c.a);

        public static JToken ConstantColor(Color c) =>
            new JObject().Set("type", "ConstantColor").Set("color", Color(c));

        /// <summary>Unity MinMaxGradient → a quarks color generator.</summary>
        public static JToken StartColor(ParticleSystem.MinMaxGradient g)
        {
            switch (g.mode)
            {
                case ParticleSystemGradientMode.Color:
                    return ConstantColor(g.color);
                case ParticleSystemGradientMode.TwoColors:
                    return new JObject().Set("type", "RandomColor").Set("a", Color(g.colorMin)).Set("b", Color(g.colorMax));
                case ParticleSystemGradientMode.Gradient:
                    return Gradient(g.gradient);
                case ParticleSystemGradientMode.TwoGradients:
                    return new JObject()
                        .Set("type", "RandomColorBetweenGradient")
                        .Set("gradient1", Gradient(g.gradientMin))
                        .Set("gradient2", Gradient(g.gradientMax));
                case ParticleSystemGradientMode.RandomColor:
                    return Gradient(g.gradient);
                default:
                    return ConstantColor(g.color);
            }
        }

        /// <summary>
        /// Like StartColor but always yields a quarks Gradient — used by Color-over-Lifetime,
        /// whose quarks behavior (ColorOverLife) takes a gradient. Constant/two-color Unity modes
        /// are widened into flat gradients.
        /// </summary>
        public static JToken StartColorGradient(ParticleSystem.MinMaxGradient g)
        {
            switch (g.mode)
            {
                case ParticleSystemGradientMode.Gradient:
                case ParticleSystemGradientMode.RandomColor:
                    return Gradient(g.gradient);
                case ParticleSystemGradientMode.TwoGradients:
                    return new JObject()
                        .Set("type", "RandomColorBetweenGradient")
                        .Set("gradient1", Gradient(g.gradientMin))
                        .Set("gradient2", Gradient(g.gradientMax));
                case ParticleSystemGradientMode.TwoColors:
                    return GradientFromColors(g.colorMin, g.colorMax);
                default:
                    return GradientFromColors(g.color, g.color);
            }
        }

        private static JToken GradientFromColors(Color a, Color b)
        {
            var range = new JObject().Set("type", "ColorRange").Set("a", Color(a)).Set("b", Color(b));
            var functions = new JArray().Add(new JObject().Set("function", range).Set("start", 0));
            return new JObject().Set("type", "Gradient").Set("functions", functions);
        }

        /// <summary>
        /// Unity Gradient → the quarks Gradient "functions" (ColorRange pieces) form, which
        /// Gradient.fromJSON accepts. Color and alpha keys are unified by sampling Evaluate() at
        /// every key time (Evaluate returns interpolated RGBA), so both channels round-trip.
        /// </summary>
        public static JToken Gradient(Gradient g)
        {
            var times = new SortedSet<float> { 0f, 1f };
            if (g != null)
            {
                foreach (var k in g.colorKeys) times.Add(Mathf.Clamp01(k.time));
                foreach (var k in g.alphaKeys) times.Add(Mathf.Clamp01(k.time));
            }
            var timeList = new List<float>(times);

            var stops = new List<Color>();
            foreach (float t in timeList)
            {
                stops.Add(g != null ? g.Evaluate(t) : UnityEngine.Color.white);
            }
            if (stops.Count == 1)
            {
                stops.Add(stops[0]);
                timeList.Add(1f);
            }

            var functions = new JArray();
            for (int i = 0; i < stops.Count - 1; i++)
            {
                var range = new JObject().Set("type", "ColorRange").Set("a", Color(stops[i])).Set("b", Color(stops[i + 1]));
                functions.Add(new JObject().Set("function", range).Set("start", timeList[i]));
            }
            return new JObject().Set("type", "Gradient").Set("functions", functions);
        }
    }
}
