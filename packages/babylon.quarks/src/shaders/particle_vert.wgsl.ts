import {colorSpaceDeclarationWGSL, particleColorVertexDeclarationWGSL} from './chunks/colorSpace';
import {fogVertexDeclarationWGSL, fogVertexWGSL} from './chunks/fog';
import {sheetVertexDeclarationWGSL, sheetVertexWGSL} from './chunks/sheet';

export default /* wgsl */ `
// Per-vertex attributes
attribute position: vec3f;
attribute uv: vec2f;

// Per-instance attributes
attribute offset: vec3f;
attribute color: vec4f;
attribute size: vec3f;
#ifdef BILLBOARD_ALIGNED
// The quad's turn, as a quaternion: the axes it is laid along and its spin about their Z.
attribute rotation: vec4f;
#else
attribute rotation: f32;
#endif
attribute uvTile: f32;

// Uniforms
uniform world: mat4x4f;
uniform view: mat4x4f;
uniform projection: mat4x4f;
${sheetVertexDeclarationWGSL}

#ifdef PIVOT
// Quad offset in particle-size units: xy in the quad's plane, z toward the camera (along the
// axes' +Z for an aligned quad).
uniform pivot: vec3f;
#endif

#ifdef BILLBOARD_ALIGNED
// v turned by the unit quaternion q.
fn applyQuaternion(v: vec3f, q: vec4f) -> vec3f {
    let t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}
#endif

// Varyings
varying vUV: vec2f;
varying vColor: vec4f;
#ifdef UV1
// The particle's own UV, never moved by the sheet (UV channel 1).
varying vUV1: vec2f;
#endif
#ifdef SOFT_PARTICLES
varying projPosition: vec4f;
varying linearDepth: f32;
#endif

#ifdef SIZE_LIMITS
// Smallest and largest size a particle may have on screen, as fractions of the viewport height.
uniform sizeLimits: vec2f;
#endif
${fogVertexDeclarationWGSL}
${colorSpaceDeclarationWGSL}
${particleColorVertexDeclarationWGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
#ifndef BILLBOARD_ALIGNED
    let c = cos(vertexInputs.rotation);
    let s = sin(vertexInputs.rotation);
#endif

#ifdef SIZE_LIMITS
    // The particle's size on screen as a fraction of the viewport height, held
    // between the limits; a perspective projection divides by the view depth.
    let limitCenter = uniforms.view * uniforms.world * vec4f(vertexInputs.offset, 1.0);
    let limitDepth = select(1.0, abs(limitCenter.z), abs(uniforms.projection[2][3]) > 0.0);
    let screenSize = max(abs(vertexInputs.size.x), abs(vertexInputs.size.y)) * uniforms.projection[1][1] / (2.0 * limitDepth);
    let sizeScale = select(1.0, clamp(screenSize, uniforms.sizeLimits.x, uniforms.sizeLimits.y) / screenSize, screenSize > 0.0);
    let limitedSize = vertexInputs.size * sizeScale;
#else
    let limitedSize = vertexInputs.size;
#endif
    // A negative size mirrors the quad, which is how flipped particles arrive.
    var alignedPosition = vertexInputs.position.xy * limitedSize.xy;
#ifdef PIVOT
    // The pivot turns with the particle but is not mirrored with it.
    alignedPosition += uniforms.pivot.xy * abs(limitedSize.xy);
#endif
#ifndef BILLBOARD_ALIGNED
    let rotatedPosition = vec2f(
        c * alignedPosition.x - s * alignedPosition.y,
        s * alignedPosition.x + c * alignedPosition.y);
#endif

#ifdef BILLBOARD_ALIGNED
    // The quad in the XY plane of the world's or the emitter's axes, turned into them in the world.
    var corner = vec3f(alignedPosition, 0.0);
#ifdef PIVOT
    corner.z = uniforms.pivot.z * abs(limitedSize.x);
#endif
    var mvPosition = uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition = vec4f(mvPosition.xyz + applyQuaternion(corner, vertexInputs.rotation), mvPosition.w);
    mvPosition = uniforms.view * mvPosition;
#elif defined(HORIZONTAL)
    var mvPosition = uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition.x += rotatedPosition.x;
    mvPosition.z -= rotatedPosition.y;
#ifdef PIVOT
    mvPosition.y += uniforms.pivot.z * abs(limitedSize.x);
#endif
    mvPosition = uniforms.view * mvPosition;
#elif defined(VERTICAL)
    var mvPosition = uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition.y += rotatedPosition.y;
    mvPosition = uniforms.view * mvPosition;
    mvPosition.x += rotatedPosition.x;
#else
    var mvPosition = uniforms.view * uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition.x += rotatedPosition.x;
    mvPosition.y += rotatedPosition.y;
#endif
#ifdef PIVOT
#if !defined(HORIZONTAL) && !defined(BILLBOARD_ALIGNED)
    // Toward the camera along its view axis, whichever way the view space
    // faces: anything in front of the camera has the sign of the far side.
    mvPosition.z -= sign(mvPosition.z) * uniforms.pivot.z * abs(limitedSize.x);
#endif
#endif

    let clipPosition = uniforms.projection * mvPosition;
    vertexOutputs.position = clipPosition;
${fogVertexWGSL('mvPosition.xyz')}
#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    vertexOutputs.linearDepth = abs(mvPosition.z);
#endif

${sheetVertexWGSL('vertexInputs.uv')}

#ifdef UV1
    vertexOutputs.vUV1 = vertexInputs.uv;
#endif
    // The particle colour, times the material's, comes into the working space here, so it is
    // interpolated there too.
    vertexOutputs.vColor = quarksParticleColor(vertexInputs.color);
}
`;
