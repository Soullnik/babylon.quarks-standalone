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
attribute rotation: f32;
attribute uvTile: f32;
attribute velocity: vec4f;

// Uniforms
uniform world: mat4x4f;
uniform view: mat4x4f;
uniform projection: mat4x4f;
${sheetVertexDeclarationWGSL}

#ifdef PIVOT
// Streak offset in particle-size units: x from head to tail, y across.
uniform pivot: vec3f;
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
    let lengthFactor = vertexInputs.velocity.w;
    // A flipped particle arrives with a negative size: the streak keeps its
    // extent and mirrors its texture instead (see quadUV below).
    var avgSize = (abs(vertexInputs.size.x) + abs(vertexInputs.size.y)) * 0.5;
    var mvPosition = uniforms.view * uniforms.world * vec4f(vertexInputs.offset, 1.0);
    let viewWorld = uniforms.view * uniforms.world;
    let viewWorld3 = mat3x3f(viewWorld[0].xyz, viewWorld[1].xyz, viewWorld[2].xyz);
    let viewVelocity = viewWorld3 * vertexInputs.velocity.xyz;
    let vlength = length(viewVelocity);
    // Stretch direction is the velocity direction, kept by a speed factor of 0 too (the batch writes
    // a tiny one). A motionless particle has none, and Unity draws nothing of it: no size either.
    var vdir = vec3f(0.0, 0.0, 1.0);
    if (vlength > 1e-9) {
        vdir = viewVelocity / vlength;
    }
#ifndef BEAM
    if (vlength <= 1e-9) {
        avgSize = 0.0;
    }
#endif
#ifdef SIZE_LIMITS
    // The streak's width on screen as a fraction of the viewport height, held
    // between the limits; a perspective projection divides by the view depth.
    let limitDepth = select(1.0, abs(mvPosition.z), abs(uniforms.projection[2][3]) > 0.0);
    let screenSize = avgSize * uniforms.projection[1][1] / (2.0 * limitDepth);
    if (screenSize > 0.0) {
        avgSize *= clamp(screenSize, uniforms.sizeLimits.x, uniforms.sizeLimits.y) / screenSize;
    }
#endif
#ifdef BEAM
    // The vector runs from the particle to the beam's end: the quad spans it
    // exactly, U from the particle (0) to the end (1), as wide as the size.
    let axis = vdir;
    let streak = -viewVelocity;
#else
    // Unity's streak, from the particle to its tail end: back along the velocity by the speed
    // times the speed factor plus the size times the length factor, the two added as they come,
    // so negative factors reach ahead of the particle (measured in Unity 6). The velocity comes
    // already scaled by the speed factor, and the length factor times that factor's sign, so the
    // length runs along the particle's own way whatever the speed factor's sign. The quad lies
    // along the streak, U from the particle to the tail end, and turns round with it when it
    // reaches ahead, as Unity turns its texture.
    let streak = viewVelocity + vdir * lengthFactor * avgSize;
    let streakLength = length(streak);
    var axis = vdir;
    if (streakLength > 1e-9) {
        axis = streak / streakLength;
    }
#endif
    // Seen straight along its length a streak has no side to face; any will do.
    let sideRaw = cross(mvPosition.xyz, axis);
    var side = vec3f(1.0, 0.0, 0.0);
    if (dot(sideRaw, sideRaw) > 1e-12) {
        side = normalize(sideRaw);
    }
    let widthOffset = vertexInputs.position.y * side * avgSize;
    var stretched = mvPosition.xyz + widthOffset - (vertexInputs.position.x + 0.5) * streak;
#ifdef PIVOT
    // In particle-size units along the quad's own axes: x from head to tail, y across.
    stretched += (uniforms.pivot.y * side - uniforms.pivot.x * axis) * avgSize;
#endif
    mvPosition.x = stretched.x;
    mvPosition.y = stretched.y;
    mvPosition.z = stretched.z;

    let clipPosition = uniforms.projection * mvPosition;
    vertexOutputs.position = clipPosition;
${fogVertexWGSL('mvPosition.xyz')}
    let quadUV = select(vertexInputs.uv, 1.0 - vertexInputs.uv, vertexInputs.size.xy < vec2f(0.0));
#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    vertexOutputs.linearDepth = abs(mvPosition.z);
#endif

${sheetVertexWGSL('quadUV')}

#ifdef UV1
    vertexOutputs.vUV1 = quadUV;
#endif
    // The particle colour, times the material's, comes into the working space here, so it is
    // interpolated there too.
    vertexOutputs.vColor = quarksParticleColor(vertexInputs.color);
}
`;
