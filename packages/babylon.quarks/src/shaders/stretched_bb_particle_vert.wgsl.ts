import {fogVertexDeclarationWGSL, fogVertexWGSL} from './chunks/fog';

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
uniform speedFactor: f32;

#ifdef UV_TILE
uniform tileCountX: f32;
uniform tileCountY: f32;
#endif

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
#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
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
    // Stretch direction is the velocity direction; only a genuinely motionless particle has none.
    // Deriving it via normalize keeps the stretch aligned even when the speed contribution is ~0
    // (e.g. speedFactor 0), instead of collapsing the whole burst onto a fixed screen axis.
    var vdir = vec3f(0.0, 0.0, 1.0);
    if (vlength > 0.000001) {
        vdir = viewVelocity / vlength;
    }
#ifdef BEAM
    // Seen straight along its length a beam has no side to face; any will do.
    let sideRaw = cross(mvPosition.xyz, vdir);
    var side = vec3f(1.0, 0.0, 0.0);
    if (dot(sideRaw, sideRaw) > 1e-12) {
        side = normalize(sideRaw);
    }
#else
    let side = normalize(cross(mvPosition.xyz, vdir));
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
    let widthOffset = vertexInputs.position.y * side * avgSize;
    // Equivalent to viewVelocity * (1.0 + lengthFactor / vlength) for moving particles, but the
    // size-based term (vdir * lengthFactor) survives when the velocity contribution vanishes.
#ifdef BEAM
    // The vector runs from the particle to the beam's end: the quad spans it
    // exactly, U from the particle (0) to the end (1), as wide as the size.
    var stretched = mvPosition.xyz + widthOffset + (vertexInputs.position.x + 0.5) * viewVelocity;
#else
    let lengthOffset = (vertexInputs.position.x + 0.5) * (viewVelocity + vdir * lengthFactor) * avgSize;
    var stretched = mvPosition.xyz + widthOffset - lengthOffset;
#endif
#ifdef PIVOT
    // In particle-size units along the quad's own axes: x from head to tail, y across.
    stretched += (uniforms.pivot.y * side - uniforms.pivot.x * vdir) * avgSize;
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

    #ifdef UV_TILE
        let tc = vec2f(uniforms.tileCountX, uniforms.tileCountY);
        let baseTile = floor(vertexInputs.uvTile);
        let tileU = (baseTile % tc.x) / tc.x;
        let tileV = 1.0 - floor(baseTile / tc.x) / tc.y - 1.0 / tc.y;
        vertexOutputs.vUV = quadUV / tc + vec2f(tileU, tileV);
        #ifdef TILE_BLEND
            let nextTile = ceil(vertexInputs.uvTile);
            let nextU = (nextTile % tc.x) / tc.x;
            let nextV = 1.0 - floor(nextTile / tc.x) / tc.y - 1.0 / tc.y;
            vertexOutputs.vUV2 = quadUV / tc + vec2f(nextU, nextV);
            vertexOutputs.vTileBlend = fract(vertexInputs.uvTile);
        #endif
    #else
        vertexOutputs.vUV = quadUV;
    #endif

#ifdef UV1
    vertexOutputs.vUV1 = quadUV;
#endif
    vertexOutputs.vColor = vertexInputs.color;
}
`;
