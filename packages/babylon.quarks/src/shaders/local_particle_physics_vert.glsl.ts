import {fogVertexDeclarationGLSL, fogVertexGLSL} from './chunks/fog';
import {sheetVertexDeclarationGLSL, sheetVertexGLSL} from './chunks/sheet';

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
${sheetVertexDeclarationGLSL}

varying vec2 vUV;
varying vec4 vColor;
#ifdef UV1
#ifdef MESH_UV2
// The mesh's second UV set.
attribute vec2 uv2;
#endif
// UV channel 1: the mesh's second UV set, or its first when it has none.
varying vec2 vUV1;
#endif
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

${fogVertexDeclarationGLSL}
void main() {
    vec3 scaledPosition = position * size;
    vec3 rotatedPosition = applyQuaternion(scaledPosition, rotation);
    // A normal scales by the inverse of the size, so a stretched mesh keeps its normals
    // perpendicular; a flat size counts as a sliver rather than dividing by zero.
    vec3 safeSize = vec3(
        abs(size.x) > 1e-6 ? size.x : 1e-6,
        abs(size.y) > 1e-6 ? size.y : 1e-6,
        abs(size.z) > 1e-6 ? size.z : 1e-6);
    // A mirrored size (an odd number of negative components) turns the winding inside out, so the
    // normal is turned with it and the fragment's front-face test agrees with the geometry.
    vec3 rotatedNormal = normalize(applyQuaternion(normal / safeSize, rotation)) * sign(safeSize.x * safeSize.y * safeSize.z);
    vec3 localPos = rotatedPosition + offset;

    vec4 worldPos = world * vec4(localPos, 1.0);
    vec4 viewPos = view * worldPos;
    gl_Position = projection * viewPos;
${fogVertexGLSL('viewPos.xyz')}

    vWorldPos = worldPos.xyz;
    vNormal = normalize((world * vec4(rotatedNormal, 0.0)).xyz);

#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    linearDepth = abs(viewPos.z);
#endif

${sheetVertexGLSL('uv')}

#ifdef UV1
#ifdef MESH_UV2
    vUV1 = uv2;
#else
    vUV1 = uv;
#endif
#endif
    vColor = color;
}
`;
