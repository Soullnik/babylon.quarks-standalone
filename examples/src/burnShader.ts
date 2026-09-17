/**
 * The layer a particle system cannot do: fire that lives on the object's own
 * surface. A duplicate of the mesh, pushed out along its normals and drawn
 * additively, with scrolling noise eroded into flame edges and a fresnel rim —
 * the shape League of Legends and friends use for a burning character, where
 * the fire cannot intersect the body because it *is* the body.
 */
export const burnVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform vec3 eyePosition;
uniform float inflate;

varying vec2 vUV;
varying vec3 vLocalPos;
varying vec3 vNormalW;
varying vec3 vViewDirW;

void main() {
    vec3 inflated = position + normal * inflate;
    vec4 worldPos = world * vec4(inflated, 1.0);
    gl_Position = worldViewProjection * vec4(inflated, 1.0);

    vUV = uv;
    vLocalPos = position;
    vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
    vViewDirW = normalize(eyePosition - worldPos.xyz);
}
`;

export const burnFragmentShader = /* glsl */ `
precision highp float;

uniform float time;
uniform float burn;
uniform float noiseScale;
uniform float scrollSpeed;
uniform vec3 emberColor;
uniform vec3 flameColor;
uniform vec3 coreColor;
uniform float height;

varying vec2 vUV;
varying vec3 vLocalPos;
varying vec3 vNormalW;
varying vec3 vViewDirW;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/** Value noise — smooth enough for flame masks and cheap enough to stack. */
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        sum += amplitude * valueNoise(p);
        p *= 2.02;
        amplitude *= 0.5;
    }
    return sum;
}

void main() {
    // Tongues are stretched along the surface's up axis and scroll upwards; a
    // second, faster layer makes their edges flicker.
    vec2 uv = vec2(vUV.x * noiseScale, vUV.y * noiseScale * 0.35);
    float slow = fbm(uv + vec2(0.0, -time * scrollSpeed));
    float fast = fbm(uv * 2.4 + vec2(time * 0.17, -time * scrollSpeed * 2.4));
    float noise = mix(slow, fast, 0.4);

    // Fire clings to the bottom of the object and dies out towards the top.
    float up = clamp((vLocalPos.y + height * 0.5) / height, 0.0, 1.0);
    float gradient = 1.0 - smoothstep(0.0, 0.8, up);

    // Erosion: the noise field is cut at a threshold, so what survives is a set
    // of torn tongues rather than a wash of light. The burn uniform opens the
    // cut, letting the fire eat further up the surface, and a slow wobble keeps
    // the cut from looking stamped on.
    float mask = noise * (0.58 + 0.42 * gradient);
    float flicker = 0.02 * sin(time * 6.0 + vUV.x * 14.0) + 0.015 * sin(time * 9.3 + vUV.y * 7.0);
    float threshold = mix(0.47, 0.33, clamp(burn, 0.0, 1.0)) + flicker;
    float body = smoothstep(threshold, threshold + 0.035, mask);
    float edge = smoothstep(threshold - 0.05, threshold + 0.005, mask) - body;

    // Hotter at the root of each tongue, cooling towards the tip.
    float heat = clamp(body * (0.25 + 0.75 * gradient), 0.0, 1.0);
    vec3 color = mix(emberColor, flameColor, smoothstep(0.15, 0.55, mask));
    color = mix(color, coreColor, smoothstep(0.7, 1.0, heat) * 0.8);
    color = mix(color, emberColor * 0.85, edge);

    // Rim light: only where there is fire, so the object does not glow all over.
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDirW)), 0.0, 1.0), 3.0);
    float alpha = clamp(body + edge * 0.7, 0.0, 1.0);
    alpha = clamp(alpha + fresnel * gradient * 0.25 * alpha, 0.0, 1.0);

    gl_FragColor = vec4(color * alpha, alpha);
}
`;
