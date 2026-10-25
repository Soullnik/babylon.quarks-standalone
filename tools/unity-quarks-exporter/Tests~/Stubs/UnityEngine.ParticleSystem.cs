// The Shuriken API the exporter reads. Unity's modules are structs that write through to the
// system; here they are classes, which reads the same and lets fixtures set them directly.
// Program.CheckModuleUse fails the Editor scripts on what a class allows and a struct does not.
using System;

namespace UnityEngine
{
    public enum ParticleSystemCurveMode { Constant = 0, Curve = 1, TwoCurves = 2, TwoConstants = 3 }
    public enum ParticleSystemGradientMode { Color = 0, Gradient = 1, TwoColors = 2, TwoGradients = 3, RandomColor = 4 }
    public enum ParticleSystemSimulationSpace { Local = 0, World = 1, Custom = 2 }
    public enum ParticleSystemScalingMode { Hierarchy = 0, Local = 1, Shape = 2 }
    public enum ParticleSystemCullingMode { Automatic = 0, PauseAndCatchup = 1, Pause = 2, AlwaysSimulate = 3 }
    public enum ParticleSystemSortMode { None = 0, Distance = 1, OldestInFront = 2, YoungestInFront = 3, Depth = 4 }
    public enum ParticleSystemRenderMode { Billboard = 0, Stretch = 1, HorizontalBillboard = 2, VerticalBillboard = 3, Mesh = 4, None = 5 }
    public enum ParticleSystemRenderSpace { View = 0, World = 1, Local = 2, Facing = 3, Velocity = 4 }

    public enum ParticleSystemShapeType
    {
        Sphere = 0, SphereShell = 1, Hemisphere = 2, HemisphereShell = 3, Cone = 4, Box = 5, Mesh = 6,
        ConeShell = 7, ConeVolume = 8, ConeVolumeShell = 9, Circle = 10, CircleEdge = 11,
        SingleSidedEdge = 12, MeshRenderer = 13, SkinnedMeshRenderer = 14, BoxShell = 15, BoxEdge = 16,
        Donut = 17, Rectangle = 18, Sprite = 19, SpriteRenderer = 20,
    }

    public enum ParticleSystemShapeMultiModeValue { Random = 0, Loop = 1, PingPong = 2, BurstSpread = 3 }
    public enum ParticleSystemMeshShapeType { Vertex = 0, Edge = 1, Triangle = 2 }
    public enum ParticleSystemTrailMode { PerParticle = 0, Ribbon = 1 }
    public enum ParticleSystemTrailTextureMode { Stretch = 0, Tile = 1, DistributePerSegment = 2, RepeatPerSegment = 3, Static = 4 }
    public enum ParticleSystemInheritVelocityMode { Initial = 0, Current = 1 }
    public enum ParticleSystemSubEmitterType { Birth = 0, Collision = 1, Death = 2, Trigger = 3, Manual = 4 }

    [Flags]
    public enum ParticleSystemSubEmitterProperties
    {
        InheritNothing = 0, InheritColor = 1, InheritSize = 2, InheritRotation = 4, InheritLifetime = 8,
        InheritDuration = 16, InheritEverything = 31,
    }

    public class ParticleSystemRenderer : Component
    {
        public ParticleSystemRenderMode renderMode { get; set; } = ParticleSystemRenderMode.Billboard;
        public Material sharedMaterial { get; set; }
        public Material trailMaterial { get; set; }
        public Mesh mesh { get; set; }
        public int sortingOrder { get; set; }
        public ParticleSystemSortMode sortMode { get; set; }
        public float velocityScale { get; set; }
        public float lengthScale { get; set; } = 2f;
        public float minParticleSize { get; set; }
        public float maxParticleSize { get; set; } = 0.5f;
        public Vector3 pivot { get; set; }
        public Vector3 flip { get; set; }
        public ParticleSystemRenderSpace alignment { get; set; }
    }

    public class ParticleSystem : Component
    {
        public struct MinMaxCurve
        {
            public ParticleSystemCurveMode mode { get; set; }
            public float constant { get; set; }
            public float constantMin { get; set; }
            public float constantMax { get; set; }
            public AnimationCurve curve { get; set; }
            public AnimationCurve curveMin { get; set; }
            public AnimationCurve curveMax { get; set; }
            public float curveMultiplier { get; set; }

            public MinMaxCurve(float constant) : this()
            {
                mode = ParticleSystemCurveMode.Constant;
                this.constant = constant;
                constantMax = constant;
            }

            public MinMaxCurve(float min, float max) : this()
            {
                mode = ParticleSystemCurveMode.TwoConstants;
                constantMin = min;
                constantMax = max;
            }

            public MinMaxCurve(float multiplier, AnimationCurve curve) : this()
            {
                mode = ParticleSystemCurveMode.Curve;
                curveMultiplier = multiplier;
                this.curve = curve;
                curveMax = curve;
            }

            public MinMaxCurve(float multiplier, AnimationCurve min, AnimationCurve max) : this()
            {
                mode = ParticleSystemCurveMode.TwoCurves;
                curveMultiplier = multiplier;
                curveMin = min;
                curveMax = max;
            }

            public float Evaluate(float time) => Evaluate(time, 1f);

            public float Evaluate(float time, float lerpFactor)
            {
                switch (mode)
                {
                    case ParticleSystemCurveMode.TwoConstants: return Mathf.Lerp(constantMin, constantMax, lerpFactor);
                    case ParticleSystemCurveMode.Curve: return curve.Evaluate(time) * curveMultiplier;
                    case ParticleSystemCurveMode.TwoCurves:
                        return Mathf.Lerp(curveMin.Evaluate(time), curveMax.Evaluate(time), lerpFactor) * curveMultiplier;
                    default: return constant;
                }
            }

            public static implicit operator MinMaxCurve(float constant) => new MinMaxCurve(constant);
        }

        public struct MinMaxGradient
        {
            public ParticleSystemGradientMode mode { get; set; }
            public Color color { get; set; }
            public Color colorMin { get; set; }
            public Color colorMax { get; set; }
            public Gradient gradient { get; set; }
            public Gradient gradientMin { get; set; }
            public Gradient gradientMax { get; set; }

            public MinMaxGradient(Color color) : this()
            {
                mode = ParticleSystemGradientMode.Color;
                this.color = color;
                colorMax = color;
            }

            public MinMaxGradient(Color min, Color max) : this()
            {
                mode = ParticleSystemGradientMode.TwoColors;
                colorMin = min;
                colorMax = max;
            }

            public MinMaxGradient(Gradient gradient) : this()
            {
                mode = ParticleSystemGradientMode.Gradient;
                this.gradient = gradient;
                gradientMax = gradient;
            }

            public MinMaxGradient(Gradient min, Gradient max) : this()
            {
                mode = ParticleSystemGradientMode.TwoGradients;
                gradientMin = min;
                gradientMax = max;
            }

            public Color Evaluate(float time) => Evaluate(time, 1f);

            public Color Evaluate(float time, float lerpFactor)
            {
                switch (mode)
                {
                    case ParticleSystemGradientMode.TwoColors: return Color.Lerp(colorMin, colorMax, lerpFactor);
                    case ParticleSystemGradientMode.Gradient: return gradient.Evaluate(time);
                    case ParticleSystemGradientMode.TwoGradients:
                        return Color.Lerp(gradientMin.Evaluate(time), gradientMax.Evaluate(time), lerpFactor);
                    case ParticleSystemGradientMode.RandomColor: return gradient.Evaluate(lerpFactor);
                    default: return color;
                }
            }

            public static implicit operator MinMaxGradient(Color color) => new MinMaxGradient(color);
            public static implicit operator MinMaxGradient(Gradient gradient) => new MinMaxGradient(gradient);
        }

        public struct Burst
        {
            public float time { get; set; }
            public MinMaxCurve count { get; set; }
            public int cycleCount { get; set; }
            public float repeatInterval { get; set; }
            public float probability { get; set; }

            public Burst(float time, MinMaxCurve count) : this()
            {
                this.time = time;
                this.count = count;
                cycleCount = 1;
                repeatInterval = 0.01f;
                probability = 1f;
            }
        }

        public class MainModule
        {
            public float duration { get; set; } = 5f;
            public bool loop { get; set; } = true;
            public bool prewarm { get; set; }
            public MinMaxCurve startDelay { get; set; } = 0f;
            public MinMaxCurve startLifetime { get; set; } = 5f;
            public MinMaxCurve startSpeed { get; set; } = 5f;
            public bool startSize3D { get; set; }
            public MinMaxCurve startSize { get; set; } = 1f;
            public MinMaxCurve startSizeX { get; set; } = 1f;
            public MinMaxCurve startSizeY { get; set; } = 1f;
            public MinMaxCurve startSizeZ { get; set; } = 1f;
            public bool startRotation3D { get; set; }
            public MinMaxCurve startRotation { get; set; } = 0f;
            public MinMaxCurve startRotationX { get; set; } = 0f;
            public MinMaxCurve startRotationY { get; set; } = 0f;
            public MinMaxCurve startRotationZ { get; set; } = 0f;
            public MinMaxGradient startColor { get; set; } = Color.white;
            public MinMaxCurve gravityModifier { get; set; } = 0f;
            public ParticleSystemSimulationSpace simulationSpace { get; set; }
            public float simulationSpeed { get; set; } = 1f;
            public ParticleSystemScalingMode scalingMode { get; set; } = ParticleSystemScalingMode.Local;
            public int maxParticles { get; set; } = 1000;
            public ParticleSystemCullingMode cullingMode { get; set; }
        }

        public class EmissionModule
        {
            private Burst[] _bursts = new Burst[0];
            public bool enabled { get; set; } = true;
            public MinMaxCurve rateOverTime { get; set; } = 10f;
            public MinMaxCurve rateOverDistance { get; set; } = 0f;
            public int burstCount => _bursts.Length;
            public void SetBursts(Burst[] bursts) => _bursts = bursts;
            public int GetBursts(Burst[] bursts)
            {
                Array.Copy(_bursts, bursts, Math.Min(bursts.Length, _bursts.Length));
                return _bursts.Length;
            }
        }

        public class ShapeModule
        {
            public bool enabled { get; set; } = true;
            public ParticleSystemShapeType shapeType { get; set; } = ParticleSystemShapeType.Cone;
            public float radius { get; set; } = 1f;
            public float radiusThickness { get; set; } = 1f;
            public float angle { get; set; } = 25f;
            public float length { get; set; } = 5f;
            public float arc { get; set; } = 360f;
            public ParticleSystemShapeMultiModeValue arcMode { get; set; }
            public float arcSpread { get; set; }
            public MinMaxCurve arcSpeed { get; set; } = 1f;
            public ParticleSystemShapeMultiModeValue radiusMode { get; set; }
            public float radiusSpread { get; set; }
            public MinMaxCurve radiusSpeed { get; set; } = 1f;
            public float donutRadius { get; set; } = 0.2f;
            public Vector3 boxThickness { get; set; }
            public Mesh mesh { get; set; }
            public ParticleSystemMeshShapeType meshShapeType { get; set; } = ParticleSystemMeshShapeType.Triangle;
            public Vector3 position { get; set; }
            public Vector3 rotation { get; set; }
            public Vector3 scale { get; set; } = Vector3.one;
            public bool alignToDirection { get; set; }
            public float randomDirectionAmount { get; set; }
        }

        public class ColorOverLifetimeModule
        {
            public bool enabled { get; set; }
            public MinMaxGradient color { get; set; } = Color.white;
        }

        public class SizeOverLifetimeModule
        {
            public bool enabled { get; set; }
            public bool separateAxes { get; set; }
            public MinMaxCurve size { get; set; } = 1f;
            public MinMaxCurve x { get; set; } = 1f;
            public MinMaxCurve y { get; set; } = 1f;
            public MinMaxCurve z { get; set; } = 1f;
        }

        public class RotationOverLifetimeModule
        {
            public bool enabled { get; set; }
            public bool separateAxes { get; set; }
            public MinMaxCurve x { get; set; } = 0f;
            public MinMaxCurve y { get; set; } = 0f;
            public MinMaxCurve z { get; set; } = 0f;
        }

        public class VelocityOverLifetimeModule
        {
            public bool enabled { get; set; }
            public MinMaxCurve x { get; set; } = 0f;
            public MinMaxCurve y { get; set; } = 0f;
            public MinMaxCurve z { get; set; } = 0f;
            public MinMaxCurve orbitalX { get; set; } = 0f;
            public MinMaxCurve orbitalY { get; set; } = 0f;
            public MinMaxCurve orbitalZ { get; set; } = 0f;
            public MinMaxCurve orbitalOffsetX { get; set; } = 0f;
            public MinMaxCurve orbitalOffsetY { get; set; } = 0f;
            public MinMaxCurve orbitalOffsetZ { get; set; } = 0f;
            public MinMaxCurve radial { get; set; } = 0f;
            public ParticleSystemSimulationSpace space { get; set; }
        }

        public class LimitVelocityOverLifetimeModule
        {
            public bool enabled { get; set; }
            public bool separateAxes { get; set; }
            public MinMaxCurve limit { get; set; } = 1f;
            public MinMaxCurve limitX { get; set; } = 1f;
            public MinMaxCurve limitY { get; set; } = 1f;
            public MinMaxCurve limitZ { get; set; } = 1f;
            public ParticleSystemSimulationSpace space { get; set; } = ParticleSystemSimulationSpace.Local;
            public float dampen { get; set; } = 1f;
        }

        public class InheritVelocityModule
        {
            public bool enabled { get; set; }
            public ParticleSystemInheritVelocityMode mode { get; set; }
            public MinMaxCurve curve { get; set; } = 0f;
        }

        public class ForceOverLifetimeModule
        {
            public bool enabled { get; set; }
            public MinMaxCurve x { get; set; } = 0f;
            public MinMaxCurve y { get; set; } = 0f;
            public MinMaxCurve z { get; set; } = 0f;
        }

        public class ColorBySpeedModule
        {
            public bool enabled { get; set; }
            public MinMaxGradient color { get; set; } = Color.white;
            public Vector2 range { get; set; } = new Vector2(0, 1);
        }

        public class SizeBySpeedModule
        {
            public bool enabled { get; set; }
            public bool separateAxes { get; set; }
            public MinMaxCurve size { get; set; } = 1f;
            public MinMaxCurve x { get; set; } = 1f;
            public MinMaxCurve y { get; set; } = 1f;
            public MinMaxCurve z { get; set; } = 1f;
            public Vector2 range { get; set; } = new Vector2(0, 1);
        }

        public class RotationBySpeedModule
        {
            public bool enabled { get; set; }
            public bool separateAxes { get; set; }
            public MinMaxCurve x { get; set; } = 0f;
            public MinMaxCurve y { get; set; } = 0f;
            public MinMaxCurve z { get; set; } = 0f;
            public Vector2 range { get; set; } = new Vector2(0, 1);
        }

        public class NoiseModule
        {
            public bool enabled { get; set; }
            public MinMaxCurve strength { get; set; } = 1f;
            public float frequency { get; set; } = 0.5f;
            public MinMaxCurve scrollSpeed { get; set; } = 0f;
            public bool remapEnabled { get; set; }
            public MinMaxCurve remap { get; set; } = 0f;
        }

        public class CollisionModule
        {
            public bool enabled { get; set; }
            public MinMaxCurve bounce { get; set; } = 1f;
        }

        public class SubEmittersModule
        {
            private readonly System.Collections.Generic.List<(ParticleSystem system, ParticleSystemSubEmitterType type, ParticleSystemSubEmitterProperties properties, float probability)> _subs =
                new System.Collections.Generic.List<(ParticleSystem, ParticleSystemSubEmitterType, ParticleSystemSubEmitterProperties, float)>();

            public bool enabled { get; set; }
            public int subEmittersCount => _subs.Count;

            public void AddSubEmitter(ParticleSystem subEmitter, ParticleSystemSubEmitterType type, ParticleSystemSubEmitterProperties properties, float emitProbability) =>
                _subs.Add((subEmitter, type, properties, emitProbability));

            public ParticleSystem GetSubEmitterSystem(int index) => _subs[index].system;
            public ParticleSystemSubEmitterType GetSubEmitterType(int index) => _subs[index].type;
            public ParticleSystemSubEmitterProperties GetSubEmitterProperties(int index) => _subs[index].properties;
            public float GetSubEmitterEmitProbability(int index) => _subs[index].probability;
        }

        public class TextureSheetAnimationModule
        {
            public bool enabled { get; set; }
            public int numTilesX { get; set; } = 1;
            public int numTilesY { get; set; } = 1;
            public MinMaxCurve startFrame { get; set; } = 0f;
            public MinMaxCurve frameOverTime { get; set; } = new MinMaxCurve(1f, AnimationCurve.Linear(0, 0, 1, 1));
            public int cycleCount { get; set; } = 1;
        }

        public class TrailModule
        {
            public bool enabled { get; set; }
            public ParticleSystemTrailMode mode { get; set; }
            public MinMaxCurve ratio { get; set; } = 1f;
            public MinMaxCurve lifetime { get; set; } = 1f;
            public bool dieWithParticles { get; set; } = true;
            public ParticleSystemTrailTextureMode textureMode { get; set; }
            public bool sizeAffectsWidth { get; set; } = true;
            public bool sizeAffectsLifetime { get; set; }
            public bool inheritParticleColor { get; set; } = true;
            public MinMaxGradient colorOverLifetime { get; set; } = Color.white;
            public MinMaxCurve widthOverTrail { get; set; } = 1f;
            public MinMaxGradient colorOverTrail { get; set; } = Color.white;
            public bool worldSpace { get; set; }
        }

        public MainModule main { get; } = new MainModule();
        public EmissionModule emission { get; } = new EmissionModule();
        public ShapeModule shape { get; } = new ShapeModule();
        public ColorOverLifetimeModule colorOverLifetime { get; } = new ColorOverLifetimeModule();
        public SizeOverLifetimeModule sizeOverLifetime { get; } = new SizeOverLifetimeModule();
        public RotationOverLifetimeModule rotationOverLifetime { get; } = new RotationOverLifetimeModule();
        public VelocityOverLifetimeModule velocityOverLifetime { get; } = new VelocityOverLifetimeModule();
        public LimitVelocityOverLifetimeModule limitVelocityOverLifetime { get; } = new LimitVelocityOverLifetimeModule();
        public InheritVelocityModule inheritVelocity { get; } = new InheritVelocityModule();
        public ForceOverLifetimeModule forceOverLifetime { get; } = new ForceOverLifetimeModule();
        public ColorBySpeedModule colorBySpeed { get; } = new ColorBySpeedModule();
        public SizeBySpeedModule sizeBySpeed { get; } = new SizeBySpeedModule();
        public RotationBySpeedModule rotationBySpeed { get; } = new RotationBySpeedModule();
        public NoiseModule noise { get; } = new NoiseModule();
        public CollisionModule collision { get; } = new CollisionModule();
        public SubEmittersModule subEmitters { get; } = new SubEmittersModule();
        public TextureSheetAnimationModule textureSheetAnimation { get; } = new TextureSheetAnimationModule();
        public TrailModule trails { get; } = new TrailModule();
        public bool useAutoRandomSeed { get; set; } = true;
        public uint randomSeed { get; set; }
    }
}
