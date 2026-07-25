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

// Varyings
varying vUV: vec2f;
varying vColor: vec4f;
#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif
#ifdef SOFT_PARTICLES
varying projPosition: vec4f;
varying linearDepth: f32;
#endif

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let lengthFactor = vertexInputs.velocity.w;
    let avgSize = (vertexInputs.size.x + vertexInputs.size.y) * 0.5;
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
    let widthOffset = vertexInputs.position.y * normalize(cross(mvPosition.xyz, vdir)) * avgSize;
    // Equivalent to viewVelocity * (1.0 + lengthFactor / vlength) for moving particles, but the
    // size-based term (vdir * lengthFactor) survives when the velocity contribution vanishes.
    let lengthOffset = (vertexInputs.position.x + 0.5) * (viewVelocity + vdir * lengthFactor) * avgSize;
    let stretched = mvPosition.xyz + widthOffset - lengthOffset;
    mvPosition.x = stretched.x;
    mvPosition.y = stretched.y;
    mvPosition.z = stretched.z;

    let clipPosition = uniforms.projection * mvPosition;
    vertexOutputs.position = clipPosition;
#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    vertexOutputs.linearDepth = -mvPosition.z;
#endif

    #ifdef UV_TILE
        let tc = vec2f(uniforms.tileCountX, uniforms.tileCountY);
        let baseTile = floor(vertexInputs.uvTile);
        let tileU = (baseTile % tc.x) / tc.x;
        let tileV = 1.0 - floor(baseTile / tc.x) / tc.y - 1.0 / tc.y;
        vertexOutputs.vUV = vertexInputs.uv / tc + vec2f(tileU, tileV);
        #ifdef TILE_BLEND
            let nextTile = ceil(vertexInputs.uvTile);
            let nextU = (nextTile % tc.x) / tc.x;
            let nextV = 1.0 - floor(nextTile / tc.x) / tc.y - 1.0 / tc.y;
            vertexOutputs.vUV2 = vertexInputs.uv / tc + vec2f(nextU, nextV);
            vertexOutputs.vTileBlend = fract(vertexInputs.uvTile);
        #endif
    #else
        vertexOutputs.vUV = vertexInputs.uv;
    #endif

    vertexOutputs.vColor = vertexInputs.color;
}
`;
