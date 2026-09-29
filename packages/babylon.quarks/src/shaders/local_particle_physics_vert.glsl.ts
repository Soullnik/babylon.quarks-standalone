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

#ifdef TILE_BLEND
varying vec2 vUV2;
varying float vTileBlend;
#endif

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
#ifdef MESH_ALIGN_VIEW
    // Unity's View alignment: the mesh's own axes are the camera's — right, up, forward — so it
    // turns with the view the way a billboard does, its rotation applied on top.
    vec3 viewOffset = rotatedPosition;
    vec3 viewNormal = rotatedNormal;
    #ifdef MESH_VIEW_RIGHT_HANDED
    viewOffset.z = -viewOffset.z;
    viewNormal.z = -viewNormal.z;
    #endif
    vec4 worldCenter = world * vec4(offset, 1.0);
    vec4 viewPos = view * worldCenter;
    viewPos.xyz += viewOffset;
    gl_Position = projection * viewPos;
    // Back to world space through the view's rotation, whose inverse is its transpose.
    vec4 worldPos = vec4(worldCenter.xyz + (vec4(viewOffset, 0.0) * view).xyz, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize((vec4(viewNormal, 0.0) * view).xyz);
#else
    vec3 localPos = rotatedPosition + offset;

    vec4 worldPos = world * vec4(localPos, 1.0);
    vec4 viewPos = view * worldPos;
    gl_Position = projection * viewPos;

    vWorldPos = worldPos.xyz;
    vNormal = normalize((world * vec4(rotatedNormal, 0.0)).xyz);
#endif

#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    linearDepth = -viewPos.z;
#endif

#ifdef UV_TILE
    vec2 tc = vec2(tileCountX, tileCountY);
    float baseTile = floor(uvTile);
    float tileU = mod(baseTile, tc.x) / tc.x;
    float tileV = 1.0 - floor(baseTile / tc.x) / tc.y - 1.0 / tc.y;
    vUV = uv / tc + vec2(tileU, tileV);
    #ifdef TILE_BLEND
        float nextTile = ceil(uvTile);
        float nextU = mod(nextTile, tc.x) / tc.x;
        float nextV = 1.0 - floor(nextTile / tc.x) / tc.y - 1.0 / tc.y;
        vUV2 = uv / tc + vec2(nextU, nextV);
        vTileBlend = fract(uvTile);
    #endif
#else
    vUV = uv;
#endif

    vColor = color;
}
`;
