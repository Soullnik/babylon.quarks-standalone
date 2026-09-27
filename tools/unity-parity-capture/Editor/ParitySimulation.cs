using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>
    /// Deterministic simulation of one effect instance: fixed random seeds, and every sample
    /// simulated from a restart with a fixed time step, so the same time always gives the same
    /// particles — for the CSV, the snapshots and the rendered frames alike.
    /// </summary>
    internal sealed class ParitySimulation
    {
        private readonly List<ParticleSystem> _systems = new List<ParticleSystem>();
        private readonly List<ParticleSystem> _roots = new List<ParticleSystem>();
        private readonly Dictionary<ParticleSystem, ParticleSystem.Particle[]> _buffers =
            new Dictionary<ParticleSystem, ParticleSystem.Particle[]>();
        private readonly Transform _root;
        public readonly float Duration;
        public readonly uint Seed;

        public ParitySimulation(GameObject instance, uint seed)
        {
            _root = instance.transform;
            Seed = seed;
            _systems.AddRange(instance.GetComponentsInChildren<ParticleSystem>(true));
            for (int i = 0; i < _systems.Count; i++)
            {
                ParticleSystem ps = _systems[i];
                ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
                ps.useAutoRandomSeed = false;
                ps.randomSeed = seed + (uint)i;
                _buffers[ps] = new ParticleSystem.Particle[Math.Max(1, ps.main.maxParticles)];
                if (ps.transform.parent == null || ps.transform.parent.GetComponentInParent<ParticleSystem>() == null)
                {
                    _roots.Add(ps);
                }
            }
            Duration = ChooseDuration();
        }

        public int SystemCount => _systems.Count;

        /// <summary>
        /// Long enough to reach the steady look: delay + one duration + the longest lifetime,
        /// with some margin, clamped to 1–8 s.
        /// </summary>
        private float ChooseDuration()
        {
            float longest = 0f;
            foreach (ParticleSystem ps in _systems)
            {
                ParticleSystem.MainModule main = ps.main;
                float t = Upper(main.startDelay) + main.duration + Upper(main.startLifetime);
                longest = Math.Max(longest, t);
            }
            return Mathf.Clamp(longest * 1.1f, 1f, 8f);
        }

        /// <summary>Upper bound of a MinMaxCurve in whatever mode it is.</summary>
        public static float Upper(ParticleSystem.MinMaxCurve c)
        {
            switch (c.mode)
            {
                case ParticleSystemCurveMode.Constant: return c.constant;
                case ParticleSystemCurveMode.TwoConstants: return Math.Max(c.constantMin, c.constantMax);
                default: return c.curveMultiplier;
            }
        }

        public void SimulateTo(float time)
        {
            foreach (ParticleSystem ps in _roots)
            {
                ps.Simulate(time, true, true, true);
            }
        }

        public JMap Describe()
        {
            var list = new List<object>();
            for (int i = 0; i < _systems.Count; i++)
            {
                ParticleSystem ps = _systems[i];
                ParticleSystem.MainModule main = ps.main;
                list.Add(new JMap()
                    .Set("index", i)
                    .Set("path", PathOf(ps.transform))
                    .Set("siblingPath", SiblingPath(ps.transform))
                    .Set("isRoot", _roots.Contains(ps))
                    .Set("randomSeed", ps.randomSeed)
                    .Set("duration", main.duration)
                    .Set("looping", main.loop)
                    .Set("prewarm", main.prewarm)
                    .Set("simulationSpace", main.simulationSpace.ToString())
                    .Set("scalingMode", main.scalingMode.ToString())
                    .Set("maxParticles", main.maxParticles)
                    .Set("localToWorld", ps.transform.localToWorldMatrix));
            }
            return new JMap()
                .Set("seedBase", Seed)
                .Set("fixedDeltaTime", Time.fixedDeltaTime)
                .Set("sampleDuration", Duration)
                .Set("method", "ParticleSystem.Simulate(t, withChildren: true, restart: true, fixedTimeStep: true) on every root system, per sample")
                .Set("systems", list);
        }

        public static readonly string[] CsvColumns =
        {
            "time", "system", "count",
            "meanX", "meanY", "meanZ", "minX", "minY", "minZ", "maxX", "maxY", "maxZ",
            "meanSizeX", "meanSizeY", "meanSizeZ", "maxSize",
            "meanR", "meanG", "meanB", "meanA", "maxR", "maxG", "maxB",
            "meanSpeed", "maxSpeed", "meanAge01", "meanRotZ",
        };

        /// <summary>Samples the whole timeline into per-system aggregate rows and returns the union bounds.</summary>
        public Bounds WriteCsv(string path, float rate, Action<float> progress)
        {
            var sb = new StringBuilder();
            sb.AppendLine(string.Join(",", CsvColumns));
            var bounds = new Bounds(_root.position, Vector3.zero);
            bool any = false;
            int samples = Mathf.CeilToInt(Duration * rate);
            for (int s = 0; s <= samples; s++)
            {
                float t = s / rate;
                progress?.Invoke((float)s / samples);
                SimulateTo(t);
                for (int i = 0; i < _systems.Count; i++)
                {
                    Aggregate a = AggregateOf(_systems[i]);
                    if (a.Count > 0)
                    {
                        Vector3 pad = Vector3.one * a.MaxSize * 0.5f;
                        if (!any) bounds = new Bounds(a.Min, Vector3.zero);
                        bounds.Encapsulate(a.Min - pad);
                        bounds.Encapsulate(a.Max + pad);
                        any = true;
                    }
                    sb.AppendLine(a.Row(t, i));
                }
            }
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
            return bounds;
        }

        /// <summary>Every particle of every system at the given time (capped per system).</summary>
        public JMap Snapshot(float time, int capPerSystem)
        {
            SimulateTo(time);
            var systems = new List<object>();
            for (int i = 0; i < _systems.Count; i++)
            {
                ParticleSystem ps = _systems[i];
                ParticleSystem.Particle[] buf = _buffers[ps];
                int n = ps.GetParticles(buf);
                int kept = Math.Min(n, capPerSystem);
                var pos = new float[kept * 3];
                var size = new float[kept * 3];
                var color = new float[kept * 4];
                var vel = new float[kept * 3];
                var rot = new float[kept * 3];
                var age = new float[kept];
                var life = new float[kept];
                var seed = new double[kept];
                for (int k = 0; k < kept; k++)
                {
                    ParticleSystem.Particle p = buf[k];
                    Vector3 w = ToWorld(ps, p.position);
                    Vector3 s3 = p.GetCurrentSize3D(ps);
                    Color32 c = p.GetCurrentColor(ps);
                    Vector3 v = p.totalVelocity;
                    Vector3 r = p.rotation3D;
                    pos[k * 3] = w.x; pos[k * 3 + 1] = w.y; pos[k * 3 + 2] = w.z;
                    size[k * 3] = s3.x; size[k * 3 + 1] = s3.y; size[k * 3 + 2] = s3.z;
                    color[k * 4] = c.r / 255f; color[k * 4 + 1] = c.g / 255f; color[k * 4 + 2] = c.b / 255f; color[k * 4 + 3] = c.a / 255f;
                    vel[k * 3] = v.x; vel[k * 3 + 1] = v.y; vel[k * 3 + 2] = v.z;
                    rot[k * 3] = r.x; rot[k * 3 + 1] = r.y; rot[k * 3 + 2] = r.z;
                    age[k] = p.startLifetime - p.remainingLifetime;
                    life[k] = p.startLifetime;
                    seed[k] = p.randomSeed;
                }
                systems.Add(new JMap()
                    .Set("system", i)
                    .Set("count", n)
                    .Set("kept", kept)
                    .Set("positionWorld", pos)
                    .Set("size3D", size)
                    .Set("colorRGBA", color)
                    .Set("velocityWorldOrLocal", vel)
                    .Set("rotation3DDegrees", rot)
                    .Set("age", age)
                    .Set("lifetime", life)
                    .Set("randomSeed", seed));
            }
            return new JMap().Set("time", time).Set("systems", systems);
        }

        private struct Aggregate
        {
            public int Count;
            public Vector3 Mean, Min, Max, MeanSize;
            public float MaxSize, MeanSpeed, MaxSpeed, MeanAge01, MeanRotZ;
            public Vector4 MeanColor;
            public Vector3 MaxColor;

            public string Row(float t, int system)
            {
                var c = CultureInfo.InvariantCulture;
                Func<float, string> f = v => v.ToString("0.#####", c);
                return string.Join(",", new[]
                {
                    f(t), system.ToString(c), Count.ToString(c),
                    f(Mean.x), f(Mean.y), f(Mean.z), f(Min.x), f(Min.y), f(Min.z), f(Max.x), f(Max.y), f(Max.z),
                    f(MeanSize.x), f(MeanSize.y), f(MeanSize.z), f(MaxSize),
                    f(MeanColor.x), f(MeanColor.y), f(MeanColor.z), f(MeanColor.w), f(MaxColor.x), f(MaxColor.y), f(MaxColor.z),
                    f(MeanSpeed), f(MaxSpeed), f(MeanAge01), f(MeanRotZ),
                });
            }
        }

        private Aggregate AggregateOf(ParticleSystem ps)
        {
            ParticleSystem.Particle[] buf = _buffers[ps];
            int n = ps.GetParticles(buf);
            var a = new Aggregate { Count = n };
            if (n == 0) return a;
            a.Min = Vector3.positiveInfinity;
            a.Max = Vector3.negativeInfinity;
            for (int k = 0; k < n; k++)
            {
                ParticleSystem.Particle p = buf[k];
                Vector3 w = ToWorld(ps, p.position);
                Vector3 s3 = p.GetCurrentSize3D(ps);
                Color32 col = p.GetCurrentColor(ps);
                float speed = p.totalVelocity.magnitude;
                a.Mean += w;
                a.Min = Vector3.Min(a.Min, w);
                a.Max = Vector3.Max(a.Max, w);
                a.MeanSize += s3;
                a.MaxSize = Math.Max(a.MaxSize, Math.Max(s3.x, Math.Max(s3.y, s3.z)));
                a.MeanColor += new Vector4(col.r, col.g, col.b, col.a) / 255f;
                a.MaxColor = Vector3.Max(a.MaxColor, new Vector3(col.r, col.g, col.b) / 255f);
                a.MeanSpeed += speed;
                a.MaxSpeed = Math.Max(a.MaxSpeed, speed);
                a.MeanAge01 += p.startLifetime > 0f ? 1f - p.remainingLifetime / p.startLifetime : 0f;
                a.MeanRotZ += p.rotation;
            }
            a.Mean /= n;
            a.MeanSize /= n;
            a.MeanColor /= n;
            a.MeanSpeed /= n;
            a.MeanAge01 /= n;
            a.MeanRotZ /= n;
            return a;
        }

        private static Vector3 ToWorld(ParticleSystem ps, Vector3 p)
        {
            ParticleSystem.MainModule main = ps.main;
            switch (main.simulationSpace)
            {
                case ParticleSystemSimulationSpace.World: return p;
                case ParticleSystemSimulationSpace.Custom:
                    return main.customSimulationSpace != null ? main.customSimulationSpace.TransformPoint(p) : p;
                default: return ps.transform.TransformPoint(p);
            }
        }

        /// <summary>Hierarchy path of names — a label for people, not an identity.</summary>
        private string PathOf(Transform t)
        {
            var parts = new List<string>();
            for (Transform c = t; c != null; c = c.parent)
            {
                parts.Insert(0, c.name);
                if (c == _root) break;
            }
            return string.Join("/", parts);
        }

        /// <summary>Hierarchy path of sibling indices — the identity, stable whatever the names.</summary>
        private string SiblingPath(Transform t)
        {
            var parts = new List<string>();
            for (Transform c = t; c != null && c != _root; c = c.parent)
            {
                parts.Insert(0, c.GetSiblingIndex().ToString(CultureInfo.InvariantCulture));
            }
            return parts.Count == 0 ? "" : string.Join("/", parts);
        }
    }
}
