using UnityEngine;
using UnityEngine.Rendering;

namespace BabylonQuarks.UnityExporter
{
    /// <summary>What a particle system's own settings take from its material.</summary>
    public class ParticleMaterial
    {
        /// <summary>The material's uuid in the envelope, once written.</summary>
        public string Uuid;

        /// <summary>The Babylon alpha mode (<c>Constants.ALPHA_*</c>) the material blends with.</summary>
        public int Blending = MaterialReader.AlphaCombine;

        /// <summary>False for an opaque surface: it writes depth and does not blend.</summary>
        public bool Transparent = true;

        /// <summary>Whether the particles write depth (Unity's ZWrite).</summary>
        public bool DepthWrite;

        /// <summary>Alpha Clipping's threshold; 0 when the material does not clip.</summary>
        public float AlphaTest;

        /// <summary>The color the shader multiplies every particle by.</summary>
        public Color Tint = Color.white;

        /// <summary>Unity's Render Face (the material's <c>_Cull</c>) as babylon.quarks' renderFace.</summary>
        public string RenderFace = "both";

        /// <summary>Whether Soft Particles are on.</summary>
        public bool SoftParticles;

        /// <summary>Distance in front of the scene at which a soft particle is fully faded out.</summary>
        public float SoftNearFade;

        /// <summary>Distance in front of the scene at which a soft particle is fully opaque.</summary>
        public float SoftFarFade = 1f;
    }

    /// <summary>
    /// Reads a particle material the way Unity's particle shaders define it. The URP, HDRP and
    /// built-in Standard Particles shaders keep their surface in material properties: the blend
    /// factors (<c>_SrcBlend</c>, <c>_DstBlend</c>, <c>_BlendOp</c>), Alpha Clipping
    /// (<c>_AlphaClip</c> or Cutout mode, <c>_Cutoff</c>), <c>_ZWrite</c>, Render Face
    /// (<c>_Cull</c>) and Soft Particles. The legacy particle shaders have none of these and are
    /// read by name.
    /// </summary>
    public static class MaterialReader
    {
        // Babylon's Constants.ALPHA_* values.
        internal const int AlphaDisable = 0;
        internal const int AlphaAdd = 1;
        internal const int AlphaCombine = 2;
        internal const int AlphaSubtract = 3;
        internal const int AlphaMultiply = 4;
        internal const int AlphaOneOne = 6;
        internal const int AlphaPremultiplied = 7;
        internal const int AlphaScreenMode = 10;

        public static ParticleMaterial Read(Material mat)
        {
            var info = new ParticleMaterial();
            if (mat == null) return info;
            info.Tint = ReadTint(mat);

            if (IsOpaque(mat))
            {
                info.Transparent = false;
                info.Blending = AlphaDisable;
                info.DepthWrite = true;
            }
            else
            {
                info.Blending = ReadBlending(mat);
            }
            if (mat.HasProperty("_ZWrite"))
            {
                info.DepthWrite = mat.GetFloat("_ZWrite") > 0.5f;
            }
            if (ClipsAlpha(mat))
            {
                info.AlphaTest = mat.HasProperty("_Cutoff") ? Mathf.Clamp01(mat.GetFloat("_Cutoff")) : 0.5f;
            }
            if (mat.HasProperty("_Cull"))
            {
                switch ((CullMode)(int)mat.GetFloat("_Cull"))
                {
                    case CullMode.Back: info.RenderFace = "front"; break;
                    case CullMode.Front: info.RenderFace = "back"; break;
                }
            }
            if (SoftParticlesOn(mat))
            {
                info.SoftParticles = true;
                if (mat.HasProperty("_SoftParticlesNearFadeDistance"))
                {
                    info.SoftNearFade = Mathf.Max(0f, mat.GetFloat("_SoftParticlesNearFadeDistance"));
                }
                if (mat.HasProperty("_SoftParticlesFarFadeDistance"))
                {
                    info.SoftFarFade = Mathf.Max(0f, mat.GetFloat("_SoftParticlesFarFadeDistance"));
                }
            }
            return info;
        }

        /// <summary>
        /// The color the material's shader multiplies every particle by: URP's _BaseColor, the
        /// built-in particle and Standard shaders' _Color, or the legacy particle shaders'
        /// _TintColor, which they double (its neutral value is mid-grey).
        /// </summary>
        private static Color ReadTint(Material mat)
        {
            if (mat.HasProperty("_BaseColor")) return mat.GetColor("_BaseColor");
            if (mat.HasProperty("_Color")) return mat.GetColor("_Color");
            if (mat.HasProperty("_TintColor")) return mat.GetColor("_TintColor") * 2f;
            return Color.white;
        }

        /// <summary>URP / HDRP Surface Type Opaque, or Standard Particles' Opaque and Cutout modes.</summary>
        private static bool IsOpaque(Material mat)
        {
            if (mat.HasProperty("_Surface")) return mat.GetFloat("_Surface") < 0.5f;
            if (mat.HasProperty("_SurfaceType")) return mat.GetFloat("_SurfaceType") < 0.5f;
            if (mat.HasProperty("_Mode") && IsStandardParticles(mat))
            {
                int mode = (int)mat.GetFloat("_Mode");
                return mode == 0 || mode == 1;
            }
            return false;
        }

        private static bool ClipsAlpha(Material mat)
        {
            if (mat.HasProperty("_AlphaClip")) return mat.GetFloat("_AlphaClip") > 0.5f;
            if (mat.HasProperty("_AlphaCutoffEnable")) return mat.GetFloat("_AlphaCutoffEnable") > 0.5f;
            return mat.HasProperty("_Mode") && IsStandardParticles(mat) && (int)mat.GetFloat("_Mode") == 1;
        }

        private static bool SoftParticlesOn(Material mat)
        {
            if (mat.HasProperty("_SoftParticlesEnabled")) return mat.GetFloat("_SoftParticlesEnabled") > 0.5f;
            return mat.IsKeywordEnabled("SOFTPARTICLES_ON") || mat.IsKeywordEnabled("_SOFTPARTICLES_ON");
        }

        private static bool IsStandardParticles(Material mat) =>
            mat.shader != null && mat.shader.name.ToLowerInvariant().StartsWith("particles/standard");

        /// <summary>
        /// The Babylon alpha mode of a transparent material: from its blend factors when the shader
        /// keeps them in properties, else from the legacy shader's name.
        /// </summary>
        private static int ReadBlending(Material mat)
        {
            if (mat.HasProperty("_SrcBlend") && mat.HasProperty("_DstBlend"))
            {
                var src = (BlendMode)(int)mat.GetFloat("_SrcBlend");
                var dst = (BlendMode)(int)mat.GetFloat("_DstBlend");
                var op = mat.HasProperty("_BlendOp") ? (BlendOp)(int)mat.GetFloat("_BlendOp") : BlendOp.Add;
                int? mode = FromFactors(src, dst, op);
                if (mode == AlphaSubtract)
                {
                    Debug.LogWarning($"[Quarks Exporter] Material '{mat.name}': subtractive blending is exported as ALPHA_SUBTRACT, which darkens by the particle's color and ignores its alpha.");
                }
                if (mode.HasValue) return mode.Value;
                Debug.LogWarning($"[Quarks Exporter] Material '{mat.name}': blend {src} {dst} ({op}) has no babylon.quarks counterpart and is exported as alpha blending.");
                return AlphaCombine;
            }
            return FromShaderName(mat.shader != null ? mat.shader.name.ToLowerInvariant() : "");
        }

        /// <summary>Unity blend factors as the Babylon alpha mode that blends the same way.</summary>
        internal static int? FromFactors(BlendMode src, BlendMode dst, BlendOp op)
        {
            // Standard Particles' Subtractive mode, the frame minus the particle: Babylon's
            // ALPHA_SUBTRACT, frame × (1 − particle), is the nearest (Read warns).
            if (op == BlendOp.ReverseSubtract) return AlphaSubtract;
            if (op != BlendOp.Add) return null;
            // Multiply, and Standard Particles' Modulate (DstColor, OneMinusSrcAlpha), which is
            // multiply faded out by the particle's alpha.
            if ((src == BlendMode.DstColor && (dst == BlendMode.Zero || dst == BlendMode.OneMinusSrcAlpha)) ||
                (src == BlendMode.Zero && dst == BlendMode.SrcColor))
            {
                return AlphaMultiply;
            }
            if (dst == BlendMode.One)
            {
                if (src == BlendMode.SrcAlpha) return AlphaAdd;
                if (src == BlendMode.One) return AlphaOneOne;
            }
            if (dst == BlendMode.OneMinusSrcAlpha)
            {
                if (src == BlendMode.SrcAlpha) return AlphaCombine;
                if (src == BlendMode.One) return AlphaPremultiplied;
            }
            if (src == BlendMode.One && dst == BlendMode.OneMinusSrcColor) return AlphaScreenMode;
            return null;
        }

        /// <summary>The legacy particle shaders, which name their blend.</summary>
        internal static int FromShaderName(string name)
        {
            // Order matters: "Alpha Blended Premultiply" contains "multiply".
            if (name.Contains("additive (soft)") || name.Contains("additive soft")) return AlphaScreenMode;
            if (name.Contains("additive")) return AlphaAdd;
            if (name.Contains("premultiply")) return AlphaPremultiplied;
            if (name.Contains("alpha blend") || name.Contains("alphablend")) return AlphaCombine;
            if (name.Contains("multiply") || name.Contains("modulate")) return AlphaMultiply;
            return AlphaCombine;
        }
    }
}
