using UnityEngine;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>
    /// Maps a Unity Trail Renderer onto a quarks trail system: one particle that never moves away
    /// from the emitter and lives as long as the effect, recording the emitter's path in world space,
    /// so its ribbon is the line the Trail Renderer lays behind its moving transform. Time, Min
    /// Vertex Distance, the width curve and the color gradient along the trail carry over.
    /// </summary>
    public static class TrailRendererConverter
    {
        /// <summary>quarks steps its simulation at 60Hz and records one trail sample per step.</summary>
        private const float SamplesPerSecond = 60f;

        /// <summary>A lifetime no recording outlasts: the trail's particle lives as long as the effect.</summary>
        private const float Forever = 100000f;

        public static JObject BuildPs(TrailRenderer trail, ExportContext ctx)
        {
            string who = $"[Quarks Exporter] '{trail.name}':";
            ParticleMaterial material = ctx.AddMaterialForTrail(trail);
            float time = Mathf.Max(trail.time, 0f);
            float headWidth = trail.widthCurve.Evaluate(0f) * trail.widthMultiplier;

            var settings = new JObject()
                .Set("startLength", ValueConverter.Constant(Mathf.Max(2f, Mathf.Ceil(time * SamplesPerSecond) + 1f)))
                .Set("followLocalOrigin", false)
                // Unity runs the texture from the head (U = 0) back to the tail.
                .Set("uvFromHead", true)
                .Set("colorFromParticle", false)
                // The particle rides on the emitter; its points stay where they were laid.
                .Set("recordWorldSpace", true)
                .Set("lifetime", time);
            if (trail.minVertexDistance > 0f) settings.Set("minVertexDistance", trail.minVertexDistance);
            switch (trail.textureMode)
            {
                case LineTextureMode.Stretch:
                    break;
                case LineTextureMode.Tile:
                    settings.Set("textureMode", "tile");
                    break;
                case LineTextureMode.DistributePerSegment:
                    settings.Set("textureMode", "distributePerSegment");
                    break;
                case LineTextureMode.RepeatPerSegment:
                    settings.Set("textureMode", "repeatPerSegment");
                    break;
                default:
                    Debug.LogWarning($"{who} Trail Renderer Texture Mode {trail.textureMode} is exported as Stretch.");
                    break;
            }
            if (trail.alignment != LineAlignment.View)
                Debug.LogWarning($"{who} Trail Renderer Alignment {trail.alignment} is exported as View (facing the camera).");

            var behaviors = new JArray()
                // The width curve and multiplier are world units along the trail, head (0) to tail (1).
                .Add(new JObject()
                    .Set("type", "WidthOverLength")
                    .Set("width", ValueConverter.Bezier(trail.widthCurve, trail.widthMultiplier))
                    .Set("absolute", true))
                .Add(new JObject()
                    .Set("type", "ColorOverLength")
                    .Set("color", ValueConverter.Gradient(trail.colorGradient)));

            var ps = new JObject()
                .Set("looping", false)
                .Set("prewarm", false)
                .Set("duration", 1f)
                .Set("startDelay", ValueConverter.Constant(0f))
                .Set("shape", new JObject().Set("type", "point"))
                .Set("startLife", ValueConverter.Constant(Forever))
                .Set("startSpeed", ValueConverter.Constant(0f))
                .Set("startRotation", ValueConverter.Constant(0f))
                .Set("startSize", ValueConverter.Constant(headWidth))
                .Set("startColor", ValueConverter.ConstantColor(Color.white))
                .Set("emissionOverTime", ValueConverter.Constant(0f))
                .Set("emissionOverDistance", ValueConverter.Constant(0f))
                .Set("emissionBursts", new JArray().Add(new JObject()
                    .Set("time", 0f)
                    .Set("count", ValueConverter.Constant(1f))
                    .Set("probability", 1f)
                    .Set("interval", 0.01f)
                    .Set("cycle", 1)))
                .Set("maxParticles", 1)
                .Set("onlyUsedByOther", false)
                .Set("renderMode", 3)
                .Set("renderOrder", trail.sortingOrder)
                .Set("rendererEmitterSettings", settings)
                .Set("material", material.Uuid)
                .Set("layers", 1)
                .Set("worldSpace", false)
                // A Trail Renderer's width is in world units, whatever its transform's scale (one at
                // scale 0 still draws): the transform only places the head.
                .Set("scalingMode", "shape")
                .Set("behaviors", behaviors);
            // The legacy Alpha Blended Premultiply's texture is premultiplied, glow and all.
            if (material.PremultipliedTexture) ps.Set("premultipliedMap", true);
            // Unity's mesh shaders draw a trail without its colour.
            if (!material.ParticleColor) ps.Set("particleColor", false);
            // The material's tint multiplies the whole trail, as it does a particle system's.
            ParticleConverter.AddMaterialColor(ps, material);
            return ps;
        }
    }
}
