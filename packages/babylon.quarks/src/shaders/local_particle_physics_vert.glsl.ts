import {colorSpaceDeclarationGLSL, particleColorVertexDeclarationGLSL} from './chunks/colorSpace';
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
// The stretch, by columns: the emitter's scale, applied after the particle's turn.
attribute vec3 stretchX;
attribute vec3 stretchY;
attribute vec3 stretchZ;

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
#ifdef MESH_COLOR
// The mesh's vertex colour, linear.
attribute vec4 meshColor;
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

#ifdef MESH_VIEW_ALIGNED
// A direction in the camera's axes turned into the world's: by the transpose of the view matrix's
// rotation, its inverse, since a view matrix is rigid. Column i of the rotation is view[i].xyz.
vec3 viewToWorld(vec3 v, mat4 viewMatrix) {
    return vec3(dot(viewMatrix[0].xyz, v), dot(viewMatrix[1].xyz, v), dot(viewMatrix[2].xyz, v));
}
#endif

${fogVertexDeclarationGLSL}
${colorSpaceDeclarationGLSL}
${particleColorVertexDeclarationGLSL}
void main() {
    vec3 scaledPosition = position * size;
    vec3 turnedPosition = applyQuaternion(scaledPosition, rotation);
    // Stretched by the emitter's scale after the turn, as Unity draws a mesh particle: along the
    // emitter's axes, or the world's or the camera's for those alignments.
    vec3 rotatedPosition = stretchX * turnedPosition.x + stretchY * turnedPosition.y + stretchZ * turnedPosition.z;
    // A normal scales by the inverse of the size, so a stretched mesh keeps its normals
    // perpendicular; a flat size counts as a sliver rather than dividing by zero.
    vec3 safeSize = vec3(
        abs(size.x) > 1e-6 ? size.x : 1e-6,
        abs(size.y) > 1e-6 ? size.y : 1e-6,
        abs(size.z) > 1e-6 ? size.z : 1e-6);
    // A mirrored size (an odd number of negative components) turns the winding inside out, so the
    // normal is turned with it and the fragment's front-face test agrees with the geometry.
    vec3 turnedNormal = applyQuaternion(normal / safeSize, rotation);
    // The stretch's cofactor matrix keeps the normal perpendicular to the stretched surface: its
    // inverse transpose times its determinant, which is positive.
    vec3 rotatedNormal = normalize(
        cross(stretchY, stretchZ) * turnedNormal.x +
        cross(stretchZ, stretchX) * turnedNormal.y +
        cross(stretchX, stretchY) * turnedNormal.z) * sign(safeSize.x * safeSize.y * safeSize.z);
#ifdef MESH_VIEW_ALIGNED
    // A view-aligned mesh is turned in the camera's axes (renderAlignment 'view'), so its x runs
    // right on screen, its y up and its z along the view direction.
    rotatedPosition = viewToWorld(rotatedPosition, view);
    rotatedNormal = viewToWorld(rotatedNormal, view);
#endif
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
    // The particle colour, times the material's, comes into the working space here, so it is
    // interpolated there too.
    vColor = quarksParticleColor(color);
#ifdef MESH_COLOR
    // Times the mesh's vertex colour, as it is in either working space: Unity converts the
    // particle colour into its Linear colour space but not a mesh's vertex colours.
    vColor *= meshColor;
#endif
}
`;
