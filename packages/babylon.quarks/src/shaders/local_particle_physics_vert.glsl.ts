export default /* glsl */ `
attribute vec3 position;
attribute vec2 uv;
attribute vec3 normal;
attribute vec3 offset;
attribute vec4 color;
attribute vec3 size;
attribute vec4 rotation;
attribute float uvTile;

uniform mat4 world;
uniform mat4 view;
uniform mat4 projection;

#ifdef UV_TILE
uniform float tileCountX;
uniform float tileCountY;
#endif

varying vec2 vUV;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

#ifdef SOFT_PARTICLES
varying vec4 projPosition;
varying float linearDepth;
#endif

vec3 applyQuaternion(vec3 v, vec4 q) {
    vec3 qVec = q.xyz;
    float qW = q.w;
    vec3 t = 2.0 * cross(qVec, v);
    return v + qW * t + cross(qVec, t);
}

void main() {
    vec3 scaledPosition = position * size;
    vec3 rotatedPosition = applyQuaternion(scaledPosition, rotation);
    vec3 rotatedNormal = normalize(applyQuaternion(normal, rotation));
    vec3 localPos = rotatedPosition + offset;

    vec4 worldPos = world * vec4(localPos, 1.0);
    vec4 viewPos = view * worldPos;
    gl_Position = projection * viewPos;

    vWorldPos = worldPos.xyz;
    vNormal = normalize((world * vec4(rotatedNormal, 0.0)).xyz);

#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    linearDepth = -viewPos.z;
#endif

#ifdef UV_TILE
    vec2 tc = vec2(tileCountX, tileCountY);
    float tileU = mod(uvTile, tc.x) / tc.x;
    float tileV = 1.0 - floor(uvTile / tc.x) / tc.y - 1.0 / tc.y;
    vUV = uv / tc + vec2(tileU, tileV);
#else
    vUV = uv;
#endif

    vColor = color;
}
`;
