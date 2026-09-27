"""Cases for shaderlab.py, the ShaderLab blend reader the exporter's TryReadShaderSourceBlend mirrors.

    python3 tools/unity-effect-audit/test_shaderlab.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import shaderlab as sl  # noqa: E402

LEGACY_ADDITIVE = '''
Shader "Legacy Shaders/Particles/Additive" {
Properties {
    _TintColor ("Tint Color", Color) = (0.5,0.5,0.5,0.5)
    _MainTex ("Particle Texture", 2D) = "white" {}
    _InvFade ("Soft Particles Factor", Range(0.01,3.0)) = 1.0
}
Category {
    Tags { "Queue"="Transparent" "IgnoreProjector"="True" "RenderType"="Transparent" "PreviewType"="Plane" }
    Blend SrcAlpha One
    ColorMask RGB
    Cull Off Lighting Off ZWrite Off
    SubShader {
        Pass {
            CGPROGRAM
            #pragma vertex vert
            // Blend One Zero  <- a comment inside program code
            float3 BlendNormals(float3 a, float3 b) { return a; }
            fixed4 frag (v2f i) : SV_Target { return 2.0f * i.color * _TintColor * tex2D(_MainTex, i.texcoord); }
            ENDCG
        }
    }
}
}
'''

LEGACY_PREMULT = '''
Shader "Legacy Shaders/Particles/Alpha Blended Premultiply" {
Properties { _MainTex ("Particle Texture", 2D) = "white" {} }
Category {
    Tags { "Queue"="Transparent" }
    Blend One OneMinusSrcAlpha
    SubShader { Pass { CGPROGRAM
      fixed4 frag(v2f i) : SV_Target { return i.color * tex2D(_MainTex, i.texcoord) * i.color.a; }
    ENDCG } }
}
}
'''

MULTIPLY = 'Shader "X/Mul" { SubShader { Tags {"Queue"="Transparent"} Blend Zero SrcColor Pass { } } }'

PROPS = '''Shader "Custom/Props" {
  Properties {
    [Enum(UnityEngine.Rendering.BlendMode)] _MySrc ("Src", Float) = 5
    [Enum(UnityEngine.Rendering.BlendMode)] _MyDst ("Dst", Float) = 10
    _Blend ("Blend label", Float) = 0
  }
  SubShader { Pass { Blend [_MySrc] [_MyDst] HLSLPROGRAM float Blend; ENDHLSL } }
}'''

DEPTH_PREPASS = '''Shader "Custom/TwoPass" {
  SubShader {
    Pass { Name "DepthOnly" ZWrite On ColorMask 0 Blend Off }
    Pass { Name "Color" ZWrite Off Blend SrcAlpha OneMinusSrcAlpha }
  }
}'''

REVSUB = 'Shader "X/Sub" { SubShader { Pass { BlendOp RevSub Blend SrcAlpha One } } }'
SEPARATE_ALPHA = 'Shader "X/Sep" { SubShader { Pass { Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha } } }'
SHADERGRAPH_JSON = '{\n "m_SGVersion": 3,\n "m_Type": "UnityEditor.ShaderGraph.GraphData"\n}'
WEIRD_NAME = 'Shader "Custom//Not a comment" { SubShader { Pass { blend srcalpha one } } }'
OPAQUE = 'Shader "X/Opaque" { SubShader { Pass { ZWrite On } } }'
MRT = 'Shader "X/MRT" { SubShader { Pass { Blend 1 One One  Blend 0 SrcAlpha OneMinusSrcAlpha } } }'
SUBSHADER_OVERRIDES_CATEGORY = '''Shader "X/Override" { Category { Blend One One
   SubShader { Blend SrcAlpha OneMinusSrcAlpha Pass { } } } }'''
MINMAX = 'Shader "X/Max" { SubShader { Pass { BlendOp Max Blend One One } } }'

mat = {'_MySrc': 5.0, '_MyDst': 1.0}
read = lambda n: mat.get(n)

cases = [
    ('legacy additive (Category state, code mentions Blend)', LEGACY_ADDITIVE, (5, 1, 0)),
    ('legacy premultiply', LEGACY_PREMULT, (1, 10, 0)),
    ('multiply at SubShader level', MULTIPLY, (0, 3, 0)),
    ('custom-named property refs, resolved via material', PROPS, (5, 1, 0)),
    ('depth prepass skipped, colour pass used', DEPTH_PREPASS, (5, 10, 0)),
    ('RevSub op', REVSUB, (5, 1, 2)),
    ('separate alpha factors ignored', SEPARATE_ALPHA, (5, 10, 0)),
    ('shader graph JSON is not ShaderLab', SHADERGRAPH_JSON, 'not-shaderlab'),
    ('// inside a string is not a comment; lowercase keywords', WEIRD_NAME, (5, 1, 0)),
    ('no Blend anywhere = opaque', OPAQUE, 'off'),
    ('only render target 0 counts', MRT, (5, 10, 0)),
    ('SubShader state overrides Category', SUBSHADER_OVERRIDES_CATEGORY, (5, 10, 0)),
    ('Max op is reported, not dropped', MINMAX, (1, 1, 4)),
]
fails = 0
for label, src, want in cases:
    st = sl.blend_statement(src)
    if st is None:
        got = 'not-shaderlab'
    elif st[0] == 'off':
        got = 'off'
    else:
        got = sl.resolve(st, read)
    ok = got == want
    fails += not ok
    print(('ok  ' if ok else 'FAIL'), f'{label:58} -> {got}' + ('' if ok else f'   (want {want})'))
print('\nfailures:', fails)
sys.exit(1 if fails else 0)
