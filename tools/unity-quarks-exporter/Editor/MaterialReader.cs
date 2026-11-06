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

        /// <summary>The color the shader multiplies every particle by, as the material holds it.</summary>
        public Color Tint = Color.white;

        /// <summary>
        /// What the shader multiplies <see cref="Tint"/> by once it is linear: 2 for the legacy
        /// particle shaders, which double their Tint Color, 1 otherwise.
        /// </summary>
        public float TintScale = 1f;

        /// <summary>Unity's Render Face (the material's <c>_Cull</c>) as babylon.quarks' renderFace.</summary>
        public string RenderFace = "both";

        /// <summary>Whether Soft Particles are on.</summary>
        public bool SoftParticles;

        /// <summary>Distance in front of the scene at which a soft particle is fully faded out.</summary>
        public float SoftNearFade;

        /// <summary>Distance in front of the scene at which a soft particle is fully opaque.</summary>
        public float SoftFarFade = 1f;

        /// <summary>
        /// Whether the shader lights the particles (Standard Particles Surface, URP Particles Lit
        /// and Simple Lit, VertexLit, Standard and the legacy Diffuse and Specular); the unlit
        /// particle shaders draw the texture times the particle colour.
        /// </summary>
        public bool Lit;

        /// <summary>
        /// Whether the shader reads its texture's colour as already multiplied by the texture's
        /// alpha (the legacy Alpha Blended Premultiply), and may find light where the alpha is 0:
        /// the system is exported with premultipliedMap, which draws the texture so.
        /// </summary>
        public bool PremultipliedTexture;

        /// <summary>
        /// Whether the shader draws the particle's colour, the vertex colour Unity's particle
        /// renderer gives the mesh: the particle and sprite shaders do; Unity's mesh shaders do not,
        /// and the system is exported with particleColor false, which draws the texture times the
        /// material colour alone.
        /// </summary>
        public bool ParticleColor = true;
    }

    /// <summary>
    /// Reads a particle material the way Unity's particle shaders define it. The URP, HDRP and
    /// built-in Standard Particles shaders keep their surface in material properties: the blend
    /// factors (<c>_SrcBlend</c>, <c>_DstBlend</c>, <c>_BlendOp</c>), Alpha Clipping
    /// (<c>_AlphaClip</c> or Cutout mode, <c>_Cutoff</c>), <c>_ZWrite</c>, Render Face
    /// (<c>_Cull</c>) and Soft Particles. Every other shader is read as Unity draws it: its
    /// RenderType tag says whether it is an opaque surface, which writes depth, draws before the
    /// transparent ones and culls its back faces, and whether it clips at <c>_Cutoff</c>; the
    /// legacy particle shaders, transparent, name their blend.
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
            info.Tint = ReadTint(mat, out info.TintScale);
            info.Lit = IsLit(mat);
            info.ParticleColor = TakesParticleColor(mat);

            if (IsOpaque(mat))
            {
                info.Transparent = false;
                info.Blending = AlphaDisable;
                info.DepthWrite = true;
            }
            else
            {
                info.Blending = ReadBlending(mat);
                // The legacy shader draws texture × vertex colour × vertex alpha; URP's Premultiply
                // mode multiplies by the texture's alpha in the shader, as quarks does.
                info.PremultipliedTexture = info.Blending == AlphaPremultiplied && mat.shader != null &&
                    mat.shader.name.ToLowerInvariant().Contains("particles/alpha blended premultiply");
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
            else if (!info.Transparent)
            {
                // A shader without the property culls as its code says: Unity's default, Cull Back,
                // in every opaque and cutout shader it ships (Diffuse, VertexLit, Unlit, Mobile,
                // Standard), where the particle and sprite shaders, all transparent, draw both faces.
                info.RenderFace = "front";
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
        /// Whether the material's shader lights what it draws, by its name: lighting is in the
        /// shader's code, with no setting or tag that says so (an unlit effect shader has a
        /// ForwardBase pass as often as a lit one). The particle shaders and most custom effect
        /// shaders are unlit; the lit ones name their lighting model ("Lit", "Surface",
        /// "VertexLit", "Standard", and the legacy "Diffuse" and "Specular", which light as
        /// Lambert and Blinn-Phong).
        /// </summary>
        private static bool IsLit(Material mat)
        {
            string name = mat.shader != null ? mat.shader.name.ToLowerInvariant() : "";
            if (name.Contains("unlit")) return false;
            return name.Contains("lit") || name.Contains("surface") || name.Contains("diffuse") || name.Contains("specular") ||
                name == "standard" || name.StartsWith("standard (");
        }

        /// <summary>
        /// Whether the material's shader draws the particle's colour, by its family: Unity's mesh
        /// shaders, the legacy ones outside Particles (Diffuse, Specular, Bumped, VertexLit, their
        /// Transparent and Cutout variants, Self-Illumin), Mobile's outside Particles, Unlit/* and
        /// Standard, draw a particle tinted or faded exactly as a white one, colour and alpha, so
        /// the cutout ones clip at the texture's alpha times the material's (measured in Unity 6).
        /// Their compiled vertex programs do not tell: the surface shaders read the vertex colour
        /// (appdata_full) and drop it. The particle and sprite shaders take it, and so is any other
        /// shader taken to, as effect shaders mostly are written.
        /// </summary>
        private static bool TakesParticleColor(Material mat)
        {
            string name = mat.shader != null ? mat.shader.name.ToLowerInvariant() : "";
            if (name.StartsWith("legacy shaders/")) return name.StartsWith("legacy shaders/particles/");
            if (name.StartsWith("mobile/")) return name.StartsWith("mobile/particles/");
            return !name.StartsWith("unlit/") && name != "standard" && !name.StartsWith("standard (");
        }

        /// <summary>
        /// The color the material's shader multiplies every particle by: URP's _BaseColor, the
        /// built-in particle and Standard shaders' _Color, or the legacy particle shaders'
        /// _TintColor, which they double after Unity has made it linear (its neutral value is
        /// mid-grey): a <paramref name="scale"/> of 2, which babylon.quarks' materialColorScale
        /// applies in linear space too.
        /// </summary>
        private static Color ReadTint(Material mat, out float scale)
        {
            scale = 1f;
            if (mat.HasProperty("_BaseColor")) return mat.GetColor("_BaseColor");
            if (mat.HasProperty("_Color")) return mat.GetColor("_Color");
            if (mat.HasProperty("_TintColor"))
            {
                scale = 2f;
                return mat.GetColor("_TintColor");
            }
            return Color.white;
        }

        /// <summary>
        /// URP / HDRP Surface Type Opaque, Standard Particles' Opaque and Cutout modes, or, for
        /// any other shader, its RenderType: Opaque and TransparentCutout (legacy Diffuse and
        /// Transparent/Cutout/Diffuse, Unlit/Texture, Standard's Opaque and Cutout modes). Unity's
        /// shaders, and the effect editors', all set it; the render queue only orders the drawing
        /// (a Transparent shader in an opaque queue still blends). A shader without the tag is read
        /// as a transparent particle shader.
        /// </summary>
        private static bool IsOpaque(Material mat)
        {
            if (mat.HasProperty("_Surface")) return mat.GetFloat("_Surface") < 0.5f;
            if (mat.HasProperty("_SurfaceType")) return mat.GetFloat("_SurfaceType") < 0.5f;
            if (mat.HasProperty("_Mode") && IsStandardParticles(mat))
            {
                int mode = (int)mat.GetFloat("_Mode");
                return mode == 0 || mode == 1;
            }
            string renderType = RenderType(mat);
            return renderType == "Opaque" || renderType == "TransparentCutout";
        }

        /// <summary>
        /// URP / HDRP Alpha Clipping, Standard Particles' Cutout mode, or, for any other shader, the
        /// _ALPHATEST_ON keyword Standard's Cutout mode sets, or the RenderType TransparentCutout of
        /// the shaders that always clip (Transparent/Cutout/*, Unlit/Transparent Cutout).
        /// </summary>
        private static bool ClipsAlpha(Material mat)
        {
            if (mat.HasProperty("_AlphaClip")) return mat.GetFloat("_AlphaClip") > 0.5f;
            if (mat.HasProperty("_AlphaCutoffEnable")) return mat.GetFloat("_AlphaCutoffEnable") > 0.5f;
            if (mat.HasProperty("_Mode") && IsStandardParticles(mat)) return (int)mat.GetFloat("_Mode") == 1;
            return mat.IsKeywordEnabled("_ALPHATEST_ON") || RenderType(mat) == "TransparentCutout";
        }

        /// <summary>
        /// The material's RenderType tag: the one the material overrides (Standard sets it per
        /// mode), else its shader's.
        /// </summary>
        private static string RenderType(Material mat) => mat.GetTag("RenderType", true, "");

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
