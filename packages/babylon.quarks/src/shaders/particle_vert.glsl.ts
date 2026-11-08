import {colorSpaceDeclarationGLSL, particleColorVertexDeclarationGLSL} from './chunks/colorSpace';
import {fogVertexDeclarationGLSL, fogVertexGLSL} from './chunks/fog';
import {sheetVertexDeclarationGLSL, sheetVertexGLSL} from './chunks/sheet';

export default /* glsl */ `
// Per-vertex attributes
attribute vec3 position;
attribute vec2 uv;

// Per-instance attributes
attribute vec3 offset;
attribute vec4 color;
attribute vec3 size;
#ifdef BILLBOARD_ALIGNED
// The quad's turn, as a quaternion: the axes it is laid along and its spin about their Z.
attribute vec4 rotation;
#else
attribute float rotation;
#endif
attribute float uvTile;

// Uniforms
uniform mat4 world;
uniform mat4 view;
uniform mat4 projection;
${sheetVertexDeclarationGLSL}

#ifdef PIVOT
// Quad offset in particle-size units: xy in the quad's plane, z toward the camera (along the
// axes' +Z for an aligned quad).
uniform vec3 pivot;
#endif

#ifdef BILLBOARD_ALIGNED
// v turned by the unit quaternion q.
vec3 applyQuaternion(vec3 v, vec4 q) {
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}
#endif

// Varyings
varying vec2 vUV;
varying vec4 vColor;
#ifdef UV1
// The particle's own UV, never moved by the sheet (UV channel 1).
varying vec2 vUV1;
#endif
#ifdef SOFT_PARTICLES
varying vec4 projPosition;
varying float linearDepth;
#endif

#ifdef SIZE_LIMITS
// Smallest and largest size a particle may have on screen, as fractions of the viewport height.
uniform vec2 sizeLimits;
#endif
${fogVertexDeclarationGLSL}
${colorSpaceDeclarationGLSL}
${particleColorVertexDeclarationGLSL}
void main() {
#ifndef BILLBOARD_ALIGNED
    float c = cos(rotation);
    float s = sin(rotation);
#endif

#ifdef SIZE_LIMITS
    // The particle's size on screen as a fraction of the viewport height, held
    // between the limits; a perspective projection divides by the view depth.
    vec4 limitCenter = view * world * vec4(offset, 1.0);
    float limitDepth = abs(projection[2][3]) > 0.0 ? abs(limitCenter.z) : 1.0;
    float screenSize = max(abs(size.x), abs(size.y)) * projection[1][1] / (2.0 * limitDepth);
    float sizeScale = screenSize > 0.0 ? clamp(screenSize, sizeLimits.x, sizeLimits.y) / screenSize : 1.0;
    vec3 limitedSize = size * sizeScale;
#else
    vec3 limitedSize = size;
#endif
    // A negative size mirrors the quad, which is how flipped particles arrive.
    vec2 alignedPosition = position.xy * limitedSize.xy;
#ifdef PIVOT
    // The pivot turns with the particle but is not mirrored with it.
    alignedPosition += pivot.xy * abs(limitedSize.xy);
#endif
#ifndef BILLBOARD_ALIGNED
    vec2 rotatedPosition;
    rotatedPosition.x = c * alignedPosition.x - s * alignedPosition.y;
    rotatedPosition.y = s * alignedPosition.x + c * alignedPosition.y;
#endif

#ifdef BILLBOARD_ALIGNED
    // The quad in the XY plane of the world's or the emitter's axes, turned into them in the world.
    vec3 corner = vec3(alignedPosition, 0.0);
#ifdef PIVOT
    corner.z = pivot.z * abs(limitedSize.x);
#endif
    vec4 mvPosition = world * vec4(offset, 1.0);
    mvPosition.xyz += applyQuaternion(corner, rotation);
    mvPosition = view * mvPosition;
#elif defined(HORIZONTAL)
    vec4 mvPosition = world * vec4(offset, 1.0);
    mvPosition.x += rotatedPosition.x;
    mvPosition.z -= rotatedPosition.y;
#ifdef PIVOT
    mvPosition.y += pivot.z * abs(limitedSize.x);
#endif
    mvPosition = view * mvPosition;
#elif defined(VERTICAL)
    vec4 mvPosition = world * vec4(offset, 1.0);
    mvPosition.y += rotatedPosition.y;
    mvPosition = view * mvPosition;
    mvPosition.x += rotatedPosition.x;
#else
    vec4 mvPosition = view * world * vec4(offset, 1.0);
    mvPosition.xy += rotatedPosition;
#endif
#ifdef PIVOT
#if !defined(HORIZONTAL) && !defined(BILLBOARD_ALIGNED)
    // Toward the camera along its view axis, whichever way the view space
    // faces: anything in front of the camera has the sign of the far side.
    mvPosition.z -= sign(mvPosition.z) * pivot.z * abs(limitedSize.x);
#endif
#endif

    gl_Position = projection * mvPosition;
${fogVertexGLSL('mvPosition.xyz')}
#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    linearDepth = abs(mvPosition.z);
#endif

${sheetVertexGLSL('uv')}

#ifdef UV1
    vUV1 = uv;
#endif
    // The particle colour, times the material's, comes into the working space here, so it is
    // interpolated there too.
    vColor = quarksParticleColor(color);
}
`;
